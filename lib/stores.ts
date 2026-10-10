// Yeni mağaza keşfinin veritabanı katmanı (yalnızca cron).
import { COPY_MIN_STORE_SCORE, NEW_STORE_MAX_AGE_DAYS } from "../config/limits.ts";
import { nextCheck, storeActivity, storeScore, storeScoreParts, type StoreProbe } from "../dtc/storeProbe.ts";
import { mergeSnapshot, type SnapItem } from "../dtc/storeSnapshot.ts";
import { db } from "./db.ts";

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
export async function insertStores(domains: string[], source: string, registeredOn: string | null): Promise<number> {
  const firstCheck = registeredOn ? new Date(Date.parse(registeredOn) + 5 * DAY).toISOString() : new Date().toISOString();
  let inserted = 0;
  for (let i = 0; i < domains.length; i += 500) {
    const rows = domains.slice(i, i + 500).map((domain) => ({ domain, source, registered_on: registeredOn, next_check_at: firstCheck }));
    const { data, error } = await db().from("stores").upsert(rows, { onConflict: "domain", ignoreDuplicates: true }).select("domain");
    if (error) throw new Error(`stores yazılamadı: ${error.message}`);
    inserted += data.length;
  }
  return inserted;
}

export type StoreToCheck = { domain: string; registered_on: string | null; discovered_at: string; first_product_at: string | null; status?: string };

export async function storesToCheck(limit: number): Promise<StoreToCheck[]> {
  const { data, error } = await db()
    .from("stores")
    .select("domain, registered_on, discovered_at, first_product_at, status")
    .in("status", ["pending", "closed", "live"])
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  return data as StoreToCheck[];
}

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
      shop_name: probe.shopName,
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
      hero_title: probe.hero?.title?.slice(0, 200) ?? null,
      hero_image: probe.hero?.image ?? null,
      hero_price: probe.hero?.price ?? null,
      store_score: score,
      score_parts: storeScoreParts(probe, activity!),
    });
    // Ürün bazında hareket yalnızca aday olabilecek mağazalarda izlenir (veritabanı boyutu).
    if (score >= COPY_MIN_STORE_SCORE) {
      const { data: snapRow, error: sErr } = await db().from("stores").select("products_snapshot").eq("domain", s.domain).maybeSingle();
      if (sErr) throw new Error(`stores okunamadı: ${sErr.message}`);
      const { items } = mergeSnapshot((snapRow?.products_snapshot as SnapItem[] | null) ?? null, probe.products, today);
      Object.assign(update, {
        products_snapshot: items,
        stock_drops: items.reduce((n, i) => n + i.so, 0),
        moving_products: items.filter((i) => i.so > 0).length,
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
    .select("domain, shop_name, hero_handle, hero_title, hero_image, first_product_at, store_score:total_score")
    .eq("status", "live")
    .is("product_id", null)
    .not("hero_handle", "is", null)
    .gte("total_score", minScore)
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
