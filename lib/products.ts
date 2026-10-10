// Arayüz için ürün sorguları (yalnızca sunucu).
import { IMAGE_MATCH_MAX } from "../config/limits.ts";
import { adHistory, adSignalsFor, type AdHistoryPoint, type AdSignalRow } from "./ads.ts";
import { db } from "./db.ts";
import type { ScoreBreakdown } from "./score.ts";
import type { WinnerBreakdown } from "./winner.ts";

export type DtcStatus = "verified" | "rejected_marketplace" | "rejected_big_brand" | "unverified";
export type TrackStatus = "favorite" | "review" | "rejected";

export type Filters = {
  q: string;
  status: DtcStatus | "all";
  category: string;
  platform: string;
  country: string;
  shipsTr: boolean;
  minScore: number;
  minReviews: number;
  priceMin: number;
  priceMax: number;
  days: 0 | 1 | 7 | 30 | 90;
  track: TrackStatus | "all";
  sort: "winner" | "rising" | "margin" | "score" | "new" | "reviews" | "price";
  /** Yalnızca toptancısı bulunan ürünler */
  supplier: boolean;
  /** Mağaza yaşı sınırı (gün; 0 = hepsi): ilk ürün ya da alan adı kaydı bu kadar günden yeni */
  age: 0 | 30 | 90 | 150;
  /** Yalnızca Meta'da yayında reklamı olan markalar */
  ads: boolean;
};

export type ProductRow = {
  id: string;
  name: string;
  brand_domain: string;
  product_url: string | null;
  image_url: string | null;
  category: string | null;
  dtc_status: DtcStatus;
  dtc_reason: string | null;
  trend_score: number;
  score_breakdown: ScoreBreakdown | null;
  winner_score: number;
  momentum_score: number;
  winner_breakdown: WinnerBreakdown | null;
  first_seen_at: string;
  price: number | null;
  currency: string | null;
  review_count: number | null;
  rating: number | null;
  availability: string | null;
  launched_at: string | null;
  variant_count: number | null;
  product_type: string | null;
  supplier_count: number | null;
  supplier_min_usd: number | null;
  margin_ratio: number | null;
  supplier_checked_at: string | null;
  supplier_image_match: boolean;
  /** Aynı ürünü satan diğer yeni mağaza sayısı (kopyalanan ürünler). */
  copy_count: number;
  /** Asıl toptan ilanın toplam satışı ve haftalık satış hızı. */
  supplier_sold: number | null;
  supplier_sold_per_week: number | null;
  brands: {
    platform: string | null;
    country: string | null;
    ships_to_tr: boolean | null;
    tranco_rank: number | null;
    registered_at: string | null;
    first_product_at: string | null;
    ads_active: number | null;
    ad_points: number;
  } | null;
  mentions: { source: string; url: string; title: string | null; posted_at: string }[];
  tracking: {
    status: TrackStatus | null;
    note: string | null;
    tr_competitor: string | null;
    tr_est_cost: string | null;
    tr_note: string | null;
  } | null;
};

const STATUSES = ["verified", "rejected_marketplace", "rejected_big_brand", "unverified", "all"] as const;
const TRACKS = ["favorite", "review", "rejected", "all"] as const;
const SORTS = ["winner", "rising", "margin", "score", "new", "reviews", "price"] as const;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function nonNegative(v: string, max = Number.MAX_SAFE_INTEGER): number {
  return Math.min(max, Math.max(0, Number(v) || 0));
}

/** URL parametrelerinden filtreler; varsayılan görünüm yalnızca "verified". */
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const status = one(sp.status);
  const track = one(sp.track);
  const sort = one(sp.sort);
  const days = Number(one(sp.days));
  const country = one(sp.country).toUpperCase();
  return {
    q: one(sp.q).slice(0, 100),
    status: (STATUSES as readonly string[]).includes(status) ? (status as Filters["status"]) : "verified",
    category: one(sp.category).slice(0, 100),
    platform: one(sp.platform).slice(0, 40),
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    shipsTr: one(sp.tr) === "1",
    supplier: one(sp.sup) === "1",
    ads: one(sp.ads) === "1",
    age: ([30, 90, 150] as const).find((a) => a === Number(one(sp.age))) ?? 0,
    minScore: nonNegative(one(sp.min), 100),
    minReviews: nonNegative(one(sp.reviews)),
    priceMin: nonNegative(one(sp.pmin)),
    priceMax: nonNegative(one(sp.pmax)),
    days: ([1, 7, 30, 90] as const).find((d) => d === days) ?? 0,
    track: (TRACKS as readonly string[]).includes(track) ? (track as Filters["track"]) : "all",
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Filters["sort"]) : "winner",
  };
}

