// Özet sayfasının sorguları (yalnızca sunucu): günlük bakışta en önemli değişimler.
import { NEW_STORE_MAX_AGE_DAYS } from "../config/limits.ts";
import { db } from "./db.ts";

const DAY = 86_400_000;
const since = (days: number) => new Date(Date.now() - days * DAY).toISOString();

export type SummaryStore = {
  domain: string;
  shop_name: string | null;
  hero_title: string | null;
  hero_image: string | null;
  hero_price: number | null;
  currency: string | null;
  first_product_at: string | null;
  total_score: number;
  stock_drops: number;
  moving_products: number;
  copy_count: number;
  copy_group: string | null;
  ads_active: number | null;
};

export type SummaryProduct = {
  id: string;
  name: string;
  brand_domain: string;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  winner_score: number;
  margin_ratio: number | null;
  supplier_min_usd: number | null;
  supplier_image_match: boolean;
  supplier_sold: number | null;
  supplier_sold_per_week: number | null;
  dtc_status: string;
};

export type Summary = {
  counts: { storesFound24h: number; storesOpened7d: number; candidates24h: number; liveNew: number };
  movers: SummaryStore[];
  copied: SummaryStore[];
  winners: SummaryProduct[];
  supplierHot: SummaryProduct[];
  adsRising: { domain: string; active_ads: number; new_ads_14d: number; longest_active_days: number | null; page_name: string | null }[];
};

const STORE_COLS =
  "domain, shop_name, hero_title, hero_image, hero_price, currency, first_product_at, total_score, stock_drops, moving_products, copy_count, copy_group, ads_active";
const PRODUCT_COLS =
  "id, name, brand_domain, image_url, price, currency, winner_score, margin_ratio, supplier_min_usd, supplier_image_match, supplier_sold, supplier_sold_per_week, dtc_status";

export async function getSummary(): Promise<Summary> {
  const head = { count: "exact" as const, head: true };
  const newWindow = since(NEW_STORE_MAX_AGE_DAYS);
  const [found, opened, candidates, liveNew, movers, copied, winners, hot, ads] = await Promise.all([
    db().from("stores").select("domain", head).gte("discovered_at", since(1)),
    db().from("stores").select("domain", head).eq("status", "live").gte("first_product_at", since(7)),
    db().from("products").select("id", head).gte("first_seen_at", since(1)),
    db().from("stores").select("domain", head).eq("status", "live").gte("first_product_at", newWindow),
    db().from("stores").select(STORE_COLS).eq("status", "live").gte("first_product_at", newWindow).gt("stock_drops", 0).order("stock_drops", { ascending: false }).limit(8),
    db()
      .from("stores")
      .select(STORE_COLS)
      .in("status", ["live", "old"])
      .gt("copy_count", 0)
      .eq("copy_same_seller", false)
      .order("copy_count", { ascending: false })
      .order("total_score", { ascending: false })
      .limit(40),
    db().from("products").select(PRODUCT_COLS).eq("dtc_status", "verified").order("winner_score", { ascending: false }).limit(8),
    db().from("products").select(PRODUCT_COLS).not("supplier_sold", "is", null).order("supplier_sold_per_week", { ascending: false, nullsFirst: false }).order("supplier_sold", { ascending: false }).limit(8),
    db().from("ad_signals").select("domain, active_ads, new_ads_14d, longest_active_days, page_name").gt("new_ads_14d", 0).order("new_ads_14d", { ascending: false }).limit(8),
  ]);
  for (const r of [found, opened, candidates, liveNew, movers, copied, winners, hot, ads]) if (r.error) throw new Error(r.error.message);
  // Kümeden bir mağaza (ilk açılan): aynı ürün listede tekrar etmesin.
  const seen = new Set<string>();
  const copiedOne = (copied.data as SummaryStore[]).filter((s) => {
    const key = s.copy_group ?? s.domain;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    counts: { storesFound24h: found.count ?? 0, storesOpened7d: opened.count ?? 0, candidates24h: candidates.count ?? 0, liveNew: liveNew.count ?? 0 },
    movers: movers.data as SummaryStore[],
    copied: copiedOne.slice(0, 8),
    winners: winners.data as SummaryProduct[],
    supplierHot: hot.data as SummaryProduct[],
    adsRising: ads.data as Summary["adsRising"],
  };
}
