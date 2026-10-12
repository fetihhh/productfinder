// Reklamın videosu/görseli sitenin içinde: Meta'nın Reklam Kütüphanesi API'si reklam dosyasını vermez, önizleme sayfası da
// gömülemez ve facebook.com otomatik okumayı yasaklar (robots.txt: Disallow: /). Ama dropshipping reklamlarının çoğu
// mağazanın Instagram'da paylaştığı gönderinin öne çıkarılmış hâlidir: reklam metni gönderi açıklamasıyla aynıdır.
// Eşleşen gönderinin videosu resmi Instagram Graph API'sinden (Business Discovery) gelir ve sayfada oynar.

export type IgMediaPost = {
  id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  thumb_url: string | null;
  permalink: string | null;
};

export type AdMedia = {
  postId: string;
  video: boolean;
  url: string | null;
  thumb: string | null;
  permalink: string | null;
  /** Reklam metninin gönderi açıklamasında bulunan kelime oranı (0–1). */
  match: number;
};

const words = (s: string) =>
  new Set(
    s
      .toLocaleLowerCase("en")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((w) => w.length >= 4),
  );

/** En az bu kadar ayırt edici kelime olmayan reklam metni eşleştirilmez (kısa metinler her gönderiyle benzeşir). */
export const MIN_AD_WORDS = 5;
/** Reklam metni kelimelerinin en az bu oranı gönderi açıklamasında geçmeli. */
export const MIN_MATCH = 0.6;

/**
 * Her reklamı mağazanın Instagram gönderilerinden metni en çok örtüşenle eşler (reklam metni kelimelerinin ≥ %60'ı gönderi
 * açıklamasında). Dosyası ya da bağlantısı olmayan gönderi atlanır. Eşleşme yoksa reklam haritada yer almaz.
 */
export function matchAdsToPosts(ads: { id: string; title: string | null; body: string | null }[], posts: IgMediaPost[]): Map<string, AdMedia> {
  const cands = posts.filter((p) => p.caption && (p.media_url || p.permalink)).map((p) => ({ p, w: words(p.caption!) }));
  const out = new Map<string, AdMedia>();
  if (cands.length === 0) return out;
  for (const ad of ads) {
    const aw = words(ad.body ?? "");
    if (aw.size < MIN_AD_WORDS) continue;
    let best: { p: IgMediaPost; m: number } | null = null;
    for (const c of cands) {
      let hit = 0;
      for (const w of aw) if (c.w.has(w)) hit++;
      const m = hit / aw.size;
      // Eşitlikte video tercih edilir (reklamların çoğu video).
      if (m >= MIN_MATCH && (!best || m > best.m || (m === best.m && c.p.media_type === "VIDEO" && best.p.media_type !== "VIDEO"))) best = { p: c.p, m };
    }
    if (best) {
      const p = best.p;
      out.set(ad.id, { postId: p.id, video: p.media_type === "VIDEO", url: p.media_url, thumb: p.thumb_url, permalink: p.permalink, match: Math.round(best.m * 100) / 100 });
    }
  }
  return out;
}
