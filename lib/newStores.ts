// "Yeni mağazalar" sayfasının sorguları (yalnızca sunucu).
import { db } from "./db.ts";

export type StoreFilters = { maxAge: 30 | 60 | 90 | 150; minScore: number; sort: "score" | "new" | "products"; q: string; tr: boolean };

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
    sort: sort === "new" || sort === "products" ? sort : "score",
    q: one(sp.q).replace(/[%_*,()\\"']/g, " ").trim().slice(0, 60),
    tr: one(sp.tr) === "1",
  };
}

export async function listNewStores(f: StoreFilters): Promise<{ rows: NewStoreRow[]; error: string | null }> {
  const since = new Date(Date.now() - f.maxAge * 86_400_000).toISOString();
  let query = db()
    .from("stores")
    .select(
      "domain, shop_name, country, ships_to_tr, product_count, discounted_count, dropship_count, apparel_count, min_price, max_price, currency, first_product_at, registered_on, hero_handle, hero_title, hero_image, hero_price, store_score, checks, product_id, products(dtc_status, margin_ratio, supplier_min_usd)",
    )
    .eq("status", "live")
    .gte("first_product_at", since);
  if (f.minScore > 0) query = query.gte("store_score", f.minScore);
  if (f.tr) query = query.eq("ships_to_tr", true);
  if (f.q) query = query.or(`domain.ilike.*${f.q}*,shop_name.ilike.*${f.q}*,hero_title.ilike.*${f.q}*`);
  if (f.sort === "new") query = query.order("first_product_at", { ascending: false });
  else if (f.sort === "products") query = query.order("product_count", { ascending: true });
  else query = query.order("store_score", { ascending: false }).order("first_product_at", { ascending: false });
  const { data, error } = await query.limit(120);
  if (error) return { rows: [], error: error.message };
  return { rows: data as unknown as NewStoreRow[], error: null };
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
