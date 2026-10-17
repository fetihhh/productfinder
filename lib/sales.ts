// Satış takibi sayfasının veritabanı katmanı: ölçülen ürünlerin özeti (sales_watch) ve mağaza ürünlerindeki hareketler
// (store_item_moves). İkisi de yalnızca gizli anahtarla çağrılabilen SQL fonksiyonlarıdır.
import { db } from "./db.ts";

export type SalesFilter = "all" | "price_drop" | "stock" | "low";

export type SalesRow = {
  id: string;
  name: string;
  brand_domain: string;
  product_url: string | null;
  image_url: string | null;
  winner_score: number | null;
  dtc_status: string;
  currency: string | null;
  price: number | null;
  price_prev: number | null;
  price_changed_at: string | null;
  compare_at: number | null;
  variants_available: number | null;
  variants_total: number | null;
  inventory: number | null;
  stock_tracked: boolean | null;
  last_measured_at: string | null;
  sold_out: number;
  restocked: number;
  units_sold: number;
  reviews_start: number | null;
  reviews_end: number | null;
  days_measured: number;
  min_price: number | null;
  max_price: number | null;
  supplier_sold_per_week: number | null;
};

export async function salesWatch(opts: { days: number; minScore: number; filter: SalesFilter; limit: number }): Promise<SalesRow[]> {
  const { data, error } = await db().rpc("sales_watch", { p_days: opts.days, p_min_score: opts.minScore, p_filter: opts.filter, p_limit: opts.limit });
  if (error) throw new Error(`satış takibi okunamadı: ${error.message}`);
  return (data ?? []) as SalesRow[];
}

export type StoreItemMove = {
  domain: string;
  handle: string;
  title: string | null;
  image: string | null;
  price: number | null;
  prev_price: number | null;
  compare_at: number | null;
  avail: number | null;
  variants: number | null;
  so: number;
  price_changes: number;
  last_move: string | null;
  copies: number;
  shop_name: string | null;
  currency: string | null;
  total_score: number | null;
};

export async function storeItemMoves(opts: { days: number; filter: "all" | "price_drop" | "stock"; limit: number }): Promise<StoreItemMove[]> {
  const { data, error } = await db().rpc("store_item_moves", { p_days: opts.days, p_filter: opts.filter, p_limit: opts.limit });
  if (error) throw new Error(`mağaza hareketleri okunamadı: ${error.message}`);
  return (data ?? []) as StoreItemMove[];
}

/** Yorum artışından tahmini satış (alıcıların %2–10'u yorum bırakır → yorum × 10–50). */
export function salesFromReviews(start: number | null, end: number | null): { low: number; high: number } | null {
  if (start === null || end === null || end <= start) return null;
  const d = end - start;
  return { low: d * 10, high: d * 50 };
}
