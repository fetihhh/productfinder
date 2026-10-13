// Yeni mağaza keşfinin veritabanı katmanı (yalnızca cron).
import { COPY_MIN_STORE_SCORE, NEW_STORE_MAX_AGE_DAYS } from "../config/limits.ts";
import { nextCheck, storeActivity, storeScore, storeScoreParts, type StoreProbe } from "../dtc/storeProbe.ts";
import { nicheOfStore } from "../dtc/niche.ts";
import { mergeSnapshot, type SnapItem } from "../dtc/storeSnapshot.ts";
import { mergeDetail, type ProductDetail } from "../dtc/productDetail.ts";
import { db } from "./db.ts";
import { clip } from "./text.ts";

const DAY = 86_400_000;

export async function getJobState<T>(key: string): Promise<T | null> {
  const { data, error } = await db().from("job_state").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`job_state okunamadı: ${error.message}`);
  return (data?.value as T | undefined) ?? null;
}

export async function setJobState(key: string, value: unknown): Promise<void> {
  const { error } = await db().from("job_state").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`job_state yazılamadı: ${error.message}`);
}

/**
 * Keşfedilen mağazaları ekler (var olanlara dokunmaz); yeni eklenen sayısını döndürür.
 * Günlük listeden gelenler kayıttan 5 gün sonra ilk kez kontrol edilir (ilk günlerde mağazalar genelde kapalıdır).
 */
export async function insertStores(domains: string[], source: string, registeredOn: string | null, platform = "shopify"): Promise<number> {
  const firstCheck = registeredOn ? new Date(Date.parse(registeredOn) + 5 * DAY).toISOString() : new Date().toISOString();
  let inserted = 0;
  for (let i = 0; i < domains.length; i += 500) {
    const rows = domains.slice(i, i + 500).map((domain) => ({ domain, source, registered_on: registeredOn, next_check_at: firstCheck, platform }));
    const { data, error } = await db().from("stores").upsert(rows, { onConflict: "domain", ignoreDuplicates: true }).select("domain");
    if (error) throw new Error(`stores yazılamadı: ${error.message}`);
    inserted += data.length;
  }
  return inserted;
}

export type StoreToCheck = { domain: string; registered_on: string | null; discovered_at: string; first_product_at: string | null; status?: string; platform?: string };

