// Instagram gönderilerinin veritabanı katmanı: hangi hesaplara bakılacak, sonuçların kaydı ve arayüz sorguları.
import { IG_RECHECK_DAYS } from "../config/limits.ts";
import type { IgAccount, RankedPost } from "../dtc/instagram.ts";
import { db } from "./db.ts";
import { clip } from "./text.ts";

const DAY = 86_400_000;

export type IgTarget = { username: string; domain: string };

/**
 * Bakılacak hesaplar: Instagram'ı bilinen açık mağazalardan reklam verenler önce, sonra puanı yüksekler; zamanı gelmemiş
 * (next_check_at gelecekte) hesaplar atlanır.
 */
export async function igTargets(limit: number): Promise<IgTarget[]> {
  const { data: stores, error } = await db()
    .from("stores")
    .select("domain, instagram, total_score, ad_points")
    .not("instagram", "is", null)
    .neq("instagram", "")
    .in("status", ["live", "old"])
    .order("ad_points", { ascending: false })
    .order("total_score", { ascending: false })
    .limit(400);
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  // Birden çok mağazanın bağladığı hesap çoğu zaman temanın varsayılan bağlantısıdır (mağazanın hesabı değil): atlanır.
  const { data: shared } = await db().rpc("shared_instagram_handles");
  const skip = new Set(((shared as { instagram: string }[] | null) ?? []).map((r) => r.instagram));
  const usernames = [...new Set((stores ?? []).map((s) => s.instagram as string))].filter((u) => !skip.has(u));
  if (usernames.length === 0) return [];
  const { data: accounts, error: e2 } = await db().from("ig_accounts").select("username, next_check_at").in("username", usernames);
  if (e2) throw new Error(`ig_accounts okunamadı: ${e2.message}`);
  const next = new Map((accounts ?? []).map((a) => [a.username as string, Date.parse(a.next_check_at as string)]));
  const seen = new Set<string>();
  const out: IgTarget[] = [];
  for (const s of stores ?? []) {
    const u = s.instagram as string;
    if (skip.has(u) || seen.has(u) || (next.get(u) ?? 0) > Date.now()) continue;
    seen.add(u);
    out.push({ username: u, domain: s.domain as string });
    if (out.length >= limit) break;
  }
  return out;
}

export async function saveIgError(t: IgTarget, reason: string): Promise<void> {
  const now = Date.now();
  const { error } = await db()
    .from("ig_accounts")
    .upsert(
      { username: t.username, domain: t.domain, error: clip(reason, 300), checked_at: new Date(now).toISOString(), next_check_at: new Date(now + IG_RECHECK_DAYS.error * DAY).toISOString() },
      { onConflict: "username" },
    );
  if (error) throw new Error(`ig_accounts yazılamadı: ${error.message}`);
}

/** Hesabı ve son gönderilerini kaydeder; hesabın artık listede olmayan eski gönderileri silinir. */
export async function saveIgAccount(t: IgTarget, acc: IgAccount, posts: RankedPost[], medianEngagement: number): Promise<void> {
  const now = Date.now();
  const hot = posts.some((p) => p.outlier >= 3 && p.timestamp && now - Date.parse(p.timestamp) <= 30 * DAY);
  const { error } = await db()
    .from("ig_accounts")
    .upsert(
      {
        username: t.username,
        domain: t.domain,
        ig_id: acc.id,
        name: acc.name ? clip(acc.name, 120) : null,
        followers: acc.followers_count ?? null,
        media_count: acc.media_count ?? null,
        profile_pic: acc.profile_picture_url ?? null,
        median_engagement: medianEngagement,
        error: null,
        checked_at: new Date(now).toISOString(),
        next_check_at: new Date(now + (hot ? IG_RECHECK_DAYS.hot : IG_RECHECK_DAYS.normal) * DAY).toISOString(),
      },
      { onConflict: "username" },
    );
  if (error) throw new Error(`ig_accounts yazılamadı: ${error.message}`);
  if (posts.length === 0) return;
  const rows = posts.map((p) => ({
    id: p.id,
    username: t.username,
    domain: t.domain,
    caption: p.caption ? clip(p.caption, 1000) : null,
    likes: p.like_count ?? null,
    comments: p.comments_count ?? null,
    engagement: p.engagement,
    outlier: p.outlier,
    media_type: p.media_type ?? null,
    product_type: p.media_product_type ?? null,
    media_url: p.media_url ?? null,
    thumb_url: p.thumbnail_url ?? null,
    permalink: p.permalink ?? null,
    posted_at: p.timestamp ?? null,
    fetched_at: new Date(now).toISOString(),
  }));
  const { error: e2 } = await db().from("ig_posts").upsert(rows, { onConflict: "id" });
  if (e2) throw new Error(`ig_posts yazılamadı: ${e2.message}`);
  const keep = rows.map((r) => r.id);
  const { error: e3 } = await db().from("ig_posts").delete().eq("username", t.username).not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
  if (e3) throw new Error(`ig_posts temizlenemedi: ${e3.message}`);
}

