// Toplama işinin veritabanı yazma katmanı (yalnızca sunucu/cron).
import {
  BIG_BRAND_MAX_RANK,
  REVERIFY_AFTER_DAYS,
  SALES_DAILY_HOURS,
  SALES_HOT_HOURS,
  SALES_HOT_SCORE,
  SALES_REST_DAYS,
  SUPPLIER_REFRESH_DAYS,
  WIDE_RETRY_DAYS,
} from "../config/limits.ts";
import { stockEvents, type StockEvents } from "../dtc/stock.ts";
import type { SalesSnapshot } from "../dtc/sales.ts";
import { isImageMatch, type SupplierResult } from "../dtc/suppliers.ts";
import { bigBrandReason, WIDE_PENDING, type VerifyResult } from "../dtc/verify.ts";
import type { Candidate, SeenItem } from "../sources/types.ts";
import { adPointsByDomain } from "./ads.ts";
import { itemKeyFromUrl, itemSignals } from "./storeItems.ts";
import { allRows, db } from "./db.ts";
import { normalizeName } from "./productName.ts";
import { clip } from "./text.ts";
import { trendScore, type MentionLite } from "./score.ts";
import { soldPerWeek, supplierEconomics, winnerScore } from "./winner.ts";

/** Geniş arama bekleyen doğrulamaların gerekçesindeki ayırt edici parça ("Geniş arama bekliyor"). */
const WIDE_PENDING_TAG = WIDE_PENDING.split(" (")[0];

export async function filterNewItemIds(source: string, ids: string[]): Promise<Set<string>> {
  const fresh = new Set(ids);
  if (ids.length === 0) return fresh;
  const { data, error } = await db().from("seen_items").select("source_item_id").eq("source", source).in("source_item_id", ids);
  if (error) throw new Error(`seen_items okunamadı: ${error.message}`);
  for (const row of data) fresh.delete(row.source_item_id);
  return fresh;
}

