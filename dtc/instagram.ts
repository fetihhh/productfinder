// Instagram: mağazanın Instagram hesabı (ana sayfadaki bağlantı) ve resmi Instagram Graph API "Business Discovery" ile
// hesabın herkese açık son gönderileri (beğeni, yorum, görsel/video adresi). Ücretsizdir; Meta erişim anahtarında
// instagram_basic + instagram_manage_insights + pages_show_list izinleri ve Facebook sayfasına bağlı bir Instagram profesyonel hesabı gerekir.
// instagram.com sayfaları kazınmaz (robots.txt tüm botları engeller); yalnızca graph.facebook.com kullanılır.

import { classifyGraphError } from "./adLibrary.ts";
import { hashtagSearchUrl, rankTagPosts, topMediaUrl } from "./hashtags.ts";

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
  // Tema/platform hesapları (temanın varsayılan sosyal bağlantısı; mağazanın kendi hesabı değil).
  "shopify",
  "shopifypartners",
  "themefullstack",
  "outofthesandbox",
  "pixelunion",
  "archetypethemes",
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

const TIKTOK_RESERVED = new Set(["tiktok", "shopify", "shopifypartners", "themefullstack", "username", "yourusername", "yourname"]);

/** Ana sayfadaki tiktok.com/@kullanıcı bağlantılarından en sık geçen kullanıcı adı. */
export function tiktokHandle(html: string | null): string | null {
  if (!html) return null;
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/tiktok\.com\\?\/@([A-Za-z0-9._]{2,24})(?=[/"'?#\s<&\\]|$)/g)) {
    const h = m[1].toLowerCase().replace(/\.+$/, "");
    if (!h || TIKTOK_RESERVED.has(h)) continue;
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
  website?: string;
  biography?: string;
  media?: { data?: IgMedia[] };
};

/**
 * Ana sayfasında bağlantı olmayan mağaza için olası kullanıcı adları: alan adı etiketi ("getcosmora"), ön/son ekleri
 * atılmış hali ("cosmora"), mağaza adı ("Cosmora Shop" → "cosmorashop", "cosmora") ve yaygın ekler (.official, _shop…).
 */
export function handleCandidates(domain: string, shopName: string | null, max = 6): string[] {
  const label = domain.split(".")[0].toLowerCase().replace(/[^a-z0-9._]/g, "");
  const core = label.replace(/^(get|try|shop|the|my|buy|use)(?=[a-z]{3})/, "").replace(/(shop|store|official|online|co|hq)$/, "");
  const name = (shopName ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const out = [label, core, name, `${core}.official`, `${core}_official`, `${core}shop`, `${core}.shop`, `${core}store`, `get${core}`, `${core}official`];
  return [...new Set(out.filter((h) => h.length >= 3 && h.length <= 30))].slice(0, max);
}

/** Hesap gerçekten bu mağazanın mı: profil web sitesi ya da açıklamada mağazanın alan adı geçiyor. */
export function accountMatchesStore(acc: Pick<IgAccount, "website" | "biography">, domain: string): boolean {
  const d = domain.toLowerCase();
  const label = d.split(".")[0];
  const site = (acc.website ?? "").toLowerCase();
  const bio = (acc.biography ?? "").toLowerCase();
  return site.includes(d) || bio.includes(d) || (label.length >= 5 && site.replace(/^https?:\/\/(www\.)?/, "").startsWith(`${label}.`));
}

/** TikTok'un resmi oEmbed API'si: hesap varsa yazar adı ve kullanıcı adı döner (robots.txt /oembed'e izin verir). */
export const tiktokOembedUrl = (handle: string) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${handle}`)}`;

export function parseTiktokOembed(text: string): { author: string; handle: string } | null {
  try {
    const j = JSON.parse(text) as { author_name?: string; author_url?: string; embed_product_id?: string; type?: string };
    const handle = j.embed_product_id ?? j.author_url?.match(/@([A-Za-z0-9._]+)/)?.[1];
    return handle && j.author_name ? { author: j.author_name, handle: handle.toLowerCase() } : null;
  } catch {
    return null;
  }
}

/**
 * TikTok hesabı mağazaya ait sayılır mı (TikTok'ta web sitesi alanı API'de yok; yanlış eşleşme yerine eşleşmeme seçilir):
 * kullanıcı adı alan adının tamamı (ya da + .official/_official/official) olmalı; değilse yazar adı mağaza adıyla birebir
 * aynı olmalı. "cyclairpro.com" için @cyclair ("Cyclairfohn", başka marka) kabul edilmez.
 */
export function tiktokMatchesStore(author: string, domain: string, shopName: string | null, handle = ""): boolean {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const label = norm(domain.split(".")[0]);
  const h = norm(handle);
  const a = norm(author);
  const name = norm(shopName ?? "");
  if (label.length >= 5 && [label, `${label}official`].includes(h)) return true;
  return name.length >= 4 && a === name && (h === name || h === `${name}official` || h === label);
}

const GIVEAWAY =
  /\b(giveaways?|gewinnspiel|sorteo|sorteio|concours|concorso|winactie|konkurs|çekiliş|cekilis)\b|tag\s+(?:a|your|\d+)\s+friends?|etiketle|menciona\s+a|identifie\s+\d*\s*amis?/i;

/** Çekiliş gönderisi (yorumlar katılım koşulu). */
export const isGiveaway = (caption: string | undefined | null) => Boolean(caption && GIVEAWAY.test(caption));

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
  // Çekilişte yorumlar "arkadaşını etiketle" koşuludur (ilgi değil): yorumun ağırlığı düşürülür.
  const withEng = media.map((m) => ({
    ...m,
    engagement: Math.round((m.like_count ?? 0) + (isGiveaway(m.caption) ? 0.2 : 3) * (m.comments_count ?? 0)),
  }));
  const med = median(withEng.map((m) => m.engagement));
  const posts = withEng
    .map((m) => ({ ...m, outlier: med > 0 ? Math.round((m.engagement / med) * 10) / 10 : m.engagement > 0 ? 1 : 0 }))
    .sort((a, b) => b.engagement - a.engagement);
  return { posts, medianEngagement: med };
}

export type IgResult<T> = { ok: true; data: T } | { ok: false; fatal: boolean; reason: string };

const MEDIA_FIELDS = "id,caption,like_count,comments_count,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";

export function discoveryUrl(igUserId: string, username: string, version: string, limit = 30): string {
  const fields = `business_discovery.username(${username}){id,username,name,website,biography,followers_count,media_count,profile_picture_url,media.limit(${limit}){${MEDIA_FIELDS}}}`;
  return `https://graph.facebook.com/${version}/${encodeURIComponent(igUserId)}?fields=${encodeURIComponent(fields)}`;
}

type GraphError = { message?: string; code?: number; error_subcode?: number };

export function instagramClient(token: string, version: string, fetchImpl: typeof fetch = fetch) {
  async function get<T>(url: string, timeoutMs = 20_000): Promise<IgResult<T>> {
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
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
    /** Etiketin kimliği (Hashtag Search; hesap başına 7 günde 30 farklı etiket). Etiket yoksa null. */
    async hashtagId(igUserId: string, tag: string): Promise<IgResult<string | null>> {
      const r = await get<{ data?: { id: string }[] }>(hashtagSearchUrl(version, igUserId, tag));
      return r.ok ? { ok: true, data: r.data.data?.[0]?.id ?? null } : r;
    },
    /** Etiketin en popüler gönderileri (son 24 saatte değil, genel popülerlik). */
    async topMedia(hashtagId: string, igUserId: string): Promise<IgResult<Parameters<typeof rankTagPosts>[1]>> {
      // Çok popüler etiketlerde (#hairgrowth) yanıt yavaştır.
      const r = await get<{ data?: Parameters<typeof rankTagPosts>[1] }>(topMediaUrl(version, hashtagId, igUserId), 60_000);
      return r.ok ? { ok: true, data: r.data.data ?? [] } : r;
    },
    /** Anahtara verilmiş izinler (tanı için; yalnızca izin adları). */
    async permissions(): Promise<string[]> {
      const r = await get<{ data?: { permission: string; status: string }[] }>(`https://graph.facebook.com/${version}/me/permissions`);
      return r.ok ? (r.data.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission) : [];
    },
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
