// Ürünün Instagram'da tutan gönderileri: ürün adından etiketler (#galaxyprojector) türetilir, resmi Instagram Graph API
// Hashtag Search ile etiketin en popüler gönderileri (top_media) alınır. Instagram hesap başına 7 günde en fazla 30 farklı
// etiket aramaya izin verir; bu yüzden ürün başına en fazla 2 etiket ve günde birkaç ürün aranır.
import { normalizeName } from "../lib/productName.ts";

const STOP = new Set([
  "the", "and", "for", "with", "pro", "plus", "max", "mini", "new", "set", "kit", "pack", "premium", "original", "official", "edition", "v2", "v3",
  "de", "la", "el", "le", "les", "des", "du", "et", "con", "para", "per", "il", "di", "und", "mit", "für", "fur", "en", "y", "a",
]);

/** Etiket adayları: kısa ürün adının ilk 2–3 anlamlı kelimesinin birleşimi ("galaxyprojector"), tek ayırt edici kelime değil. */
export function productHashtags(name: string, brandWords: string[] = [], max = 2): string[] {
  const words = normalizeName(name.split(/\s+[—–|·:-]\s+|\s*[|(]/)[0])
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w) && !brandWords.includes(w) && !/^\d+$/.test(w));
  const out: string[] = [];
  if (words.length >= 2) out.push(words.slice(0, 2).join(""));
  if (words.length >= 3) out.push(words.slice(1, 3).join(""), words.slice(0, 3).join(""));
  if (words.length === 1 && words[0].length >= 6) out.push(words[0]);
  return [...new Set(out.filter((t) => t.length >= 6 && t.length <= 30 && /^[a-z0-9]+$/.test(t)))].slice(0, max);
}

export type TagPost = {
  id: string;
  tag: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  likes: number | null;
  comments: number | null;
  posted_at: string | null;
  engagement: number;
};

type TopMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
};

/** En çok etkileşim alan videolar önce (Reels/video), sonra görseller; en fazla 12. */
export function rankTagPosts(tag: string, media: TopMedia[], max = 12): TagPost[] {
  return media
    .map((m) => ({
      id: m.id,
      tag,
      caption: m.caption ? m.caption.slice(0, 600) : null,
      media_type: m.media_type ?? null,
      media_url: m.media_url ?? null,
      permalink: m.permalink ?? null,
      likes: m.like_count ?? null,
      comments: m.comments_count ?? null,
      posted_at: m.timestamp ?? null,
      engagement: (m.like_count ?? 0) + 3 * (m.comments_count ?? 0),
    }))
    .sort((a, b) => Number(b.media_type === "VIDEO") - Number(a.media_type === "VIDEO") || b.engagement - a.engagement)
    .slice(0, max);
}

export const hashtagSearchUrl = (version: string, igUserId: string, tag: string) =>
  `https://graph.facebook.com/${version}/ig_hashtag_search?${new URLSearchParams({ user_id: igUserId, q: tag })}`;

export const topMediaUrl = (version: string, hashtagId: string, igUserId: string) =>
  `https://graph.facebook.com/${version}/${encodeURIComponent(hashtagId)}/top_media?${new URLSearchParams({
    user_id: igUserId,
    fields: "id,caption,media_type,media_url,permalink,like_count,comments_count,timestamp",
    limit: "50",
  })}`;