/** Aday ürünü ya da reklamı olan açık mağazalar (kontrol zamanı beklenmez): ürün ayrıntılarını hemen doldurmak için. */
export async function storesForDetail(limit: number): Promise<StoreToCheck[]> {
  const { data, error } = await db()
    .from("stores")
    .select("domain, registered_on, discovered_at, first_product_at, status, platform")
    .eq("status", "live")
    .or("product_id.not.is.null,ad_points.gt.0")
    .order("total_score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  return data as StoreToCheck[];
}

/**
 * Zamanı gelen mağazalar, değere göre sırayla (Shopify kısıtlaması yüzünden her çalıştırmada hepsine yetişilemeyebilir):
 * 1) açık mağazaların takibi (stok/satış hareketi, ürün ayrıntısı), 2) reklam veren ya da aramayla bulunan mağazalar,
 * 3) yeni kayıtlı alan adlarından gelenler. Her grupta en eski zamanlı önce.
 */
export async function storesToCheck(limit: number, source?: string): Promise<StoreToCheck[]> {
  const now = new Date().toISOString();
  const tiers: ((q: ReturnType<typeof dueStores>) => ReturnType<typeof dueStores>)[] = [
    (q) => q.eq("status", "live"),
    (q) => q.neq("status", "live").in("source", ["reklam", "arama"]),
    (q) => q.neq("status", "live").not("source", "in", "(reklam,arama)"),
  ];
  const out: StoreToCheck[] = [];
  for (const tier of tiers) {
    // Supabase tek istekte en fazla 1.000 satır döndürür: sayfa sayfa okunur.
    for (let from = 0; out.length < limit; from += 1000) {
      const want = Math.min(1000, limit - out.length);
      let q = tier(dueStores(now));
      if (source) q = q.eq("source", source);
      const { data, error } = await q
        .order("next_check_at", { ascending: true })
        .order("domain", { ascending: true })
        .range(from, from + want - 1);
      if (error) throw new Error(`stores okunamadı: ${error.message}`);
      out.push(...(data as StoreToCheck[]));
      if ((data ?? []).length < want) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

const dueStores = (now: string) =>
  db()
    .from("stores")
    .select("domain, registered_on, discovered_at, first_product_at, status, platform")
    .in("status", ["pending", "closed", "live"])
    .lte("next_check_at", now);

/** Mağaza yaşı (gün): alan adı kaydı, ilk ürün ya da keşif tarihinden en eskisi. */
export function storeAgeDays(s: { registered_on: string | null; discovered_at: string; first_product_at: string | null }, now = Date.now()): number {
  const dates = [s.registered_on, s.first_product_at, s.discovered_at].filter((d): d is string => Boolean(d)).map((d) => Date.parse(d));
  return (now - Math.min(...dates)) / DAY;
}

export async function saveStoreCheck(s: StoreToCheck, probe: StoreProbe): Promise<{ status: string; score: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: prevRows, error: prevErr } = await db()
    .from("store_checks")
    .select("product_count, available_variants, total_variants")
    .eq("domain", s.domain)
    .eq("status", "live")
    .lt("day", today)
    .order("day", { ascending: false })
    .limit(1);
  if (prevErr) throw new Error(`store_checks okunamadı: ${prevErr.message}`);

  const firstProductAt = probe.state === "live" ? probe.firstProductAt : s.first_product_at;
  const age = storeAgeDays({ ...s, first_product_at: firstProductAt });
  const activity = probe.state === "live" ? storeActivity(prevRows[0] ?? null, probe) : null;
  const score = probe.state === "live" ? storeScore(probe, activity!) : 0;
  const planned = nextCheck(probe.state, age, Date.now(), score);
  // Geçici hata (429, zaman aşımı): açık/kapalı mağaza durumunu korur, ertesi gün yeniden denenir.
  const status = probe.state === "error" && (s.status === "live" || s.status === "closed") ? s.status : planned.status;
  const next = planned.next;
  const update: Record<string, unknown> = { status, next_check_at: next, last_checked_at: new Date().toISOString() };
  if (probe.state === "live") {
    Object.assign(update, {
      shop_name: probe.shopName ? clip(probe.shopName, 120) : null,
      country: probe.country,
      ships_to_tr: probe.shipsToTr,
      currency: probe.currency,
      product_count: probe.productCount,
      physical_count: probe.physicalCount,
      discounted_count: probe.discountedCount,
      dropship_count: probe.dropshipCount,
      apparel_count: probe.apparelCount,
      ali_image_count: probe.aliImageCount,
      hero_ali_id: probe.hero?.aliImageId ?? null,
      min_price: probe.minPrice,
      max_price: probe.maxPrice,
      first_product_at: probe.firstProductAt,
      last_product_at: probe.lastProductAt,
      hero_handle: probe.hero?.handle ?? null,
      hero_title: probe.hero?.title ? clip(probe.hero.title, 200) : null,
      niche: nicheOfStore(probe.hero ? { title: probe.hero.title, productType: probe.hero.productType } : null, probe.products),
      offer: probe.hero?.offer ?? null,
      ...(probe.instagram !== undefined ? { instagram: probe.instagram } : {}),
      ...(probe.tiktok !== undefined ? { tiktok: probe.tiktok } : {}),
      ...(probe.tech ? { tech: probe.tech, tech_at: new Date().toISOString() } : {}),
      hero_image: probe.hero?.image ?? null,
      hero_price: probe.hero?.price ?? null,
      store_score: score,
      score_parts: storeScoreParts(probe, activity!),
    });
    // Ürün bazında hareket yalnızca aday olabilecek mağazalarda izlenir (veritabanı boyutu).
    if (score >= COPY_MIN_STORE_SCORE) {
      const [{ data: snapRow, error: sErr }, { data: tracked }] = await Promise.all([
        db().from("stores").select("products_snapshot, details").eq("domain", s.domain).maybeSingle(),
        db().from("products").select("product_url").eq("brand_domain", s.domain).limit(10),
      ]);
      if (sErr) throw new Error(`stores okunamadı: ${sErr.message}`);
      const { items } = mergeSnapshot((snapRow?.products_snapshot as SnapItem[] | null) ?? null, probe.products, today);
      // Ürün ayrıntıları: öne çıkan ürün, aday ürünler ve stoğu en çok azalan ürünler (en fazla 6).
      const handles = [
        probe.hero?.handle,
        ...((tracked ?? []) as { product_url: string | null }[]).map((r) => r.product_url?.match(/\/products\/([^/?#]+)/)?.[1]),
        ...items.filter((i) => i.so > 0).sort((a, b) => b.so - a.so).slice(0, 3).map((i) => i.h),
      ].filter((h): h is string => Boolean(h));
      const prevDetails = (snapRow?.details as Record<string, ProductDetail> | null) ?? {};
      const details: Record<string, ProductDetail> = {};
      for (const h of [...new Set(handles.map((x) => decodeURIComponent(x)))].slice(0, 6)) {
        const p = probe.products.find((x) => x.handle === h);
        if (p?.detail) details[h] = mergeDetail(prevDetails[h], p.detail, today);
      }
      Object.assign(update, {
        products_snapshot: items,
        stock_drops: items.reduce((n, i) => n + i.so, 0),
        moving_products: items.filter((i) => i.so > 0).length,
        ...(Object.keys(details).length ? { details } : {}),
      });
    }
  }
  const { error } = await db().from("stores").update(update).eq("domain", s.domain);
  if (error) throw new Error(`stores güncellenemedi: ${error.message}`);
  if (probe.state !== "error") {
    const { error: rpcErr } = await db().rpc("increment_store_checks", { p_domain: s.domain });
    if (rpcErr) throw new Error(`kontrol sayacı artırılamadı: ${rpcErr.message}`);
  }

  if (probe.state !== "error") {
    const { error: cErr } = await db().from("store_checks").upsert(
      {
        domain: s.domain,
        day: today,
        status: probe.state,
        product_count: probe.state === "live" ? probe.productCount : null,
        available_variants: probe.state === "live" ? probe.availableVariants : null,
        total_variants: probe.state === "live" ? probe.totalVariants : null,
      },
      { onConflict: "domain,day" },
    );
    if (cErr) throw new Error(`store_checks yazılamadı: ${cErr.message}`);
  }
  return { status, score };
}

export type StoreToPromote = {
  country: string | null;
  currency: string | null;
  domain: string;
  shop_name: string | null;
  hero_handle: string;
  hero_title: string;
  hero_image: string | null;
  first_product_at: string | null;
  store_score: number;
};

/** Toplam puanı (mağaza + reklam) yüksek, yeni (≤ 150 gün), açık ve henüz aday yapılmamış mağazalar. */
export async function storesToPromote(limit: number, minScore: number): Promise<StoreToPromote[]> {
  const since = new Date(Date.now() - NEW_STORE_MAX_AGE_DAYS * DAY).toISOString();
  const { data, error } = await db()
    .from("stores")
    .select("domain, shop_name, hero_handle, hero_title, hero_image, first_product_at, country, currency, store_score:total_score")
    .eq("status", "live")
    .is("product_id", null)
    .not("hero_handle", "is", null)
    // Türkiye pazarına satan mağazalar (TL ile satış) puana bakılmadan aday olur: kendi pazarınızdaki rakipler.
    // Türkiye'de kayıtlı ama euro/dolarla yurt dışına satan mağazalar bu kurala girmez.
    .or(`total_score.gte.${minScore},currency.eq.TRY`)
    .gte("first_product_at", since)
    .order("total_score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  return data as StoreToPromote[];
}

export type StoreWithMovers = { domain: string; shop_name: string | null; hero_handle: string | null; products_snapshot: SnapItem[] };

/** Ürünlerinde stok hareketi olan yeni, açık mağazalar (hareket sırasına göre). */
export async function storesWithMovers(limit: number, minDrops: number): Promise<StoreWithMovers[]> {
  const since = new Date(Date.now() - NEW_STORE_MAX_AGE_DAYS * DAY).toISOString();
  const { data, error } = await db()
    .from("stores")
    .select("domain, shop_name, hero_handle, products_snapshot")
    .eq("status", "live")
    .gte("first_product_at", since)
    .gte("stock_drops", minDrops)
    .not("products_snapshot", "is", null)
    .order("stock_drops", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  return data as StoreWithMovers[];
}
export async function markStorePromoted(domain: string, productId: string): Promise<void> {
  const { error } = await db().from("stores").update({ product_id: productId }).eq("domain", domain);
  if (error) throw new Error(`stores güncellenemedi: ${error.message}`);
}

/** Markanın yaşı: alan adı kaydı (RDAP) ve ilk ürün tarihi henüz bilinmeyen markalar. */
export async function brandsWithoutAge(limit: number): Promise<{ domain: string; platform: string | null }[]> {
  const { data, error } = await db().from("brands").select("domain, platform").is("age_checked_at", null).limit(limit);
  if (error) throw new Error(`brands okunamadı: ${error.message}`);
  return data;
}

export async function saveBrandAge(domain: string, registeredAt: string | null, firstProductAt: string | null): Promise<void> {
  const { error } = await db()
    .from("brands")
    .update({ registered_at: registeredAt, first_product_at: firstProductAt, age_checked_at: new Date().toISOString() })
    .eq("domain", domain);
  if (error) throw new Error(`brands güncellenemedi: ${error.message}`);
}

/** Kayıt tarihi bilinmeyen açık mağazalar (önce reklamdan bulunanlar ve reklam verenler); RDAP'ı hiç sorgulanmamış olanlar. */
export async function storesWithoutRdap(limit: number): Promise<string[]> {
  const { data, error } = await db()
    .from("stores")
    .select("domain")
    .eq("status", "live")
    .is("registered_on", null)
    .is("rdap_at", null)
    .order("ad_points", { ascending: false })
    .order("total_score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  return (data ?? []).map((r) => r.domain as string);
}

export async function saveRdap(domain: string, info: { registered: string | null; registrar: string | null } | null): Promise<void> {
  const update: Record<string, unknown> = { rdap_at: new Date().toISOString() };
  if (info?.registered) update.registered_on = info.registered.slice(0, 10);
  if (info?.registrar) update.registrar = info.registrar;
  const { error } = await db().from("stores").update(update).eq("domain", domain);
  if (error) throw new Error(`stores güncellenemedi: ${error.message}`);
}

export type NetworkStore = {
  domain: string;
  shop_name: string | null;
  hero_title: string | null;
  hero_image: string | null;
  status: string;
  total_score: number | null;
  first_product_at: string | null;
  reasons: string[];
};

/** Aynı satıcının diğer mağazaları (aynı piksel, Google Ads/GTM, e-posta ya da WhatsApp). */
export async function sellerNetwork(domain: string): Promise<NetworkStore[]> {
  const { data, error } = await db().rpc("seller_network", { p_domain: domain });
  if (error) return [];
  return (data ?? []) as NetworkStore[];
}

/**
 * Mağazadan gelen ürünün markasına mağazanın ülkesini yazar ("Mağaza ülkesi" filtresi için). Türkiye yalnızca TL ile
 * satan (Türkiye pazarına satan) mağazalara yazılır; Türkiye'de kayıtlı ama euro/dolarla satan mağaza Türk sayılmaz.
 */
export async function setBrandCountry(domain: string, country: string | null, currency: string | null): Promise<void> {
  const c = currency === "TRY" ? "TR" : country === "TR" ? null : country;
  if (!c) return;
  const { error } = await db().from("brands").update({ country: c }).eq("domain", domain).is("country", null);
  if (error) throw new Error(`brands güncellenemedi: ${error.message}`);
}
