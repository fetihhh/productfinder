// Instagram: mağazanın Instagram hesabı (ana sayfadaki bağlantı) ve resmi Instagram Graph API "Business Discovery" ile
// hesabın herkese açık son gönderileri (beğeni, yorum, görsel/video adresi). Ücretsizdir; Meta erişim anahtarında
// instagram_basic + pages_show_list izinleri ve Facebook sayfasına bağlı bir Instagram profesyonel hesabı gerekir.
// instagram.com sayfaları kazınmaz (robots.txt tüm botları engeller); yalnızca graph.facebook.com kullanılır.

import { classifyGraphError } from "./adLibrary.ts";

const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "explore",
  "accounts",
  "stories",
  "direct",
  "about",
  "developer",
  "legal",
  "instagram",
  "share",
  "sharer",
  "intent",
  "web",
  "embed",
  "privacy",
]);

/** Ana sayfadaki instagram.com/<kullanıcı> bağlantılarından en sık geçen kullanıcı adı. */
export function instagramHandle(html: string | null): string | null {
  if (!html) return null;
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/instagram\.com\\?\/(?:#!\\?\/)?([A-Za-z0-9._]{1,30})(?=[/"'?#\s<&\\]|$)/g)) {
    const h = m[1].toLowerCase().replace(/\.+$/, "");
    if (!h || RESERVED.has(h) || /^\d+$/.test(h)) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export type IgMedia = {
  id: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
};

export type IgAccount = {
  id: string;
  username: string;
  name?: string;
  followers_count?: number;
  media_count?: number;
  profile_picture_url?: string;
  media?: { data?: IgMedia[] };
};

export type RankedPost = IgMedia & { engagement: number; outlier: number };

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Gönderi etkileşimi = beğeni + 3 × yorum (yorum daha güçlü işarettir). "Çok tutan" ölçüsü hesabın kendi ortancasına göre
 * kaç kat (outlier): takipçisi az hesapta da hangi gönderinin patladığını gösterir. Beğenisi gizli gönderide yalnızca yorum sayılır.
 */
export function rankPosts(media: IgMedia[]): { posts: RankedPost[]; medianEngagement: number } {
  const withEng = media.map((m) => ({ ...m, engagement: (m.like_count ?? 0) + 3 * (m.comments_count ?? 0) }));
  const med = median(withEng.map((m) => m.engagement));
  const posts = withEng
    .map((m) => ({ ...m, outlier: med > 0 ? Math.round((m.engagement / med) * 10) / 10 : m.engagement > 0 ? 1 : 0 }))
    .sort((a, b) => b.engagement - a.engagement);
  return { posts, medianEngagement: med };
}

export type IgResult<T> = { ok: true; data: T } | { ok: false; fatal: boolean; reason: string };

const MEDIA_FIELDS = "id,caption,like_count,comments_count,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";

export function discoveryUrl(igUserId: string, username: string, version: string, limit = 30): string {
  const fields = `business_discovery.username(${username}){id,username,name,followers_count,media_count,profile_picture_url,media.limit(${limit}){${MEDIA_FIELDS}}}`;
  return `https://graph.facebook.com/${version}/${encodeURIComponent(igUserId)}?fields=${encodeURIComponent(fields)}`;
}

type GraphError = { message?: string; code?: number; error_subcode?: number };

export function instagramClient(token: string, version: string, fetchImpl: typeof fetch = fetch) {
  async function get<T>(url: string): Promise<IgResult<T>> {
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    } catch (err) {
      return { ok: false, fatal: false, reason: `Ağ hatası: ${(err as Error).message}` };
    }
    let body: T & { error?: GraphError };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, fatal: false, reason: `HTTP ${res.status}: JSON değil` };
    }
    if (!res.ok || body.error) {
      // Hesap bulunamadı / kişisel hesap (Business Discovery yalnızca profesyonel hesaplarda çalışır): yalnızca bu hesap atlanır.
      if (body.error?.code === 110 || body.error?.error_subcode === 2207013 || (body.error?.code === 100 && /business_discovery|username|user/i.test(body.error?.message ?? ""))) {
        return { ok: false, fatal: false, reason: `Hesap profesyonel değil ya da bulunamadı: ${(body.error?.message ?? "").slice(0, 120)}` };
      }
      const c = classifyGraphError(res.status, body.error);
      return { ok: false, fatal: c.fatal, reason: c.reason };
    }
    return { ok: true, data: body };
  }

  return {
    /** Anahtarın sahibinin Facebook sayfalarına bağlı Instagram profesyonel hesabının kimliği (Business Discovery için gerekir). */
    async ownAccountId(): Promise<IgResult<{ id: string; username: string | null } | null>> {
      const r = await get<{ data?: { instagram_business_account?: { id: string; username?: string } }[] }>(
        `https://graph.facebook.com/${version}/me/accounts?fields=${encodeURIComponent("instagram_business_account{id,username}")}&limit=50`,
      );
      if (!r.ok) return r;
      const acc = r.data.data?.find((p) => p.instagram_business_account)?.instagram_business_account;
      return { ok: true, data: acc ? { id: acc.id, username: acc.username ?? null } : null };
    },
    async discover(igUserId: string, username: string): Promise<IgResult<IgAccount>> {
      const r = await get<{ business_discovery?: IgAccount }>(discoveryUrl(igUserId, username, version));
      if (!r.ok) return r;
      return r.data.business_discovery ? { ok: true, data: r.data.business_discovery } : { ok: false, fatal: false, reason: "Boş yanıt" };
    },
  };
}
