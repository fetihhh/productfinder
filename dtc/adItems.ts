// Tek tek reklamlar: Reklam Kütüphanesi kaydı → saklanan satır, ve ürün sayfasındaki listenin sıralaması.
import { normalizeName } from "../lib/productName.ts";
import { clip } from "../lib/text.ts";
import { creativeKey } from "./adAnalysis.ts";
import type { ArchivedAd } from "./adLibrary.ts";
import { audienceOf } from "./audience.ts";

export type AdItem = {
  id: string;
  domain: string;
  page_id: string | null;
  page_name: string | null;
  start_at: string | null;
  stop_at: string | null;
  title: string | null;
  body: string | null;
  description: string | null;
  platforms: string[];
  eu_reach: number | null;
  countries: string[];
  female_share: number | null;
  top_age: string | null;
  creative_key: string | null;
};

export function adItemRow(ad: ArchivedAd, domain: string): AdItem {
  const aud = audienceOf([ad]);
  const known = aud ? aud.female + aud.male : 0;
  const topAge = aud?.ages.reduce<{ range: string; share: number } | null>((b, a) => (!b || a.share > b.share ? a : b), null);
  return {
    id: ad.id,
    domain,
    page_id: ad.page_id ?? null,
    page_name: ad.page_name ? clip(ad.page_name, 120) : null,
    start_at: ad.ad_delivery_start_time ?? null,
    stop_at: ad.ad_delivery_stop_time ?? null,
    title: ad.ad_creative_link_titles?.find(Boolean) ? clip(ad.ad_creative_link_titles.find(Boolean)!, 200) : null,
    body: ad.ad_creative_bodies?.find(Boolean) ? clip(ad.ad_creative_bodies.find(Boolean)!, 1500) : null,
    description: ad.ad_creative_link_descriptions?.find(Boolean) ? clip(ad.ad_creative_link_descriptions.find(Boolean)!, 300) : null,
    platforms: ad.publisher_platforms ?? [],
    eu_reach: typeof ad.eu_total_reach === "number" ? ad.eu_total_reach : null,
    countries: aud ? aud.countries.map((c) => c.code) : [...new Set((ad.age_country_gender_reach_breakdown ?? []).map((b) => b.country).filter((c): c is string => Boolean(c)))],
    female_share: known > 0 ? Math.round((aud!.female / known) * 1000) / 1000 : null,
    top_age: topAge?.range ?? null,
    creative_key: creativeKey(ad) || null,
  };
}

const DAY = 86_400_000;

/** Arayüzde gösterilen reklam: yayında mı, kaç gündür, aynı metnin kaç kopyası var, önerilen sıra puanı. */
export type AdItemView = AdItem & { active: boolean; days: number | null; copies: number; activeCopies: number; score: number };

/**
 * Önerilen sıra ("en çok tutan" önce): yayında olan reklam önce, yayında kalma süresi (kârsız reklam birkaç günde kapatılır),
 * aynı metnin yayındaki kopya sayısı (ölçekleme) ve erişim.
 */
export function viewAdItems(items: AdItem[], now = Date.now()): AdItemView[] {
  const isActive = (i: AdItem) => !i.stop_at || Date.parse(i.stop_at) > now;
  const groups = new Map<string, { n: number; active: number }>();
  for (const i of items) {
    if (!i.creative_key) continue;
    const g = groups.get(i.creative_key) ?? { n: 0, active: 0 };
    g.n++;
    if (isActive(i)) g.active++;
    groups.set(i.creative_key, g);
  }
  return items
    .map((i) => {
      const active = isActive(i);
      const end = active ? now : Date.parse(i.stop_at!);
      const days = i.start_at ? Math.max(0, Math.floor((end - Date.parse(i.start_at)) / DAY)) : null;
      const g = i.creative_key ? groups.get(i.creative_key) : undefined;
      const reach = Number(i.eu_reach ?? 0);
      const score = (active ? 1 : 0.35) * Math.min(days ?? 0, 90) + 4 * (g?.active ?? 0) + 3 * Math.log10(1 + reach);
      return { ...i, active, days, copies: g?.n ?? 1, activeCopies: g?.active ?? (active ? 1 : 0), score: Math.round(score * 10) / 10 };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Her reklamı mağazanın hangi ürününe ait olduğuna göre eşler: reklam başlığı/metni/açıklaması ürün adının ayırt edici
 * kelimelerinin çoğunu (2 kelimelik adlarda 1'ini) içeriyorsa o ürün. Hiçbir ürünle eşleşmeyen reklam, mağazanın öne
 * çıkan ürününe yazılır (dropshipping mağazaları reklamın çoğunu tek ürüne verir; reklam dili ürün adından farklı olabilir).
 */
export function assignAdsToProducts(items: Pick<AdItem, "id" | "title" | "body" | "description">[], products: { h: string; t: string }[], heroHandle: string | null): Map<string, string | null> {
  const words = (s: string) => [...new Set(normalizeName(s).split(" ").filter((w) => w.length >= 4))];
  const prods = products.map((p) => ({ h: p.h, w: words(p.t) })).filter((p) => p.w.length > 0);
  const out = new Map<string, string | null>();
  for (const i of items) {
    const text = ` ${normalizeName([i.title, i.body, i.description].filter(Boolean).join(" "))} `;
    let best: { h: string; cov: number } | null = null;
    for (const p of prods) {
      const cov = p.w.filter((w) => text.includes(` ${w} `)).length / p.w.length;
      const need = p.w.length <= 2 ? 0.5 : 0.6;
      if (cov >= need && (!best || cov > best.cov)) best = { h: p.h, cov };
    }
    out.set(i.id, best?.h ?? heroHandle);
  }
  return out;
}
