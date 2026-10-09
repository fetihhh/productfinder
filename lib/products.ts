// Arayüz için ürün sorguları (yalnızca sunucu).
import { db } from "./db.ts";
import type { ScoreBreakdown } from "./score.ts";

export type DtcStatus = "verified" | "rejected_marketplace" | "unverified";
export type TrackStatus = "favorite" | "review" | "rejected";

export type Filters = {
  q: string;
  status: DtcStatus | "all";
  category: string;
  platform: string;
  minScore: number;
  days: 0 | 7 | 30 | 90;
  track: TrackStatus | "all";
  sort: "score" | "new";
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
  first_seen_at: string;
  brands: { platform: string | null } | null;
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

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

/** URL parametrelerinden filtreler; varsayılan görünüm yalnızca "verified". */
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const status = one(sp.status);
  const track = one(sp.track);
  const days = Number(one(sp.days));
  return {
    q: one(sp.q).slice(0, 100),
    status: (STATUSES as readonly string[]).includes(status) ? (status as Filters["status"]) : "verified",
    category: one(sp.category).slice(0, 100),
    platform: one(sp.platform).slice(0, 40),
    minScore: Math.min(100, Math.max(0, Number(one(sp.min)) || 0)),
    days: ([7, 30, 90] as const).find((d) => d === days) ?? 0,
    track: (TRACKS as readonly string[]).includes(track) ? (track as Filters["track"]) : "all",
    sort: one(sp.sort) === "new" ? "new" : "score",
  };
}

/** PostgREST filtre sözdizimini bozabilecek karakterleri temizler. */
function safeLike(s: string): string {
  return s.replace(/[%_*,()\\"']/g, " ").trim();
}

export async function listProducts(f: Filters): Promise<{ rows: ProductRow[]; error: string | null }> {
  const select = [
    "id, name, brand_domain, product_url, image_url, category, dtc_status, dtc_reason, trend_score, score_breakdown, first_seen_at",
    `brands${f.platform ? "!inner" : ""}(platform)`,
    "mentions(source, url, title, posted_at)",
    `tracking${f.track !== "all" ? "!inner" : ""}(status, note, tr_competitor, tr_est_cost, tr_note)`,
  ].join(", ");

  let query = db().from("products").select(select);
  if (f.status !== "all") query = query.eq("dtc_status", f.status);
  if (f.category) query = query.eq("category", f.category);
  if (f.platform) query = query.eq("brands.platform", f.platform);
  if (f.track !== "all") query = query.eq("tracking.status", f.track);
  if (f.minScore > 0) query = query.gte("trend_score", f.minScore);
  if (f.days) query = query.gte("first_seen_at", new Date(Date.now() - f.days * 86_400_000).toISOString());
  const q = safeLike(f.q);
  if (q) query = query.or(`name.ilike.*${q}*,brand_domain.ilike.*${q}*`);

  query =
    f.sort === "new"
      ? query.order("first_seen_at", { ascending: false })
      : query.order("trend_score", { ascending: false }).order("first_seen_at", { ascending: false });

  const { data, error } = await query.limit(200);
  if (error) return { rows: [], error: error.message };
  return { rows: data as unknown as ProductRow[], error: null };
}

/** Filtre seçenekleri: mevcut kategoriler ve platformlar. */
export async function facets(): Promise<{ categories: string[]; platforms: string[] }> {
  const [cats, plats] = await Promise.all([
    db().from("products").select("category").not("category", "is", null),
    db().from("brands").select("platform").not("platform", "is", null),
  ]);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "tr"));
  return {
    categories: uniq((cats.data ?? []).map((r) => r.category)),
    platforms: uniq((plats.data ?? []).map((r) => r.platform)),
  };
}
