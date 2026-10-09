// Arayüz için ürün sorguları (yalnızca sunucu).
import { db } from "./db.ts";
import type { ScoreBreakdown } from "./score.ts";
import type { WinnerBreakdown } from "./winner.ts";

export type DtcStatus = "verified" | "rejected_marketplace" | "unverified";
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
  days: 0 | 7 | 30 | 90;
  track: TrackStatus | "all";
  sort: "winner" | "score" | "new" | "reviews" | "price";
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
  winner_breakdown: WinnerBreakdown | null;
  first_seen_at: string;
  price: number | null;
  currency: string | null;
  review_count: number | null;
  rating: number | null;
  availability: string | null;
  launched_at: string | null;
  variant_count: number | null;
  brands: { platform: string | null; country: string | null; ships_to_tr: boolean | null; tranco_rank: number | null } | null;
  mentions: { source: string; url: string; title: string | null; posted_at: string }[];
  tracking: {
    status: TrackStatus | null;
    note: string | null;
    tr_competitor: string | null;
    tr_est_cost: string | null;
    tr_note: string | null;
  } | null;
};

const STATUSES = ["verified", "rejected_marketplace", "unverified", "all"] as const;
const TRACKS = ["favorite", "review", "rejected", "all"] as const;
const SORTS = ["winner", "score", "new", "reviews", "price"] as const;

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
    minScore: nonNegative(one(sp.min), 100),
    minReviews: nonNegative(one(sp.reviews)),
    priceMin: nonNegative(one(sp.pmin)),
    priceMax: nonNegative(one(sp.pmax)),
    days: ([7, 30, 90] as const).find((d) => d === days) ?? 0,
    track: (TRACKS as readonly string[]).includes(track) ? (track as Filters["track"]) : "all",
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Filters["sort"]) : "winner",
  };
}

/** PostgREST filtre sözdizimini bozabilecek karakterleri temizler. */
function safeLike(s: string): string {
  return s.replace(/[%_*,()\\"']/g, " ").trim();
}

export async function listProducts(f: Filters): Promise<{ rows: ProductRow[]; error: string | null }> {
  const brandFilter = Boolean(f.platform || f.country || f.shipsTr);
  const select = [
    "id, name, brand_domain, product_url, image_url, category, dtc_status, dtc_reason, trend_score, score_breakdown, winner_score, winner_breakdown, first_seen_at",
    "price, currency, review_count, rating, availability, launched_at, variant_count",
    `brands${brandFilter ? "!inner" : ""}(platform, country, ships_to_tr, tranco_rank)`,
    "mentions(source, url, title, posted_at)",
    `tracking${f.track !== "all" ? "!inner" : ""}(status, note, tr_competitor, tr_est_cost, tr_note)`,
  ].join(", ");

  let query = db().from("products").select(select);
  if (f.status !== "all") query = query.eq("dtc_status", f.status);
  if (f.category) query = query.eq("category", f.category);
  if (f.platform) query = query.eq("brands.platform", f.platform);
  if (f.country) query = query.eq("brands.country", f.country);
  if (f.shipsTr) query = query.eq("brands.ships_to_tr", true);
  if (f.track !== "all") query = query.eq("tracking.status", f.track);
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
  else if (f.sort === "score") query = query.order("trend_score", { ascending: false });
  else query = query.order("winner_score", { ascending: false });
  query = query.order("first_seen_at", { ascending: false });

  const { data, error } = await query.limit(200);
  if (error) return { rows: [], error: error.message };
  return { rows: data as unknown as ProductRow[], error: null };
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

export type HistoryPoint = { day: string; price: number | null; currency: string | null; review_count: number | null; rating: number | null; availability: string | null };

/** Ürün detay sayfası: ürün, günlük satış ölçümleri ve markanın trafik sırası geçmişi. */
export async function getProduct(id: string): Promise<{ p: ProductDetail; history: HistoryPoint[]; ranks: { day: string; rank: number | null }[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db()
    .from("products")
    .select(
      [
        "id, name, brand_domain, product_url, image_url, category, dtc_status, dtc_reason, trend_score, score_breakdown, winner_score, winner_breakdown, first_seen_at",
        "price, currency, review_count, rating, availability, launched_at, variant_count",
        "brands(platform, country, ships_to_tr, tranco_rank, tranco_day, marketplace_evidence)",
        "mentions(source, url, title, posted_at)",
        "tracking(status, note, tr_competitor, tr_est_cost, tr_note)",
      ].join(", "),
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const p = data as unknown as ProductDetail;
  const [history, ranks] = await Promise.all([
    db().from("product_snapshots").select("day, price, currency, review_count, rating, availability").eq("product_id", id).order("day").limit(400),
    db().from("traffic_ranks").select("day, rank").eq("domain", p.brand_domain).order("day").limit(400),
  ]);
  if (history.error) throw new Error(history.error.message);
  if (ranks.error) throw new Error(ranks.error.message);
  return {
    p,
    history: (history.data as HistoryPoint[]).map((h) => ({ ...h, price: h.price === null ? null : Number(h.price), rating: h.rating === null ? null : Number(h.rating) })),
    ranks: ranks.data as { day: string; rank: number | null }[],
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