/** PostgREST filtre sözdizimini bozabilecek karakterleri temizler. */
function safeLike(s: string): string {
  return s.replace(/[%_*,()\\"']/g, " ").trim();
}

export async function listProducts(f: Filters): Promise<{ rows: ProductRow[]; error: string | null }> {
  const brandFilter = Boolean(f.platform || f.country || f.shipsTr || f.age || f.ads);
  const select = [
    "id, name, brand_domain, product_url, image_url, category, dtc_status, dtc_reason, trend_score, score_breakdown, winner_score, winner_breakdown, momentum_score, first_seen_at",
    "price, currency, review_count, rating, availability, launched_at, variant_count, product_type, supplier_count, supplier_min_usd, margin_ratio, supplier_checked_at, supplier_image_match, copy_count, supplier_sold, supplier_sold_per_week",
    `brands${brandFilter ? "!inner" : ""}(platform, country, ships_to_tr, tranco_rank, registered_at, first_product_at, ads_active, ad_points)`,
    "mentions(source, url, title, posted_at)",
    `tracking${f.track !== "all" ? "!inner" : ""}(status, note, tr_competitor, tr_est_cost, tr_note)`,
  ].join(", ");

  let query = db().from("products").select(select);
  if (f.status !== "all") query = query.eq("dtc_status", f.status);
  if (f.category) query = query.eq("category", f.category);
  if (f.platform) query = query.eq("brands.platform", f.platform);
  if (f.country) query = query.eq("brands.country", f.country);
  if (f.shipsTr) query = query.eq("brands.ships_to_tr", true);
  if (f.supplier) query = query.gt("supplier_count", 0);
  if (f.ads) query = query.gte("brands.ads_active", 1);
  if (f.age) {
    const since = new Date(Date.now() - f.age * 86_400_000).toISOString();
    query = query.or(`first_product_at.gte.${since},registered_at.gte.${since.slice(0, 10)}`, { referencedTable: "brands" });
  }
  if (f.track !== "all") query = query.eq("tracking.status", f.track);
  else {
    // Elenen ürünler varsayılan listede gösterilmez ("Takip: Elendi" filtresiyle görülür).
    const { data: rejected } = await db().from("tracking").select("product_id").eq("status", "rejected").limit(1000);
    const ids = (rejected ?? []).map((r) => r.product_id as string);
    if (ids.length) query = query.not("id", "in", `(${ids.join(",")})`);
  }
  if (f.minScore > 0) query = query.gte("winner_score", f.minScore);
  if (f.minReviews > 0) query = query.gte("review_count", f.minReviews);
  if (f.priceMin > 0) query = query.gte("price", f.priceMin);
  if (f.priceMax > 0) query = query.lte("price", f.priceMax);
  if (f.days) query = query.gte("first_seen_at", new Date(Date.now() - f.days * 86_400_000).toISOString());
  const q = safeLike(f.q);
  if (q) query = query.or(`name.ilike.*${q}*,brand_domain.ilike.*${q}*`);

  if (f.sort === "new") query = query.order("first_seen_at", { ascending: false });
  else if (f.sort === "reviews") query = query.order("review_count", { ascending: false, nullsFirst: false });
  else if (f.sort === "price") query = query.order("price", { ascending: true, nullsFirst: false });
  else if (f.sort === "margin") query = query.order("margin_ratio", { ascending: false, nullsFirst: false });
  else if (f.sort === "rising") query = query.gt("momentum_score", 0).order("momentum_score", { ascending: false });
  else if (f.sort === "score") query = query.order("trend_score", { ascending: false });
  else query = query.order("winner_score", { ascending: false });
  query = query.order("first_seen_at", { ascending: false });

  const { data, error } = await query.limit(200);
  if (error) return { rows: [], error: error.message };
  return { rows: data as unknown as ProductRow[], error: null };
}

/** Son 24 saatte eklenen (elenmemiş) ürün sayısı. */
export async function newToday(): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("products").select("id", { count: "exact", head: true }).gte("first_seen_at", since);
  return count ?? 0;
}

/** Filtre seçenekleri: mevcut kategoriler, platformlar ve mağaza ülkeleri. */
export async function facets(): Promise<{ categories: string[]; platforms: string[]; countries: string[] }> {
  const [cats, brands] = await Promise.all([
    db().from("products").select("category").not("category", "is", null),
    db().from("brands").select("platform, country"),
  ]);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "tr"));
  return {
    categories: uniq((cats.data ?? []).map((r) => r.category)),
    platforms: uniq((brands.data ?? []).map((r) => r.platform)),
    countries: uniq((brands.data ?? []).map((r) => r.country)),
  };
}

export type ProductDetail = ProductRow & {
  brands: ProductRow["brands"] & { marketplace_evidence: string | null; tranco_day: string | null };
};

export type SupplierRow = {
  url: string;
  source: "aliexpress" | "alibaba" | "madeinchina";
  title: string;
  image_url: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  moq: string | null;
  sold: number | null;
  supplier_name: string | null;
  similarity: number;
  image_distance: number | null;
  rating: number | null;
};

/** Toptan ilanın fotoğrafı ürün fotoğrafıyla aynı mı (dHash farkı ≤ eşik). */
export const sameImage = (s: { image_distance: number | null }) => s.image_distance !== null && s.image_distance <= IMAGE_MATCH_MAX;

export type HistoryPoint = { day: string; price: number | null; currency: string | null; review_count: number | null; rating: number | null; availability: string | null };

