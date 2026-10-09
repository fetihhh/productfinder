// "Yeni mağazalar" sayfasının sorguları (yalnızca sunucu).
import { db } from "./db.ts";

export type StoreFilters = { maxAge: 30 | 60 | 90 | 150; minScore: number; sort: "score" | "new" | "products" | "ads"; q: string; tr: boolean; ads: boolean };

export type NewStoreRow = {
  domain: string;
  shop_name: string | null;
  country: string | null;
  ships_to_tr: boolean | null;
  product_count: number | null;
  discounted_count: number | null;
  dropship_count: number | null;
  apparel_count: number | null;
  min_price: number | null;
  max_price: number | null;
  currency: string | null;
  first_product_at: string | null;
  registered_on: string | null;
  hero_handle: string | null;
  hero_title: string | null;
  hero_image: string | null;
  hero_price: number | null;
  store_score: number;
  ad_points: number;
  ads_active: number | null;
  total_score: number;
  checks: number;
  product_id: string | null;
  products: { dtc_status: string; margin_ratio: number | null; supplier_min_usd: number | null } | null;
};

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

export function parseStoreFilters(sp: Record<string, string | string[] | undefined>): StoreFilters {
  const age = Number(one(sp.age));
  const sort = one(sp.sort);
  return {
    maxAge: ([30, 60, 90, 150] as const).find((a) => a === age) ?? 150,
    minScore: Math.min(100, Math.max(0, Number(one(sp.min)) || 0)),
    sort: sort === "new" || sort === "products" || sort === "ads" ? sort : "score",
    q: one(sp.q).replace(/[%_*,()\\"']/g, " ").trim().slice(0, 60),
    tr: one(sp.tr) === "1",
    ads: one(sp.ads) === "1",
  };
}

export async function listNewStores(f: StoreFilters): Promise<{ rows: NewStoreRow[]; error: string | null }> {
  const since = new Date(Date.now() - f.maxAge * 86_400_000).toISOString();
  let query = db()
    .from("stores")
    .select(
      "domain, shop_name, country, ships_to_tr, product_count, discounted_count, dropship_count, apparel_count, min_price, max_price, currency, first_product_at, registered_on, hero_handle, hero_title, hero_image, hero_price, store_score, ad_points, ads_active, total_score, checks, product_id, products(dtc_status, margin_ratio, supplier_min_usd)",
    )
    .eq("status", "live")
    .gte("first_product_at", since);
  if (f.minScore > 0) query = query.gte("total_score", f.minScore);
  if (f.ads) query = query.gte("ads_active", 1);
  if (f.tr) query = query.eq("ships_to_tr", true);
  if (f.q) query = query.or(`domain.ilike.*${f.q}*,shop_name.ilike.*${f.q}*,hero_title.ilike.*${f.q}*`);
  if (f.sort === "new") query = query.order("first_product_at", { ascending: false });
  else if (f.sort === "products") query = query.order("product_count", { ascending: true });
  else if (f.sort === "ads") query = query.order("ads_active", { ascending: false, nullsFirst: false }).order("total_score", { ascending: false });
  else query = query.order("total_score", { ascending: false }).order("first_product_at", { ascending: false });
  const { data, error } = await query.limit(120);
  if (error) return { rows: [], error: error.message };
  return { rows: data as unknown as NewStoreRow[], error: null };
}

export type MetaAdsState = {
  status: "ok" | "no_token" | "invalid" | "stopped";
  reason?: string;
  checked?: number;
  found?: number;
  expiresAt?: string | null;
  at: string;
};

/** Reklam aramasının son durumu (anahtar yok / süresi doldu / çalıştı). */
export async function metaAdsState(): Promise<MetaAdsState | null> {
  const { data, error } = await db().from("job_state").select("value").eq("key", "meta_ads").maybeSingle();
  if (error) return null;
  return (data?.value as MetaAdsState | undefined) ?? null;
}

/** Keşif hattının özeti: kaç mağaza bulundu, kaçı açıldı, kaçı bekliyor. */
export async function storeFunnel(): Promise<Record<"total" | "pending" | "closed" | "live" | "dead" | "old" | "promoted", number>> {
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count: n, error } = await build(base());
    if (error) throw new Error(error.message);
    return n ?? 0;
  };
  const base = () => db().from("stores").select("domain", { count: "exact", head: true });
  const [total, pending, closed, live, dead, old, promoted] = await Promise.all([
    count((q) => q),
    count((q) => q.eq("status", "pending")),
    count((q) => q.eq("status", "closed")),
    count((q) => q.eq("status", "live")),
    count((q) => q.eq("status", "dead")),
    count((q) => q.eq("status", "old")),
    count((q) => q.not("product_id", "is", null)),
  ]);
  return { total, pending, closed, live, dead, old, promoted };
}
