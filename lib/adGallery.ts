// Reklam galerisi: tüm mağazaların en çok tutan Meta reklamları (uzun süredir yayında + çok kopyalanmış reklam metinleri).
import type { AdStage, CreativeGroup } from "../dtc/adAnalysis.ts";
import { db } from "./db.ts";

const DAY = 86_400_000;

export type GalleryAd = {
  domain: string;
  shopName: string | null;
  niche: string | null;
  timing: string | null;
  stage: AdStage;
  adScore: number;
  image: string | null;
  productTitle: string | null;
  productUrl: string | null;
  text: string;
  title: string | null;
  adId: string | null;
  active: number;
  count: number;
  days: number | null;
  reach: number;
  platforms: string[];
  /** Sıralama: yayındaki kopya, yayında kalma süresi ve mağazanın reklam skoru. */
  rank: number;
};

type Snap = { h: string; t: string; img: string | null };

export async function galleryAds(opts: { niche: string; activeOnly: boolean; limit: number; domain?: string; perStore?: number }): Promise<GalleryAd[]> {
  let q = db().from("ad_signals").select("domain, ad_stage, ad_score, creatives, top_products, active_ads").gt("total_ads", 0);
  if (opts.domain) q = q.eq("domain", opts.domain);
  const { data: sigs, error } = await q.order("ad_score", { ascending: false }).limit(300);
  if (error) throw new Error(`ad_signals okunamadı: ${error.message}`);
  const domains = (sigs ?? []).map((s) => s.domain as string);
  if (domains.length === 0) return [];
  const { data: stores } = await db()
    .from("stores")
    .select("domain, shop_name, niche, timing, hero_image, hero_handle, hero_title, products_snapshot")
    .in("domain", domains);
  const sBy = new Map((stores ?? []).map((s) => [s.domain as string, s]));
  const now = Date.now();
  const out: GalleryAd[] = [];
  for (const sig of sigs ?? []) {
    const s = sBy.get(sig.domain as string);
    if (opts.niche && (s?.niche ?? "other") !== opts.niche) continue;
    const top = ((sig.top_products as { handle: string; title: string }[] | null) ?? [])[0];
    const snap = ((s?.products_snapshot as Snap[] | null) ?? []).find((p) => p.h === (top?.handle ?? s?.hero_handle));
    const handle = top?.handle ?? (s?.hero_handle as string | null) ?? null;
    for (const c of (sig.creatives as CreativeGroup[] | null) ?? []) {
      if (opts.activeOnly && c.active === 0) continue;
      if (!c.text && !c.title) continue;
      const days = c.firstStart ? Math.max(0, Math.floor((now - Date.parse(c.firstStart)) / DAY)) : null;
      out.push({
        domain: sig.domain as string,
        shopName: (s?.shop_name as string | null) ?? null,
        niche: (s?.niche as string | null) ?? null,
        timing: (s?.timing as string | null) ?? null,
        stage: sig.ad_stage as AdStage,
        adScore: Number(sig.ad_score),
        image: snap?.img ?? (s?.hero_image as string | null) ?? null,
        productTitle: top?.title ?? snap?.t ?? (s?.hero_title as string | null) ?? null,
        productUrl: handle ? `https://${sig.domain}/products/${handle}` : `https://${sig.domain}/`,
        text: c.text,
        title: c.title ?? null,
        adId: c.adId ?? null,
        active: c.active,
        count: c.count,
        days,
        reach: c.reach ?? 0,
        platforms: c.platforms ?? [],
        rank: c.active * 4 + Math.min(days ?? 0, 60) * (c.active > 0 ? 1 : 0.2) + Number(sig.ad_score) / 4,
      });
    }
  }
  // Çeşitlilik: mağaza başına en fazla 2 reklam metni.
  const perStore = new Map<string, number>();
  return out
    .sort((a, b) => b.rank - a.rank)
    .filter((a) => {
      const n = (perStore.get(a.domain) ?? 0) + 1;
      perStore.set(a.domain, n);
      return n <= (opts.perStore ?? 2);
    })
    .slice(0, opts.limit);
}
