// Toplama işinin veritabanı yazma katmanı (yalnızca sunucu/cron).
import { REVERIFY_AFTER_DAYS } from "../config/limits.ts";
import type { SalesSnapshot } from "../dtc/sales.ts";
import type { VerifyResult } from "../dtc/verify.ts";
import type { Candidate, SeenItem } from "../sources/types.ts";
import { db } from "./db.ts";
import { normalizeName } from "./productName.ts";
import { trendScore, type MentionLite } from "./score.ts";
import { winnerScore } from "./winner.ts";

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
      .update({ last_seen_at: now, ...marketplaceEvidence })
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
  dtc_status: "verified" | "rejected_marketplace" | "unverified";
  brands: { marketplace_status: "clean" | "found" | null; marketplace_evidence: string | null; marketplace_checked_at: string | null } | null;
};

/**
 * Hiç kontrol edilmemiş (veya geçici hatayla kalmış) ürünler + süresi dolan "verified" ürünler.
 * recheckAll: doğrulama kuralları değiştiğinde tüm "verified" ürünler tarihe bakılmadan yeniden kontrol edilir.
 */
export async function productsToVerify(limit: number, recheckAll = false): Promise<ProductToVerify[]> {
  const stale = new Date(recheckAll ? Date.now() + 86_400_000 : Date.now() - REVERIFY_AFTER_DAYS * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("products")
    .select("id, name, brand_domain, product_url, dtc_status, brands(marketplace_status, marketplace_evidence, marketplace_checked_at)")
    .or(`dtc_checked_at.is.null,and(dtc_status.eq.verified,dtc_checked_at.lt.${stale})`)
    .order("dtc_checked_at", { ascending: true, nullsFirst: true })
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  return data as unknown as ProductToVerify[];
}

export async function saveVerification(p: ProductToVerify, r: VerifyResult): Promise<void> {
  const now = new Date().toISOString();
  // Geçici sonuçlarda (kota, ağ hatası) tarih boş kalır → sonraki çalıştırmada yeniden denenir.
  // Önceden doğrulanmış bir ürün yalnızca geçici bir hata yüzünden listeden düşmez: durumu ve gerekçesi korunur.
  const keepPrevious = r.retryable && p.dtc_status === "verified";
  const update: Record<string, unknown> = keepPrevious
    ? { dtc_checked_at: null }
    : { dtc_status: r.status, dtc_reason: r.reason, dtc_checked_at: r.retryable ? null : now };
  if (r.name && r.name.length >= 3 && r.name.length <= 150) update.name = r.name;
  if (r.productUrl) update.product_url = r.productUrl;
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
    await saveSnapshot(p.id, { ...r.sales, price: Number.isNaN(r.sales.price) ? null : r.sales.price });
  }

  const brand: Record<string, unknown> = {};
  if (r.platform) Object.assign(brand, { platform: r.platform, has_checkout: r.hasCheckout, check_reason: r.reason, checked_at: now });
  if (r.store.country) brand.country = r.store.country;
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
export async function saveSnapshot(productId: string, s: SalesSnapshot): Promise<void> {
  const { error } = await db().from("product_snapshots").upsert(
    {
      product_id: productId,
      day: today(),
      price: s.price,
      currency: s.currency,
      review_count: s.reviewCount,
      rating: s.rating,
      availability: s.availability,
    },
    { onConflict: "product_id,day" },
  );
  if (error) throw new Error(`product_snapshots yazılamadı: ${error.message}`);
  const update: Record<string, string | number> = {};
  if (s.price !== null) update.price = s.price;
  if (s.currency) update.currency = s.currency;
  if (s.reviewCount !== null) update.review_count = s.reviewCount;
  if (s.rating !== null) update.rating = s.rating;
  if (s.availability) update.availability = s.availability;
  if (Object.keys(update).length === 0) return;
  const { error: upErr } = await db().from("products").update(update).eq("id", productId);
  if (upErr) throw new Error(`products güncellenemedi: ${upErr.message}`);
}

/** Bugün ölçümü alınmamış doğrulanmış ürünler ile favori/incelenecek listesindekiler. */
export async function productsToSnapshot(limit: number): Promise<{ id: string; name: string; product_url: string }[]> {
  const [verified, tracked, done] = await Promise.all([
    db().from("products").select("id, name, product_url").eq("dtc_status", "verified").not("product_url", "is", null),
    db().from("products").select("id, name, product_url, tracking!inner(status)").in("tracking.status", ["favorite", "review"]).not("product_url", "is", null),
    db().from("product_snapshots").select("product_id").eq("day", today()),
  ]);
  for (const r of [verified, tracked, done]) if (r.error) throw new Error(`ölçüm listesi okunamadı: ${r.error.message}`);
  const skip = new Set(done.data!.map((d) => d.product_id as string));
  const byId = new Map<string, { id: string; name: string; product_url: string }>();
  for (const p of [...verified.data!, ...tracked.data!]) {
    if (!skip.has(p.id)) byId.set(p.id, { id: p.id, name: p.name, product_url: p.product_url });
  }
  return [...byId.values()].slice(0, limit);
}

export async function brandDomains(): Promise<string[]> {
  const { data, error } = await db().from("brands").select("domain");
  if (error) throw new Error(`brands okunamadı: ${error.message}`);
  return data.map((b) => b.domain as string);
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
  const [products, snaps, ranks] = await Promise.all([
    db().from("products").select("id, brand_domain, review_count, rating, price, currency, trend_score, score_breakdown"),
    db().from("product_snapshots").select("product_id, day, review_count").gte("day", since),
    db().from("traffic_ranks").select("domain, day, rank").gte("day", since),
  ]);
  for (const r of [products, snaps, ranks]) if (r.error) throw new Error(`winner verisi okunamadı: ${r.error.message}`);
  const group = <T, K extends keyof T>(rows: T[], key: K) => {
    const m = new Map<T[K], T[]>();
    for (const row of rows) m.set(row[key], [...(m.get(row[key]) ?? []), row]);
    return m;
  };
  const snapsBy = group(snaps.data as { product_id: string; day: string; review_count: number | null }[], "product_id");
  const ranksBy = group(ranks.data as { domain: string; day: string; rank: number | null }[], "domain");

  for (const p of products.data!) {
    const { score, breakdown } = winnerScore({
      reviewCount: p.review_count,
      rating: p.rating === null ? null : Number(p.rating),
      price: p.price === null ? null : Number(p.price),
      currency: p.currency,
      trendScore: Number(p.trend_score),
      mentions7d: (p.score_breakdown as { m7?: number } | null)?.m7 ?? 0,
      ranks: ranksBy.get(p.brand_domain) ?? [],
      snapshots: snapsBy.get(p.id) ?? [],
    });
    const { error } = await db().from("products").update({ winner_score: score, winner_breakdown: breakdown, momentum_score: breakdown.momentum.score }).eq("id", p.id);
    if (error) throw new Error(`winner skoru yazılamadı: ${error.message}`);
  }
  return products.data!.length;
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
  const { data, error } = await db().from("products").select("id, trend_score, mentions(source, posted_at)");
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  let updated = 0;
  for (const p of data as { id: string; trend_score: number; mentions: MentionLite[] }[]) {
    const { score, breakdown } = trendScore(p.mentions);
    const { error: upErr } = await db().from("products").update({ trend_score: score, score_breakdown: breakdown }).eq("id", p.id);
    if (upErr) throw new Error(`skor yazılamadı: ${upErr.message}`);
    if (Number(p.trend_score) !== score) updated++;
  }
  return { updated, total: data.length };
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