export async function markSeen(source: string, items: SeenItem[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await db()
    .from("seen_items")
    .upsert(
      items.map((i) => ({ source, source_item_id: i.sourceItemId, outcome: i.outcome })),
      { onConflict: "source,source_item_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`seen_items yazılamadı: ${error.message}`);
}

/** Aynı markada aynı ürün sayfasına işaret eden kayıt varsa onu kullanır (farklı blog başlıklarını birleştirir). */
async function findByProductUrl(brandDomain: string, productUrl: string): Promise<string | null> {
  if (new URL(productUrl).pathname.length <= 1) return null;
  const { data, error } = await db()
    .from("products")
    .select("id")
    .eq("brand_domain", brandDomain)
    .eq("product_url", productUrl)
    .limit(1);
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  return data[0]?.id ?? null;
}

export async function saveCandidate(c: Candidate): Promise<{ productId: string; created: boolean }> {
  const { error: brandErr } = await db().from("brands").upsert({ domain: c.brandDomain }, { onConflict: "domain", ignoreDuplicates: true });
  if (brandErr) throw new Error(`brands yazılamadı: ${brandErr.message}`);

  const now = new Date().toISOString();
  const marketplaceEvidence =
    c.marketplaceLinks.length > 0
      ? {
          dtc_status: "rejected_marketplace",
          dtc_reason: `Kaynak yazı ürünü pazaryerinde gösteriyor: ${c.marketplaceLinks[0]}`,
          dtc_checked_at: now,
        }
      : {};

  let productId = await findByProductUrl(c.brandDomain, c.productUrl);
  const created = productId === null;
  if (productId) {
    const { error } = await db()
      .from("products")
      .update({ last_seen_at: now, ...marketplaceEvidence, ...(c.priority !== undefined ? { verify_priority: c.priority } : {}) })
      .eq("id", productId);
    if (error) throw new Error(`products güncellenemedi: ${error.message}`);
  } else {
    const { data, error } = await db()
      .from("products")
      .upsert(
        {
          brand_domain: c.brandDomain,
          name: c.productName,
          normalized_name: normalizeName(c.productName),
          product_url: c.productUrl,
          image_url: c.imageUrl,
          category: c.category,
          last_seen_at: now,
          verify_priority: c.priority ?? 50,
          ...marketplaceEvidence,
        },
        { onConflict: "brand_domain,normalized_name" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`products yazılamadı: ${error.message}`);
    productId = data.id as string;
  }

  const { error: mentionErr } = await db().from("mentions").upsert(
    {
      product_id: productId,
      source: c.source,
      source_item_id: c.sourceItemId,
      url: c.sourceUrl,
      title: c.title,
      engagement: c.engagement,
      comments: c.comments,
      posted_at: c.postedAt.toISOString(),
    },
    { onConflict: "source,source_item_id", ignoreDuplicates: true },
  );
  if (mentionErr) throw new Error(`mentions yazılamadı: ${mentionErr.message}`);

  return { productId: productId!, created };
}

export type ProductToVerify = {
  id: string;
  name: string;
  brand_domain: string;
  product_url: string | null;
  dtc_status: "verified" | "rejected_marketplace" | "rejected_big_brand" | "unverified";
  dtc_reason?: string | null;
  brands: {
    marketplace_status: "clean" | "found" | null;
    marketplace_evidence: string | null;
    marketplace_checked_at: string | null;
    tranco_rank: number | null;
    country: string | null;
  } | null;
  mentions: { source: string }[];
};

/**
 * Hiç kontrol edilmemiş (veya geçici hatayla kalmış) ürünler + süresi dolan "verified" ürünler.
 * recheckAll: doğrulama kuralları değiştiğinde tüm "verified" ürünler tarihe bakılmadan yeniden kontrol edilir.
 */
export async function productsToVerify(limit: number, recheckAll = false): Promise<ProductToVerify[]> {
  const stale = new Date(recheckAll ? Date.now() + 86_400_000 : Date.now() - REVERIFY_AFTER_DAYS * 86_400_000).toISOString();
  const wideDue = new Date(Date.now() - WIDE_RETRY_DAYS * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("products")
    .select("id, name, brand_domain, product_url, dtc_status, dtc_reason, brands(marketplace_status, marketplace_evidence, marketplace_checked_at, tranco_rank, country), mentions(source)")
    // Yeni ürünler önce (tarihi boş); sonra geniş araması kotadan dolayı bekleyen doğrulanmışlar (2 günde bir) ve süresi dolanlar.
    .or(`dtc_checked_at.is.null,and(dtc_status.eq.verified,dtc_checked_at.lt.${stale}),and(dtc_status.eq.verified,dtc_reason.like.*${WIDE_PENDING_TAG}*,dtc_checked_at.lt.${wideDue})`)
    .order("dtc_checked_at", { ascending: true, nullsFirst: true })
    .order("verify_priority", { ascending: false })
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  return data as unknown as ProductToVerify[];
}

/** Marka sitesine hiç bağlanılamadı (DNS/bağlantı hatası; 429 ve 5xx gibi sunucu yanıtları değil). */
export function isNetworkFailure(reason: string): boolean {
  return reason.startsWith("Marka sitesi okunamadı") && reason.includes("ağ hatası");
}

export async function saveVerification(p: ProductToVerify, r: VerifyResult): Promise<void> {
  const now = new Date().toISOString();
  // Geçici sonuçlarda (kota, ağ hatası) tarih boş kalır → sonraki çalıştırmada yeniden denenir.
  // Önceden doğrulanmış bir ürün yalnızca geçici bir hata yüzünden listeden düşmez: durumu ve gerekçesi korunur.
  // Doğrudan pazaryeri araması temiz, yalnızca Tavily geniş araması kotadan dolayı bekliyor: ürün doğrulanmış sayılır ve
  // kuyruktan çıkar (tarih yazılır); geniş arama 2 günde bir arka planda denenir. Eskiden tarih boş kalıyor, bu ürünler her
  // gün kuyruğun başına dönüp yeni ürünlerin sırasını yiyordu.
  const widePending = r.status === "verified" && r.reason.includes(WIDE_PENDING_TAG);
  const keepPrevious = r.retryable && !widePending && p.dtc_status === "verified";
  // Hiç doğrulanamamış bir marka sitesine üst üste iki kez bağlanılamadıysa (DNS yok, alan adı kapanmış) ürün her çalıştırmada
  // kuyruğun başına dönmez: tarih yazılır, yeniden denenmez (mağaza kontrolü alan adını ayrıca izler).
  const deadSite = r.retryable && p.dtc_status === "unverified" && isNetworkFailure(r.reason) && isNetworkFailure(p.dtc_reason ?? "");
  const update: Record<string, unknown> = keepPrevious
    ? { dtc_checked_at: null }
    : { dtc_status: r.status, dtc_reason: r.reason, dtc_checked_at: r.retryable && !widePending && !deadSite ? null : now };
  if (r.name && r.name.length >= 3 && r.name.length <= 150) update.name = r.name;
  if (r.productUrl) update.product_url = r.productUrl;
  if (r.productType) update.product_type = r.productType;
  if (r.imageUrl && /^https?:\/\//.test(r.imageUrl)) update.image_url = r.imageUrl;
  else if (r.imageUrl?.startsWith("//")) update.image_url = `https:${r.imageUrl}`;
  // Satışa dair işaretler yalnızca okunabildiyse yazılır (eski değer silinmez).
  const sales: Record<string, string | number | null> = {
    price: r.sales.price,
    currency: r.sales.currency,
    review_count: r.sales.reviewCount,
    rating: r.sales.rating,
    availability: r.sales.availability,
    launched_at: r.sales.launchedAt,
    variant_count: r.sales.variantCount,
  };
  for (const [k, v] of Object.entries(sales)) {
    if (v !== null && !(typeof v === "number" && Number.isNaN(v))) update[k] = v;
  }

  const { error } = await db().from("products").update(update).eq("id", p.id);
  if (error) throw new Error(`products güncellenemedi: ${error.message}`);
  if (r.status === "verified" && (r.sales.reviewCount !== null || r.sales.price !== null)) {
    await saveDailyPoint(p.id, { ...r.sales, price: Number.isNaN(r.sales.price) ? null : r.sales.price });
  }

  const brand: Record<string, unknown> = {};
  if (r.platform) Object.assign(brand, { platform: r.platform, has_checkout: r.hasCheckout, check_reason: r.reason, checked_at: now });
  // Türkiye yalnızca TL ile satan (Türkiye pazarına satan) markalara yazılır; Türkiye'de kayıtlı ama euro/dolarla satan marka Türk sayılmaz.
  if (r.store.country) brand.country = r.store.country === "TR" && r.sales.currency && r.sales.currency !== "TRY" ? null : r.store.country;
  if (r.store.shipsToTr !== null) brand.ships_to_tr = r.store.shipsToTr;
  if (r.brandCheck) {
    Object.assign(brand, {
      marketplace_status: r.brandCheck.status,
      marketplace_evidence: r.brandCheck.evidence,
      marketplace_checked_at: now,
    });
  }
  if (Object.keys(brand).length > 0) {
    const { error: brandErr } = await db().from("brands").update(brand).eq("domain", p.brand_domain);
    if (brandErr) throw new Error(`brands güncellenemedi: ${brandErr.message}`);
  }
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Günlük satış ölçümü (grafikler ve satış hızı için); ürünün güncel değerlerini de yeniler. */
/** Doğrulama sırasında okunan fiyat/yorum: günün satırına yazılır (stok ölçümü ve ölçüm zamanı değişmez). */
async function saveDailyPoint(productId: string, s: SalesSnapshot): Promise<void> {
  const row: Record<string, unknown> = { product_id: productId, day: today(), price: s.price, currency: s.currency, availability: s.availability };
  if (s.reviewCount !== null) row.review_count = s.reviewCount;
  if (s.rating !== null) row.rating = s.rating;
  const { error } = await db().from("product_snapshots").upsert(row, { onConflict: "product_id,day" });
  if (error) throw new Error(`product_snapshots yazılamadı: ${error.message}`);
}

/**
 * Ölçümü kaydeder. Gün içindeki ölçümler aynı satırda birikir: tükenen / yeniden gelen varyant ve satılan adet önceki
 * ölçüme (products'taki son durum) göre eklenir; fiyat değiştiyse önceki fiyat ve değişim zamanı ürüne yazılır.
 */
export async function saveSnapshot(p: SnapshotTarget, s: SalesSnapshot): Promise<StockEvents> {
  const day = today();
  const now = new Date().toISOString();
  const cur = { price: s.price, variantsAvailable: s.variantsAvailable ?? null, variantsTotal: s.variantsTotal ?? null, inventory: s.inventory ?? null, currency: s.currency };
  const prev = p.last_measured_at
    ? { price: p.price === null ? null : Number(p.price), variantsAvailable: p.variants_available, variantsTotal: p.variants_total, inventory: p.inventory, currency: p.currency }
    : null;
  const ev = stockEvents(prev, cur);
  const { data: row, error: rErr } = await db()
    .from("product_snapshots")
    .select("checks, sold_out, restocked, units_sold, review_count, rating")
    .eq("product_id", p.id)
    .eq("day", day)
    .maybeSingle();
  if (rErr) throw new Error(`product_snapshots okunamadı: ${rErr.message}`);
  const { error } = await db().from("product_snapshots").upsert(
    {
      product_id: p.id,
      day,
      price: s.price,
      currency: s.currency,
      review_count: s.reviewCount ?? row?.review_count ?? null,
      rating: s.rating ?? row?.rating ?? null,
      availability: s.availability,
      compare_at: s.compareAt ?? null,
      variants_available: cur.variantsAvailable,
      variants_total: cur.variantsTotal,
      inventory: cur.inventory,
      stock_tracked: s.stockTracked ?? null,
      measured_at: now,
      checks: (row?.checks ?? 0) + 1,
      sold_out: (row?.sold_out ?? 0) + ev.soldOut,
      restocked: (row?.restocked ?? 0) + ev.restocked,
      units_sold: (row?.units_sold ?? 0) + ev.unitsSold,
    },
    { onConflict: "product_id,day" },
  );
  if (error) throw new Error(`product_snapshots yazılamadı: ${error.message}`);
  const update: Record<string, string | number | boolean | null> = {
    last_measured_at: now,
    compare_at: s.compareAt ?? null,
    variants_available: cur.variantsAvailable,
    variants_total: cur.variantsTotal,
    inventory: cur.inventory,
  };
  if (s.stockTracked !== null && s.stockTracked !== undefined) update.stock_tracked = s.stockTracked;
  update.measure_fails = 0;
  update.measure_error = null;
  if (s.price !== null) update.price = s.price;
  if (ev.priceChanged) {
    update.price_prev = prev!.price;
    update.price_changed_at = now;
  }
  if (s.currency) update.currency = s.currency;
  if (s.reviewCount !== null) update.review_count = s.reviewCount;
  if (s.rating !== null) update.rating = s.rating;
  if (s.availability) update.availability = s.availability;
  const { error: upErr } = await db().from("products").update(update).eq("id", p.id);
  if (upErr) throw new Error(`products güncellenemedi: ${upErr.message}`);
  return ev;
}

/** Ölçüm okunamadı: son deneme ve art arda başarısızlık sayısı yazılır (sıra hesabında kullanılır). */
export async function markMeasureFailed(p: SnapshotTarget, reason: string): Promise<void> {
  const { error } = await db()
    .from("products")
    .update({ measure_failed_at: new Date().toISOString(), measure_fails: (p.measure_fails ?? 0) + 1, measure_error: reason.slice(0, 200) })
    .eq("id", p.id);
  if (error) throw new Error(`products güncellenemedi: ${error.message}`);
}

export type SnapshotTarget = {
  id: string;
  name: string;
  product_url: string;
  price: number | null;
  currency?: string | null;
  variants_available: number | null;
  variants_total: number | null;
  inventory: number | null;
  last_measured_at: string | null;
  winner_score: number | null;
  measure_failed_at?: string | null;
  measure_fails?: number;
};

/**
 * Ölçüm sırası: winner ürünler (skor ≥ 40) ve favori/incelenecekler 10 saatte bir, diğer doğrulanmışlar günde bir,
 * doğrulanmamış adaylar 3 günde bir. Önce hiç ölçülmemişler, sonra winner skoru yüksek olanlar. Okunamayan ürün (kaldırıldı,
 * alan adı kapandı) son denemeden itibaren aynı aralıkla, art arda 3 kez okunamadıysa haftada bir yeniden denenir.
 */
export async function productsToSnapshot(limit: number, now = Date.now()): Promise<SnapshotTarget[]> {
  const cols = "id, name, product_url, price, currency, variants_available, variants_total, inventory, last_measured_at, winner_score, dtc_status, measure_failed_at, measure_fails";
  const [products, tracked] = await Promise.all([
    allRows((a, b) =>
      db().from("products").select(cols).in("dtc_status", ["verified", "unverified"]).not("product_url", "is", null).order("id").range(a, b),
    ),
    allRows((a, b) => db().from("tracking").select("product_id").in("status", ["favorite", "review"]).order("product_id").range(a, b)),
  ]);
  for (const r of [products, tracked]) if (r.error) throw new Error(`ölçüm listesi okunamadı: ${r.error.message}`);
  const watched = new Set(tracked.data!.map((t) => t.product_id as string));
  const missing = [...watched].filter((id) => !products.data!.some((p) => p.id === id));
  const extra = missing.length
    ? ((await db().from("products").select(cols).in("id", missing.slice(0, 500)).not("product_url", "is", null)).data ?? [])
    : [];
  const H = 3_600_000;
  const due: { p: SnapshotTarget; tier: number }[] = [];
  for (const p of [...products.data!, ...extra] as (SnapshotTarget & { dtc_status: string })[]) {
    const hot = watched.has(p.id) || Number(p.winner_score ?? 0) >= SALES_HOT_SCORE;
    const tier = hot ? 0 : p.dtc_status === "verified" ? 1 : 2;
    const fails = p.measure_fails ?? 0;
    const every = fails >= 3 ? 7 * 24 * H : tier === 0 ? SALES_HOT_HOURS * H : tier === 1 ? SALES_DAILY_HOURS * H : SALES_REST_DAYS * 24 * H;
    const last = Math.max(p.last_measured_at ? Date.parse(p.last_measured_at) : 0, p.measure_failed_at ? Date.parse(p.measure_failed_at) : 0);
    if (!last || now - last >= every) due.push({ p, tier: fails >= 3 ? 3 : tier });
  }
  return due
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(Boolean(a.p.last_measured_at)) - Number(Boolean(b.p.last_measured_at)) ||
        Number(b.p.winner_score ?? 0) - Number(a.p.winner_score ?? 0),
    )
    .slice(0, limit)
    .map((d) => d.p);
}

export async function brandDomains(): Promise<string[]> {
  const { data, error } = await allRows((a, b) => db().from("brands").select("domain").order("domain").range(a, b));
  if (error) throw new Error(`brands okunamadı: ${error.message}`);
  return data!.map((b) => b.domain as string);
}

export async function latestTrafficDay(): Promise<string | null> {
  const { data, error } = await db().from("traffic_ranks").select("day").order("day", { ascending: false }).limit(1);
  if (error) throw new Error(`traffic_ranks okunamadı: ${error.message}`);
  return (data[0]?.day as string | undefined) ?? null;
}

/** Listedeki günün sıraları; listede olmayan markalar için rank null yazılır. */
export async function saveTrafficRanks(day: string, domains: string[], ranks: Map<string, number>): Promise<void> {
  if (domains.length === 0) return;
  const rows = domains.map((domain) => ({ domain, day, rank: ranks.get(domain) ?? null }));
  const { error } = await db().from("traffic_ranks").upsert(rows, { onConflict: "domain,day" });
  if (error) throw new Error(`traffic_ranks yazılamadı: ${error.message}`);
  for (const r of rows) {
    const { error: bErr } = await db().from("brands").update({ tranco_rank: r.rank, tranco_day: day }).eq("domain", r.domain);
    if (bErr) throw new Error(`brands güncellenemedi: ${bErr.message}`);
  }
}

/** Tüm ürünlerin winner skorunu satış ölçümleri, trafik sırası ve trend skorundan yeniden hesaplar. */
export async function updateWinnerScores(): Promise<number> {
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const [products, snaps, ranks, ads, items, stores] = await Promise.all([
    allRows((a, b) =>
      db()
        .from("products")
        .select("id, brand_domain, product_url, review_count, rating, price, currency, trend_score, score_breakdown, supplier_min_usd, margin_ratio, supplier_sold, supplier_sold_per_week, supplier_image_match")
        .order("id")
        .range(a, b),
    ),
    allRows((a, b) => db().from("product_snapshots").select("product_id, day, review_count").gte("day", since).order("product_id").order("day").range(a, b)),
    allRows((a, b) => db().from("traffic_ranks").select("domain, day, rank").gte("day", since).order("domain").order("day").range(a, b)),
    adPointsByDomain(),
    itemSignals(),
    allRows((a, b) => db().from("stores").select("domain, stock_drops, copy_count, copy_same_seller").or("stock_drops.gt.0,copy_count.gt.0").order("domain").range(a, b)),
  ]);
  for (const r of [products, snaps, ranks, stores]) if (r.error) throw new Error(`winner verisi okunamadı: ${r.error.message}`);
  const storeBy = new Map((stores.data as { domain: string; stock_drops: number; copy_count: number; copy_same_seller: boolean }[]).map((s) => [s.domain, s]));
  const group = <T, K extends keyof T>(rows: T[], key: K) => {
    const m = new Map<T[K], T[]>();
    for (const row of rows) m.set(row[key], [...(m.get(row[key]) ?? []), row]);
    return m;
  };
  const snapsBy = group(snaps.data as { product_id: string; day: string; review_count: number | null }[], "product_id");
  const ranksBy = group(ranks.data as { domain: string; day: string; rank: number | null }[], "domain");

  for (const p of products.data!) {
    const key = itemKeyFromUrl(p.product_url);
    const item = key ? items.get(key) : undefined;
    const { score, breakdown } = winnerScore({
      reviewCount: p.review_count,
      rating: p.rating === null ? null : Number(p.rating),
      price: p.price === null ? null : Number(p.price),
      currency: p.currency,
      trendScore: Number(p.trend_score),
      mentions7d: (p.score_breakdown as { m7?: number } | null)?.m7 ?? 0,
      ranks: ranksBy.get(p.brand_domain) ?? [],
      snapshots: snapsBy.get(p.id) ?? [],
      supplierMinUsd: p.supplier_min_usd === null ? null : Number(p.supplier_min_usd),
      marginRatio: p.margin_ratio === null ? null : Number(p.margin_ratio),
      adPoints: ads.get(p.brand_domain)?.points ?? 0,
      adScore: ads.get(p.brand_domain)?.score ?? 0,
      newAds14d: ads.get(p.brand_domain)?.newAds14d ?? 0,
      stockDrops: storeBy.get(p.brand_domain)?.stock_drops ?? 0,
      supplierSold: p.supplier_sold,
      supplierSoldPerWeek: p.supplier_sold_per_week === null ? null : Number(p.supplier_sold_per_week),
      supplierByImage: p.supplier_image_match,
      independentCopies: storeBy.get(p.brand_domain)?.copy_same_seller ? 0 : (storeBy.get(p.brand_domain)?.copy_count ?? 0),
      productStockDrops: item?.so ?? null,
      productCopies: item?.copies ?? null,
    });
    const { error } = await db().from("products").update({ winner_score: score, winner_breakdown: breakdown, momentum_score: breakdown.momentum.score }).eq("id", p.id);
    if (error) throw new Error(`winner skoru yazılamadı: ${error.message}`);
  }
  return products.data!.length;
}

/** Verilen gün listesinde sırası kaydedilmemiş markalar (yeni eklenenler). */
export async function brandsWithoutRank(day: string): Promise<string[]> {
  const [all, ranked] = await Promise.all([
    brandDomains(),
    allRows((a, b) => db().from("traffic_ranks").select("domain").eq("day", day).order("domain").range(a, b)),
  ]);
  if (ranked.error) throw new Error(`traffic_ranks okunamadı: ${ranked.error.message}`);
  const have = new Set(ranked.data!.map((r) => r.domain as string));
  return all.filter((d) => !have.has(d));
}

/** Sitesi dünya sıralamasında üst sıralarda olan markaların ürünlerini "Büyük marka" olarak eler (ağ isteği yok). */
export async function rejectBigBrands(): Promise<number> {
  const { data: brands, error } = await db()
    .from("brands")
    .select("domain, tranco_rank")
    .not("tranco_rank", "is", null)
    .lte("tranco_rank", BIG_BRAND_MAX_RANK);
  if (error) throw new Error(`brands okunamadı: ${error.message}`);
  let total = 0;
  for (const b of brands) {
    const { error: upErr, count } = await db()
      .from("products")
      .update({ dtc_status: "rejected_big_brand", dtc_reason: bigBrandReason(b.tranco_rank), dtc_checked_at: new Date().toISOString() }, { count: "exact" })
      .eq("brand_domain", b.domain)
      .neq("dtc_status", "rejected_big_brand");
    if (upErr) throw new Error(`products güncellenemedi: ${upErr.message}`);
    total += count ?? 0;
  }
  return total;
}

export type ProductToSource = {
  id: string;
  name: string;
  brand_domain: string;
  product_type: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  product_url: string | null;
  /** Yeni mağaza keşfinden geldi (adı markayla başlamaz). */
  from_store: boolean;
  /** Mağaza ülkesi (ürün adının dilini tahmin etmek için). */
  country: string | null;
};

/** Toptancı araması: doğrulanmış ve favori/incelenecek ürünlerden hiç aranmamış ya da süresi dolanlar (all: hepsi). */
export async function productsToSource(limit: number, all = false): Promise<ProductToSource[]> {
  const stale = new Date(Date.now() - SUPPLIER_REFRESH_DAYS * 86_400_000).toISOString();
  const cols = "id, name, brand_domain, product_type, price, currency, image_url, product_url, mentions(source), brands(country)";
  const due = `supplier_checked_at.is.null,supplier_checked_at.lt.${stale}`;
  let verifiedQ = db().from("products").select(cols).eq("dtc_status", "verified");
  let trackedQ = db().from("products").select(`${cols}, tracking!inner(status)`).in("tracking.status", ["favorite", "review"]);
  if (!all) {
    verifiedQ = verifiedQ.or(due);
    trackedQ = trackedQ.or(due);
  }
  const [verified, tracked] = await Promise.all([verifiedQ.limit(limit), trackedQ.limit(limit)]);
  for (const r of [verified, tracked]) if (r.error) throw new Error(`toptancı listesi okunamadı: ${r.error.message}`);
  const byId = new Map<string, ProductToSource>();
  type Row = Omit<ProductToSource, "from_store" | "country"> & { mentions: { source: string }[]; brands: { country: string | null } | null };
  for (const p of [...verified.data!, ...tracked.data!] as unknown as Row[]) {
    const { id, name, brand_domain, product_type, price, currency, image_url, product_url, mentions, brands } = p;
    const from_store = mentions.length > 0 && mentions.every((m) => m.source === "yenimagaza");
    byId.set(id, { id, name, brand_domain, product_type, price, currency, image_url, product_url, from_store, country: brands?.country ?? null });
  }
  return [...byId.values()].slice(0, limit);
}

/** Toptancı adaylarını yeniler; en iyi eşleşmelerden (benzerlik ≥ %70, fotoğrafla eşleşen varsa yalnızca onlar) en düşük fiyatı ve kâr marjını yazar. */
export async function saveSuppliers(p: ProductToSource, r: SupplierResult): Promise<void> {
  const { error: delErr } = await db().from("suppliers").delete().eq("product_id", p.id);
  if (delErr) throw new Error(`suppliers silinemedi: ${delErr.message}`);
  if (r.offers.length) {
    const { error } = await db().from("suppliers").upsert(
      r.offers.map((o) => ({
        product_id: p.id,
        url: o.url,
        source: o.source,
        title: clip(o.title, 300),
        image_url: o.imageUrl,
        price_min: o.priceMin,
        price_max: o.priceMax,
        currency: o.currency,
        moq: o.moq,
        sold: o.sold,
        supplier_name: o.supplierName,
        similarity: o.similarity,
        image_distance: o.imageDistance,
        rating: o.rating,
      })),
      { onConflict: "product_id,url" },
    );
    if (error) throw new Error(`suppliers yazılamadı: ${error.message}`);
  }
  const { minUsd, margin } = supplierEconomics(r.offers, p.price === null ? null : Number(p.price), p.currency);
  // Satış adedi geçmişi (haftalık satış hızı için). Asıl ilan: fotoğrafla eşleşenlerden en çok satan, yoksa en benzer.
  const day = new Date().toISOString().slice(0, 10);
  const withSold = r.offers.filter((o) => o.sold !== null);
  if (withSold.length) {
    const { error: hErr } = await db()
      .from("supplier_history")
      .upsert(withSold.map((o) => ({ product_id: p.id, url: o.url, day, sold: o.sold, price_min: o.priceMin })), { onConflict: "product_id,url,day" });
    if (hErr) throw new Error(`supplier_history yazılamadı: ${hErr.message}`);
  }
  const byImage = withSold.filter(isImageMatch).sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0));
  const primary = byImage[0] ?? [...withSold].sort((a, b) => b.similarity - a.similarity || (b.sold ?? 0) - (a.sold ?? 0))[0] ?? null;
  let perWeek: number | null = null;
  if (primary) {
    const { data: hist, error: qErr } = await db().from("supplier_history").select("day, sold").eq("product_id", p.id).eq("url", primary.url);
    if (qErr) throw new Error(`supplier_history okunamadı: ${qErr.message}`);
    perWeek = soldPerWeek(hist as { day: string; sold: number | null }[]);
  }
  const { error } = await db()
    .from("products")
    .update({
      supplier_checked_at: new Date().toISOString(),
      supplier_count: r.offers.length,
      supplier_min_usd: minUsd,
      margin_ratio: margin,
      supplier_image_match: r.offers.some(isImageMatch),
      supplier_sold: primary?.sold ?? null,
      supplier_sold_per_week: perWeek,
    })
    .eq("id", p.id);
  if (error) throw new Error(`products güncellenemedi: ${error.message}`);
}

/** Atomik kota sayacı: limit aşılacaksa false döner ve sayaç artmaz. */
export async function tryConsumeQuota(provider: string, daily: number, monthly: number): Promise<boolean> {
  const { data, error } = await db().rpc("try_consume_api_quota", {
    p_provider: provider,
    p_daily_limit: daily,
    p_monthly_limit: monthly,
  });
  if (error) throw new Error(`kota okunamadı: ${error.message}`);
  return data === true;
}

/** Tüm ürünlerin trend skorunu bahsedilmelerden yeniden hesaplar; yalnızca değişenleri yazar. */
export async function updateTrendScores(): Promise<{ updated: number; total: number }> {
  const { data, error } = await allRows((a, b) => db().from("products").select("id, trend_score, mentions(source, posted_at)").order("id").range(a, b));
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  let updated = 0;
  for (const p of data! as { id: string; trend_score: number; mentions: MentionLite[] }[]) {
    const { score, breakdown } = trendScore(p.mentions);
    const { error: upErr } = await db().from("products").update({ trend_score: score, score_breakdown: breakdown }).eq("id", p.id);
    if (upErr) throw new Error(`skor yazılamadı: ${upErr.message}`);
    if (Number(p.trend_score) !== score) updated++;
  }
  return { updated, total: data!.length };
}

/**
 * Katı mod tutarlılığı: pazaryerinde satıldığı tespit edilen markaların daha önce "verified" olmuş
 * ürünlerini de eler. Ağ isteği yapmaz.
 */
export async function propagateBrandRejections(): Promise<number> {
  const { data: brands, error } = await db()
    .from("brands")
    .select("domain, marketplace_evidence")
    .eq("marketplace_status", "found");
  if (error) throw new Error(`brands okunamadı: ${error.message}`);
  let total = 0;
  for (const b of brands) {
    const { error: upErr, count } = await db()
      .from("products")
      .update(
        { dtc_status: "rejected_marketplace", dtc_reason: `Marka pazaryerinde satıyor: ${b.marketplace_evidence ?? ""}` },
        { count: "exact" },
      )
      .eq("brand_domain", b.domain)
      .eq("dtc_status", "verified");
    if (upErr) throw new Error(`products güncellenemedi: ${upErr.message}`);
    total += count ?? 0;
  }
  return total;
}
