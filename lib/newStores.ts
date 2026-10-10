// "Yeni mağazalar" sayfasının sorguları (yalnızca sunucu).
import type { StoreScoreParts } from "../dtc/storeProbe.ts";
import type { SnapItem } from "../dtc/storeSnapshot.ts";
import { adHistory, adSignalsFor, type AdHistoryPoint, type AdSignalRow } from "./ads.ts";
import { db } from "./db.ts";

export type StoreFilters = {
  maxAge: 30 | 60 | 90 | 150;
  minScore: number;
  sort: "score" | "new" | "products" | "ads" | "copies" | "moving";
  q: string;
  tr: boolean;
  ads: boolean;
  /** Yalnızca AliExpress görseli kullanan (kesin dropshipping) / stok hareketi olan mağazalar. */
  ali: boolean;
  moving: boolean;
  /** Yalnızca bu kümedeki (aynı ürünü satan) mağazalar. */
  group: string;
};

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
  copy_group: string | null;
  copy_count: number;
  copy_same_seller: boolean;
  ali_image_count: number | null;
  stock_drops: number;
  moving_products: number;
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
    sort: (["new", "products", "ads", "copies", "moving"] as const).find((x) => x === sort) ?? "score",
    q: one(sp.q).replace(/[%_*,()\\"']/g, " ").trim().slice(0, 60),
    tr: one(sp.tr) === "1",
    ads: one(sp.ads) === "1",
    ali: one(sp.ali) === "1",
    moving: one(sp.moving) === "1",
    group: one(sp.group).toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 100),
  };
}

export async function listNewStores(f: StoreFilters): Promise<{ rows: NewStoreRow[]; error: string | null }> {
  const since = new Date(Date.now() - f.maxAge * 86_400_000).toISOString();
  let query = db()
    .from("stores")
    .select(
      "domain, shop_name, country, ships_to_tr, product_count, discounted_count, dropship_count, apparel_count, min_price, max_price, currency, first_product_at, registered_on, hero_handle, hero_title, hero_image, hero_price, store_score, ad_points, ads_active, total_score, copy_group, copy_count, copy_same_seller, ali_image_count, stock_drops, moving_products, checks, product_id, products(dtc_status, margin_ratio, supplier_min_usd)",
    )
    .eq("status", "live")
    .gte("first_product_at", since);
  if (f.minScore > 0) query = query.gte("total_score", f.minScore);
  if (f.ads) query = query.gte("ads_active", 1);
  if (f.group) query = query.eq("copy_group", f.group);
  if (f.ali) query = query.gte("ali_image_count", 1);
  if (f.moving) query = query.gte("stock_drops", 1);
  if (f.tr) query = query.eq("ships_to_tr", true);
  if (f.q) query = query.or(`domain.ilike.*${f.q}*,shop_name.ilike.*${f.q}*,hero_title.ilike.*${f.q}*`);
  if (f.sort === "new") query = query.order("first_product_at", { ascending: false });
  else if (f.sort === "products") query = query.order("product_count", { ascending: true });
  else if (f.sort === "moving") query = query.order("stock_drops", { ascending: false }).order("total_score", { ascending: false });
  else if (f.sort === "copies") query = query.order("copy_count", { ascending: false }).order("total_score", { ascending: false });
  else if (f.sort === "ads") query = query.order("ad_points", { ascending: false }).order("ads_active", { ascending: false, nullsFirst: false });
  else query = query.order("total_score", { ascending: false }).order("first_product_at", { ascending: false });
  const { data, error } = await query.limit(120);
  if (error) return { rows: [], error: error.message };
  return { rows: data as unknown as NewStoreRow[], error: null };
}

export type CopyMember = {
  domain: string;
  shop_name: string | null;
  status: string;
  hero_title: string | null;
  hero_handle: string | null;
  hero_image: string | null;
  hero_price: number | null;
  currency: string | null;
  first_product_at: string | null;
  product_count: number | null;
  total_score: number;
  ads_active: number | null;
  copy_same_seller: boolean;
};

/** Aynı ürünü satan mağazalar: alan adının kümesi (yoksa boş liste). İlk açılan önce. */
export async function copiesOf(domain: string): Promise<CopyMember[]> {
  const { data: self, error } = await db().from("stores").select("copy_group").eq("domain", domain).maybeSingle();
  if (error || !self?.copy_group) return [];
  const { data, error: mErr } = await db()
    .from("stores")
    .select("domain, shop_name, status, hero_title, hero_handle, hero_image, hero_price, currency, first_product_at, product_count, total_score, ads_active, copy_same_seller")
    .eq("copy_group", self.copy_group)
    .order("first_product_at", { ascending: true })
    .limit(50);
  if (mErr) return [];
  return data as CopyMember[];
}

export type StoreDetail = NewStoreRow & {
  status: string;
  source: string;
  discovered_at: string;
  last_checked_at: string | null;
  next_check_at: string;
  physical_count: number | null;
  last_product_at: string | null;
  products_snapshot: SnapItem[] | null;
  score_parts: StoreScoreParts | null;
  stock_drops: number;
  moving_products: number;
  copy_points: number;
};

export type StoreCheckPoint = { day: string; status: string; product_count: number | null; available_variants: number | null; total_variants: number | null };

/** Alan adı yeni mağaza keşfinde var mı (ürün sayfasından mağaza detayına bağlantı için). */
export async function storeExists(domain: string): Promise<boolean> {
  const { data } = await db().from("stores").select("domain").eq("domain", domain).maybeSingle();
  return Boolean(data);
}

/** Mağaza detay sayfası: mağaza, kontrol geçmişi, reklamlar ve aynı ürünü satan mağazalar. */
export async function getStoreDetail(domain: string): Promise<{
  s: StoreDetail;
  checks: StoreCheckPoint[];
  ads: AdSignalRow | null;
  adHistory: AdHistoryPoint[];
  copies: CopyMember[];
} | null> {
  if (!/^[a-z0-9.-]{3,100}$/.test(domain)) return null;
  const { data, error } = await db()
    .from("stores")
    .select(
      "domain, source, status, discovered_at, last_checked_at, next_check_at, shop_name, country, ships_to_tr, product_count, physical_count, discounted_count, dropship_count, apparel_count, ali_image_count, min_price, max_price, currency, first_product_at, last_product_at, registered_on, hero_handle, hero_title, hero_image, hero_price, store_score, ad_points, ads_active, copy_points, total_score, copy_group, copy_count, copy_same_seller, checks, product_id, products_snapshot, score_parts, stock_drops, moving_products, products(dtc_status, margin_ratio, supplier_min_usd)",
    )
    .eq("domain", domain)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [checks, ads, adHist, copies] = await Promise.all([
    db().from("store_checks").select("day, status, product_count, available_variants, total_variants").eq("domain", domain).order("day").limit(200),
    adSignalsFor([domain]),
    adHistory(domain),
    copiesOf(domain),
  ]);
  if (checks.error) throw new Error(checks.error.message);
  return { s: data as unknown as StoreDetail, checks: checks.data as StoreCheckPoint[], ads: ads.get(domain) ?? null, adHistory: adHist, copies };
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