/** Instagram ya da TikTok hesabı henüz aranmamış, reklam veren ya da puanı yüksek açık mağazalar (önce reklam verenler). */
export async function storesWithoutSocial(limit: number, minScore: number): Promise<string[]> {
  const { data, error } = await db()
    .from("stores")
    .select("domain")
    .or("instagram.is.null,tiktok.is.null,tech.is.null,tech->ids.is.null")
    .eq("status", "live")
    .or(`ad_points.gt.0,total_score.gte.${minScore}`)
    .order("ad_points", { ascending: false })
    .order("total_score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  return (data ?? []).map((d) => d.domain as string);
}

/** "" = ana sayfada bağlantı yok (yeniden aranmaz; mağaza kontrolünde güncellenir). */
export async function setStoreSocial(domain: string, handles: { instagram: string; tiktok: string; tech?: unknown }): Promise<void> {
  const { error } = await db()
    .from("stores")
    .update({ ...handles, ...(handles.tech ? { tech_at: new Date().toISOString() } : {}) })
    .eq("domain", domain);
  if (error) throw new Error(`stores güncellenemedi: ${error.message}`);
}

// ---- Arayüz ----

export type IgPostRow = {
  id: string;
  username: string;
  domain: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  engagement: number;
  outlier: number;
  media_type: string | null;
  product_type: string | null;
  media_url: string | null;
  thumb_url: string | null;
  permalink: string | null;
  posted_at: string | null;
  followers: number | null;
};

const POST_COLS = "id, username, domain, caption, likes, comments, engagement, outlier, media_type, product_type, media_url, thumb_url, permalink, posted_at";

async function withFollowers(rows: Omit<IgPostRow, "followers">[]): Promise<IgPostRow[]> {
  const names = [...new Set(rows.map((r) => r.username))];
  if (names.length === 0) return [];
  const { data } = await db().from("ig_accounts").select("username, followers").in("username", names);
  const f = new Map((data ?? []).map((a) => [a.username as string, a.followers as number | null]));
  return rows.map((r) => ({ ...r, outlier: Number(r.outlier), followers: f.get(r.username) ?? null }));
}

export type IgFilter = { days: number; video: boolean; domains: string[] | null; limit: number };

/** Çok tutan gönderiler: hesabın ortancasının en az 2 katı etkileşim alanlar, etkileşime göre. */
export async function topIgPosts(f: IgFilter): Promise<IgPostRow[]> {
  let q = db()
    .from("ig_posts")
    .select(POST_COLS)
    .gte("outlier", 2)
    .gte("posted_at", new Date(Date.now() - f.days * DAY).toISOString())
    .order("engagement", { ascending: false })
    .limit(f.limit);
  if (f.video) q = q.eq("media_type", "VIDEO");
  if (f.domains) q = q.in("domain", f.domains.length ? f.domains : ["-"]);
  const { data, error } = await q;
  if (error) throw new Error(`ig_posts okunamadı: ${error.message}`);
  return withFollowers((data ?? []) as Omit<IgPostRow, "followers">[]);
}

/** Bir mağazanın en çok etkileşim alan gönderileri (videolar "Videolar" bölümünde gösterildiği için görseller). */
export async function igPostsFor(domain: string, limit = 6, imagesOnly = true): Promise<{ account: { username: string; followers: number | null; error: string | null } | null; posts: IgPostRow[] }> {
  const { data: acc } = await db().from("ig_accounts").select("username, followers, error").eq("domain", domain).limit(1).maybeSingle();
  if (!acc) return { account: null, posts: [] };
  let q = db().from("ig_posts").select(POST_COLS).eq("username", acc.username);
  if (imagesOnly) q = q.or("media_type.is.null,media_type.neq.VIDEO");
  const { data } = await q.order("engagement", { ascending: false }).limit(limit);
  return {
    account: { username: acc.username as string, followers: acc.followers as number | null, error: acc.error as string | null },
    posts: await withFollowers((data ?? []) as Omit<IgPostRow, "followers">[]),
  };
}

/** İndirme için gönderinin dosya adresi (yalnızca veritabanındaki kayıttan; rastgele adres alınmaz). */
export async function igMedia(id: string): Promise<{ url: string; username: string; video: boolean } | null> {
  const { data } = await db().from("ig_posts").select("username, media_url, media_type").eq("id", id).maybeSingle();
  if (!data?.media_url) return null;
  return { url: data.media_url as string, username: data.username as string, video: data.media_type === "VIDEO" };
}

export type InstagramState = { status: "ok" | "no_token" | "no_permission" | "no_account" | "stopped"; reason?: string; checked?: number; found?: number; at: string };

/**
 * Ürün/mağaza sayfasının "Videolar" bölümü: mağazanın Instagram videoları (etkileşime göre) ve TikTok hesabı. Birden çok
 * mağazanın bağladığı TikTok hesabı temanın varsayılan bağlantısıdır, gösterilmez.
 */
export async function videosFor(domain: string, limit = 8): Promise<{ instagram: string | null; igVideos: IgPostRow[]; tiktok: string | null }> {
  const { data: store } = await db().from("stores").select("instagram, tiktok").eq("domain", domain).maybeSingle();
  let tiktok = (store?.tiktok as string | null) || null;
  if (tiktok) {
    const { count } = await db().from("stores").select("domain", { count: "exact", head: true }).eq("tiktok", tiktok);
    if ((count ?? 0) >= 3) tiktok = null;
  }
  const { data } = await db()
    .from("ig_posts")
    .select(POST_COLS)
    .eq("domain", domain)
    .eq("media_type", "VIDEO")
    .order("engagement", { ascending: false })
    .limit(limit);
  return { instagram: (store?.instagram as string | null) || null, igVideos: await withFollowers((data ?? []) as Omit<IgPostRow, "followers">[]), tiktok };
}
