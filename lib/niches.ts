// Niş trendleri (yalnızca sunucu): hangi ürün türlerinde yeni mağaza açılıyor, reklam ve satış hareketi artıyor.
import { NEW_STORE_MAX_AGE_DAYS } from "../config/limits.ts";
import { NICHES } from "../dtc/niche.ts";
import { db } from "./db.ts";

const DAY = 86_400_000;
const WEEKS = 8;

type StoreRow = {
  domain: string;
  niche: string | null;
  first_product_at: string | null;
  total_score: number;
  stock_drops: number;
  timing: string | null;
  hero_title: string | null;
  hero_image: string | null;
  shop_name: string | null;
};

export type NicheTrend = {
  key: string;
  label: string;
  stores: number;
  opened7: number;
  openedPrev7: number;
  /** Son 8 haftada açılan mağaza sayısı (eskiden yeniye). */
  weekly: number[];
  advertisers: number;
  scaling: number;
  moving: number;
  early: number;
  avgScore: number;
  /** Isınma: yeni mağaza, reklam, ölçeklenen reklam, stok hareketi ve erken ürünlerden. */
  heat: number;
  top: { domain: string; title: string; image: string | null; score: number }[];
};

export async function getNicheTrends(now = Date.now()): Promise<NicheTrend[]> {
  const since = new Date(now - NEW_STORE_MAX_AGE_DAYS * DAY).toISOString();
  const stores: StoreRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from("stores")
      .select("domain, niche, first_product_at, total_score, stock_drops, timing, hero_title, hero_image, shop_name")
      .eq("status", "live")
      .gte("first_product_at", since)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    stores.push(...(data as StoreRow[]));
    if (data.length < 1000) break;
  }
  const { data: ads, error } = await db().from("ad_signals").select("domain, ad_stage").gt("active_ads", 0).limit(10000);
  if (error) throw new Error(error.message);
  const stage = new Map((ads ?? []).map((a) => [a.domain as string, a.ad_stage as string]));

  const labels = new Map([...NICHES.map((n) => [n.key, n.label] as const), ["other", "Diğer"]]);
  const by = new Map<string, StoreRow[]>();
  for (const s of stores) {
    const k = s.niche ?? "other";
    by.set(k, [...(by.get(k) ?? []), s]);
  }

  const trends: NicheTrend[] = [];
  for (const [key, rows] of by) {
    const age = (s: StoreRow) => (s.first_product_at ? (now - Date.parse(s.first_product_at)) / DAY : Infinity);
    const weekly = Array.from({ length: WEEKS }, (_, i) => {
      const w = WEEKS - 1 - i;
      return rows.filter((s) => age(s) >= w * 7 && age(s) < (w + 1) * 7).length;
    });
    const opened7 = weekly[WEEKS - 1];
    const openedPrev7 = weekly[WEEKS - 2];
    const advertisers = rows.filter((s) => stage.has(s.domain)).length;
    const scaling = rows.filter((s) => ["scaling", "proven"].includes(stage.get(s.domain) ?? "")).length;
    const moving = rows.filter((s) => s.stock_drops > 0).length;
    const early = rows.filter((s) => s.timing === "early").length;
    const heat = Math.round(opened7 + Math.max(0, opened7 - openedPrev7) * 0.5 + advertisers * 3 + scaling * 6 + moving * 2 + early * 4);
    trends.push({
      key,
      label: labels.get(key) ?? key,
      stores: rows.length,
      opened7,
      openedPrev7,
      weekly,
      advertisers,
      scaling,
      moving,
      early,
      avgScore: Math.round(rows.reduce((s, r) => s + Number(r.total_score), 0) / rows.length),
      heat,
      top: [...rows]
        .sort((a, b) => Number(b.total_score) - Number(a.total_score))
        .slice(0, 3)
        .map((r) => ({ domain: r.domain, title: r.hero_title ?? r.shop_name ?? r.domain, image: r.hero_image, score: Number(r.total_score) })),
    });
  }
  // "Diğer" en sona.
  return trends.sort((a, b) => Number(a.key === "other") - Number(b.key === "other") || b.heat - a.heat || b.stores - a.stores);
}
