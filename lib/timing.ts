// Zamanlama etiketinin veritabanı katmanı: mağazalar (aynı ürünü satanlarla birlikte) ve ürünler için
// erken / zirvede / doymuş / sönüyor / henüz kanıt yok.
import { timingFor, type TimingMember } from "../dtc/timing.ts";
import { db } from "./db.ts";

type StoreRow = { domain: string; copy_group: string | null; copy_same_seller: boolean; first_product_at: string | null; stock_drops: number; product_id: string | null };
type AdRow = { domain: string; active_ads: number; total_ads: number; new_ads_14d: number; ad_stage: string };

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Tüm açık/eski mağazaların ve ürünlerin zamanlamasını yeniden hesaplar; değişen satır sayısını döndürür. */
export async function updateTiming(now = Date.now()): Promise<{ stores: number; products: number }> {
  const [stores, ads, products] = await Promise.all([
    all<StoreRow>((a, b) =>
      db().from("stores").select("domain, copy_group, copy_same_seller, first_product_at, stock_drops, product_id").in("status", ["live", "old"]).range(a, b),
    ),
    all<AdRow>((a, b) => db().from("ad_signals").select("domain, active_ads, total_ads, new_ads_14d, ad_stage").range(a, b)),
    all<{ id: string; brand_domain: string; launched_at: string | null; timing: string | null; timing_reason: string | null }>((a, b) =>
      db().from("products").select("id, brand_domain, launched_at, timing, timing_reason").range(a, b),
    ),
  ]);
  const adBy = new Map(ads.map((a) => [a.domain, a]));
  const member = (s: { domain: string; first_product_at: string | null; stock_drops: number }): TimingMember => {
    const a = adBy.get(s.domain);
    return {
      firstProductAt: s.first_product_at,
      activeAds: a?.active_ads ?? 0,
      totalAds: a?.total_ads ?? 0,
      newAds14d: a?.new_ads_14d ?? 0,
      adStage: a?.ad_stage ?? "none",
      stockDrops: s.stock_drops ?? 0,
    };
  };
  // Aynı satıcının ağı tek mağaza sayılır (bağımsız rakip değildir).
  const groups = new Map<string, StoreRow[]>();
  for (const s of stores) if (s.copy_group && !s.copy_same_seller) groups.set(s.copy_group, [...(groups.get(s.copy_group) ?? []), s]);

  const storeTiming = new Map<string, { timing: string; reason: string }>();
  let storeChanges = 0;
  const { data: current } = await db().from("stores").select("domain, timing, timing_reason").not("timing", "is", null).limit(20000);
  const before = new Map((current ?? []).map((r) => [r.domain as string, `${r.timing}|${r.timing_reason}`]));
  for (const s of stores) {
    const members = s.copy_group && !s.copy_same_seller ? (groups.get(s.copy_group) ?? [s]) : [s];
    const t = timingFor(members.map(member), now);
    storeTiming.set(s.domain, { timing: t.timing, reason: t.reason });
    if (before.get(s.domain) === `${t.timing}|${t.reason}`) continue;
    const { error } = await db().from("stores").update({ timing: t.timing, timing_reason: t.reason }).eq("domain", s.domain);
    if (error) throw new Error(`stores güncellenemedi: ${error.message}`);
    storeChanges++;
  }

  let productChanges = 0;
  for (const p of products) {
    const fromStore = storeTiming.get(p.brand_domain);
    const t =
      fromStore ??
      (adBy.has(p.brand_domain)
        ? (({ timing, reason }) => ({ timing, reason }))(timingFor([member({ domain: p.brand_domain, first_product_at: p.launched_at, stock_drops: 0 })], now))
        : null);
    if (!t || (p.timing === t.timing && p.timing_reason === t.reason)) continue;
    const { error } = await db().from("products").update({ timing: t.timing, timing_reason: t.reason }).eq("id", p.id);
    if (error) throw new Error(`products güncellenemedi: ${error.message}`);
    productChanges++;
  }
  return { stores: storeChanges, products: productChanges };
}