/** Ürün detay sayfası: ürün, günlük satış ölçümleri ve markanın trafik sırası geçmişi. */
export async function getProduct(
  id: string,
): Promise<{
  p: ProductDetail;
  history: HistoryPoint[];
  ranks: { day: string; rank: number | null }[];
  suppliers: SupplierRow[];
  ads: AdSignalRow | null;
  adHistory: AdHistoryPoint[];
  /** Ürün adı İngilizce değilse saklanan çevirisi (toptancı/pazaryeri araması için yapılmış). */
  nameEn: string | null;
} | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db()
    .from("products")
    .select(
      [
        "id, name, brand_domain, product_url, image_url, category, dtc_status, dtc_reason, trend_score, score_breakdown, winner_score, winner_breakdown, momentum_score, first_seen_at",
        "price, currency, review_count, rating, availability, launched_at, variant_count, product_type, supplier_count, supplier_min_usd, margin_ratio, supplier_checked_at, supplier_image_match, copy_count, supplier_sold, supplier_sold_per_week",
        "brands(platform, country, ships_to_tr, tranco_rank, tranco_day, marketplace_evidence, registered_at, first_product_at, ads_active, ad_points)",
        "mentions(source, url, title, posted_at)",
        "tracking(status, note, tr_competitor, tr_est_cost, tr_note)",
      ].join(", "),
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const p = data as unknown as ProductDetail;
  const [history, ranks, suppliers, ads, adHist, tr] = await Promise.all([
    db().from("product_snapshots").select("day, price, currency, review_count, rating, availability").eq("product_id", id).order("day").limit(400),
    db().from("traffic_ranks").select("day, rank").eq("domain", p.brand_domain).order("day").limit(400),
    db().from("suppliers").select("url, source, title, image_url, price_min, price_max, currency, moq, sold, supplier_name, similarity, image_distance, rating").eq("product_id", id).order("similarity", { ascending: false }).limit(15),
    adSignalsFor([p.brand_domain]),
    adHistory(p.brand_domain),
    db().from("translations").select("translated").eq("text", p.name.trim()).limit(1).maybeSingle(),
  ]);
  if (suppliers.error) throw new Error(suppliers.error.message);
  if (history.error) throw new Error(history.error.message);
  if (ranks.error) throw new Error(ranks.error.message);
  return {
    p,
    history: (history.data as HistoryPoint[]).map((h) => ({ ...h, price: h.price === null ? null : Number(h.price), rating: h.rating === null ? null : Number(h.rating) })),
    ranks: ranks.data as { day: string; rank: number | null }[],
    suppliers: (suppliers.data as SupplierRow[]).map((s) => ({
      ...s,
      price_min: s.price_min === null ? null : Number(s.price_min),
      price_max: s.price_max === null ? null : Number(s.price_max),
      similarity: Number(s.similarity),
    }))
      // Fotoğrafla eşleşen ilanlar önce.
      .sort((a, b) => Number(sameImage(b)) - Number(sameImage(a)) || b.similarity - a.similarity),
    ads: ads.get(p.brand_domain) ?? null,
    adHistory: adHist,
    nameEn: (tr.data?.translated as string | undefined) ?? null,
  };
}

export type SiteRow = {
  domain: string;
  platform: string | null;
  country: string | null;
  ships_to_tr: boolean | null;
  marketplace_status: string | null;
  tranco_rank: number | null;
  verified: number;
  products: number;
  ranks: { day: string; rank: number | null }[];
};

/** Siteler (markalar): trafik sırası, son 60 günlük geçmiş ve ürün sayıları. */
export async function listSites(onlyVerified: boolean): Promise<SiteRow[]> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const [brands, products, ranks] = await Promise.all([
    db().from("brands").select("domain, platform, country, ships_to_tr, marketplace_status, tranco_rank"),
    db().from("products").select("brand_domain, dtc_status"),
    db().from("traffic_ranks").select("domain, day, rank").gte("day", since).order("day"),
  ]);
  for (const r of [brands, products, ranks]) if (r.error) throw new Error(r.error.message);
  const counts = new Map<string, { verified: number; products: number }>();
  for (const p of products.data!) {
    const c = counts.get(p.brand_domain) ?? { verified: 0, products: 0 };
    c.products++;
    if (p.dtc_status === "verified") c.verified++;
    counts.set(p.brand_domain, c);
  }
  const rankBy = new Map<string, { day: string; rank: number | null }[]>();
  for (const r of ranks.data!) rankBy.set(r.domain, [...(rankBy.get(r.domain) ?? []), { day: r.day, rank: r.rank }]);

  return brands
    .data!.map((b) => ({ ...b, ...(counts.get(b.domain) ?? { verified: 0, products: 0 }), ranks: rankBy.get(b.domain) ?? [] }) as SiteRow)
    .filter((s) => !onlyVerified || s.verified > 0)
    .sort((a, b) => (a.tranco_rank ?? Infinity) - (b.tranco_rank ?? Infinity) || a.domain.localeCompare(b.domain));
}
