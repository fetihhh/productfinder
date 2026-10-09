// Reklam sinyalinin veritabanı katmanı (yalnızca cron).
import { AD_RECHECK_DAYS, NEW_STORE_MAX_AGE_DAYS } from "../config/limits.ts";
import type { AdSummary } from "../dtc/adLibrary.ts";
import { db } from "./db.ts";

const DAY = 86_400_000;

export type AdTarget = { domain: string; shopName: string | null; pageId: string | null };

async function inChunks<T>(values: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += 150) out.push(...(await run(values.slice(i, i + 150))));
  return out;
}

/**
 * Reklamı aranacak alan adları, öncelik sırasıyla: doğrulanmış ürünlerin markaları, sonra yeni mağazalar (puana göre).
 * Hiç aranmamış ya da yeniden arama zamanı gelmiş olanlar.
 */
export async function adTargets(limit: number, minStoreScore: number): Promise<AdTarget[]> {
  const since = new Date(Date.now() - NEW_STORE_MAX_AGE_DAYS * DAY).toISOString();
  const [verified, stores] = await Promise.all([
    db().from("products").select("brand_domain").eq("dtc_status", "verified").limit(1000),
    db()
      .from("stores")
      .select("domain, shop_name")
      .eq("status", "live")
      .gte("first_product_at", since)
      .gte("store_score", minStoreScore)
      .order("store_score", { ascending: false })
      .limit(2000),
  ]);
  if (verified.error) throw new Error(`products okunamadı: ${verified.error.message}`);
  if (stores.error) throw new Error(`stores okunamadı: ${stores.error.message}`);

  const shopNames = new Map<string, string | null>(stores.data.map((s) => [s.domain as string, s.shop_name as string | null]));
  const ordered = [...new Set([...verified.data.map((p) => p.brand_domain as string), ...shopNames.keys()])];
  const known = await inChunks(ordered, async (chunk) => {
    const { data, error } = await db().from("ad_signals").select("domain, page_id, next_check_at").in("domain", chunk);
    if (error) throw new Error(`ad_signals okunamadı: ${error.message}`);
    return data as { domain: string; page_id: string | null; next_check_at: string }[];
  });
  const state = new Map(known.map((k) => [k.domain, k]));
  const now = Date.now();
  return ordered
    .filter((d) => {
      const k = state.get(d);
      return !k || Date.parse(k.next_check_at) <= now;
    })
    .slice(0, limit)
    .map((domain) => ({ domain, shopName: shopNames.get(domain) ?? null, pageId: state.get(domain)?.page_id ?? null }));
}

export async function saveAdSignal(t: AdTarget, s: AdSummary, points: number): Promise<void> {
  const now = new Date();
  const next = new Date(now.getTime() + (s.totalAds > 0 ? AD_RECHECK_DAYS.found : AD_RECHECK_DAYS.none) * DAY);
  const { error } = await db().from("ad_signals").upsert(
    {
      domain: t.domain,
      page_id: s.pageId ?? t.pageId,
      page_name: s.pageName,
      active_ads: s.activeAds,
      total_ads: s.totalAds,
      new_ads_14d: s.newAds14d,
      first_ad_at: s.firstAdAt,
      last_ad_at: s.lastAdAt,
      longest_active_days: s.longestActiveDays,
      eu_reach: s.euReach,
      platforms: s.platforms,
      samples: s.samples,
      ad_points: points,
      checked_at: now.toISOString(),
      next_check_at: next.toISOString(),
    },
    { onConflict: "domain" },
  );
  if (error) throw new Error(`ad_signals yazılamadı: ${error.message}`);
  const { error: hErr } = await db()
    .from("ad_history")
    .upsert(
      { domain: t.domain, day: now.toISOString().slice(0, 10), active_ads: s.activeAds, total_ads: s.totalAds, eu_reach: s.euReach },
      { onConflict: "domain,day" },
    );
  if (hErr) throw new Error(`ad_history yazılamadı: ${hErr.message}`);
  // Mağaza ve marka satırlarına özet: mağaza toplam puanı (store_score + ad_points) ve filtreler bunu kullanır.
  for (const table of ["stores", "brands"] as const) {
    const { error: uErr } = await db().from(table).update({ ad_points: points, ads_active: s.activeAds }).eq("domain", t.domain);
    if (uErr) throw new Error(`${table} güncellenemedi: ${uErr.message}`);
  }
}

export type AdSignalRow = {
  domain: string;
  page_id: string | null;
  page_name: string | null;
  active_ads: number;
  total_ads: number;
  new_ads_14d: number;
  first_ad_at: string | null;
  longest_active_days: number | null;
  eu_reach: number | null;
  platforms: string[];
  samples: { id: string; url: string; title: string | null; body: string | null; start: string | null; active: boolean }[];
  ad_points: number;
  checked_at: string;
};

/** Arayüz: verilen alan adlarının reklam özeti. */
export async function adSignalsFor(domains: string[]): Promise<Map<string, AdSignalRow>> {
  const unique = [...new Set(domains)];
  const rows = await inChunks(unique, async (chunk) => {
    const { data, error } = await db()
      .from("ad_signals")
      .select("domain, page_id, page_name, active_ads, total_ads, new_ads_14d, first_ad_at, longest_active_days, eu_reach, platforms, samples, ad_points, checked_at")
      .in("domain", chunk);
    if (error) throw new Error(`ad_signals okunamadı: ${error.message}`);
    return data as AdSignalRow[];
  });
  return new Map(rows.map((r) => [r.domain, r]));
}

export async function adHistory(domain: string): Promise<{ day: string; active_ads: number }[]> {
  const { data, error } = await db().from("ad_history").select("day, active_ads").eq("domain", domain).order("day");
  if (error) throw new Error(`ad_history okunamadı: ${error.message}`);
  return data as { day: string; active_ads: number }[];
}

/** Winner/yükseliş skorları için: alan adı → reklam puanı ve son 14 günde açılan reklam sayısı. */
export async function adPointsByDomain(): Promise<Map<string, { points: number; newAds14d: number }>> {
  const { data, error } = await db().from("ad_signals").select("domain, ad_points, new_ads_14d").gt("total_ads", 0);
  if (error) throw new Error(`ad_signals okunamadı: ${error.message}`);
  return new Map(data.map((r) => [r.domain as string, { points: Number(r.ad_points), newAds14d: r.new_ads_14d as number }]));
}
