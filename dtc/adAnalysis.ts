// Reklam analizi: bir mağazanın Meta reklamlarından "bu ürün gerçekten kazandırıyor mu?" sorusuna kanıt çıkarır.
// Dropshipping'de kârsız reklam birkaç gün içinde kapatılır; kazandıran reklam haftalarca yayında kalır, aynı reklam
// metni yeni kitlelere kopyalanır, yeni reklamlar ve yeni ülkeler eklenir (ölçekleme).
import { normalizeName } from "../lib/productName.ts";
import type { ArchivedAd } from "./adLibrary.ts";
import { adOffers, type AdOffers } from "./offers.ts";

const DAY = 86_400_000;

export type AdStage = "proven" | "scaling" | "testing" | "stopped" | "none";

export const STAGE_LABELS: Record<AdStage, string> = {
  proven: "Kanıtlanmış winner",
  scaling: "Ölçekleniyor",
  testing: "Test aşamasında",
  stopped: "Reklamlar durmuş",
  none: "Reklam yok",
};

export type AdScoreParts = { sureklilik: number; olceklenme: number; kopya: number; erisim: number; genisleme: number };
export type CreativeGroup = { text: string; count: number; active: number; firstStart: string | null };
export type AdvertisedProduct = { handle: string; title: string; ads: number };

export type AdAnalysis = {
  score: number;
  stage: AdStage;
  parts: AdScoreParts;
  /** En çok tekrar eden reklam metinleri (aynı reklamın yeni kitlelere kopyalanması = ölçekleme). */
  creatives: CreativeGroup[];
  /** Reklamların gösterildiği AB ülkeleri. */
  countries: string[];
  /** 7 ve 14 günden uzun süredir yayında olan reklam sayısı. */
  active7d: number;
  active14d: number;
  /** Kaba reklam harcaması aralığı (€): AB erişimi × sıklık × CPM. */
  spend: { low: number; high: number } | null;
  /** Reklamı verilen ürünler (reklam başlığı/metni ↔ mağaza ürünleri). */
  products: AdvertisedProduct[];
  /** Reklam metinlerinde öne çıkan teklifler (indirim %, ücretsiz kargo, paket, aciliyet, garanti). */
  offers: AdOffers;
};

const isActive = (ad: ArchivedAd, now: number) => !ad.ad_delivery_stop_time || Date.parse(ad.ad_delivery_stop_time) > now;
const ageDays = (ad: ArchivedAd, now: number) => (ad.ad_delivery_start_time ? (now - Date.parse(ad.ad_delivery_start_time)) / DAY : 0);

/** Reklam metnini karşılaştırma için sadeleştirir (emoji, rakam, noktalama ve boşluk farkları önemsiz). */
export function creativeKey(ad: ArchivedAd): string {
  const text = ad.ad_creative_bodies?.find(Boolean) ?? ad.ad_creative_link_titles?.find(Boolean) ?? "";
  return normalizeName(text.replace(/\d+/g, " ")).slice(0, 140);
}

/** Reklamı verilen ürün: reklam başlığı/metni, ürün adının ayırt edici kelimelerinin çoğunu içeriyor. */
export function advertisedProducts(ads: ArchivedAd[], products: { h: string; t: string }[]): AdvertisedProduct[] {
  const words = (s: string) => [...new Set(normalizeName(s).split(" ").filter((w) => w.length >= 4))];
  const prods = products.map((p) => ({ ...p, w: words(p.t) })).filter((p) => p.w.length > 0);
  const counts = new Map<string, number>();
  for (const ad of ads) {
    const text = ` ${normalizeName([...(ad.ad_creative_link_titles ?? []), ...(ad.ad_creative_bodies ?? []), ...(ad.ad_creative_link_descriptions ?? [])].join(" "))} `;
    let best: { h: string; cov: number } | null = null;
    for (const p of prods) {
      const cov = p.w.filter((w) => text.includes(` ${w} `)).length / p.w.length;
      const need = p.w.length <= 2 ? 1 : 0.6;
      if (cov >= need && (!best || cov > best.cov)) best = { h: p.h, cov };
    }
    if (best) counts.set(best.h, (counts.get(best.h) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h, n]) => ({ handle: h, title: products.find((p) => p.h === h)!.t, ads: n }));
}

/**
 * Reklam kanıt skoru (0–100):
 *   süreklilik  35 — hâlâ yayındaki en eski reklam ≥ 30 gün 35, ≥ 21 → 30, ≥ 14 → 25, ≥ 7 → 15, ≥ 3 → 6;
 *                    ya da 7 günü geçmiş yayında reklam sayısı ≥ 5 → 30, ≥ 3 → 22 (hangisi yüksekse)
 *   ölçeklenme  25 — son 14 günde açılan reklam ≥ 30 → 25, ≥ 15 → 20, ≥ 8 → 14, ≥ 3 → 8, ≥ 1 → 3
 *   kopya       15 — aynı reklam metninin yayındaki kopyası ≥ 5 → 15, ≥ 3 → 10, ≥ 2 → 5
 *   erişim      15 — AB'de toplam erişim ≥ 200 B → 15, ≥ 50 B → 11, ≥ 10 B → 7, ≥ 1 B → 3
 *   genişleme   10 — gösterildiği AB ülkesi ≥ 8 → 10, ≥ 4 → 7, ≥ 2 → 4
 * Yayında reklam kalmadıysa en fazla 15.
 */
export function analyzeAds(all: ArchivedAd[], activeAds: ArchivedAd[] | null, now = Date.now(), products: { h: string; t: string }[] = []): AdAnalysis {
  const byId = new Map<string, ArchivedAd>();
  for (const a of [...all, ...(activeAds ?? [])]) if (!byId.has(a.id)) byId.set(a.id, a);
  const ads = [...byId.values()];
  const active = (activeAds ?? ads).filter((a) => isActive(a, now));
  const longest = active.reduce((m, a) => Math.max(m, ageDays(a, now)), 0);
  const active7d = active.filter((a) => ageDays(a, now) >= 7).length;
  const active14d = active.filter((a) => ageDays(a, now) >= 14).length;
  const new14 = ads.filter((a) => a.ad_delivery_start_time && now - Date.parse(a.ad_delivery_start_time) <= 14 * DAY).length;

  const groups = new Map<string, CreativeGroup>();
  for (const a of ads) {
    const key = creativeKey(a);
    if (!key) continue;
    const g = groups.get(key) ?? { text: (a.ad_creative_bodies?.find(Boolean) ?? a.ad_creative_link_titles?.find(Boolean) ?? "").slice(0, 200), count: 0, active: 0, firstStart: null };
    g.count++;
    if (isActive(a, now)) g.active++;
    if (a.ad_delivery_start_time && (!g.firstStart || a.ad_delivery_start_time < g.firstStart)) g.firstStart = a.ad_delivery_start_time;
    groups.set(key, g);
  }
  const creatives = [...groups.values()].sort((a, b) => b.active - a.active || b.count - a.count).slice(0, 3);
  const maxDup = creatives[0]?.active ?? 0;

  const countries = [...new Set(ads.flatMap((a) => (a.age_country_gender_reach_breakdown ?? []).map((b) => b.country).filter((c): c is string => Boolean(c))))].sort();
  const reach = ads.reduce((s, a) => s + (typeof a.eu_total_reach === "number" ? a.eu_total_reach : 0), 0);
  // Kaba harcama: erişim × 1,6 gösterim/kişi × 5–12 € CPM. Yalnızca büyüklük fikri verir.
  const spend = reach > 0 ? { low: Math.round((reach * 1.6 * 5) / 1000), high: Math.round((reach * 1.6 * 12) / 1000) } : null;

  const parts: AdScoreParts = {
    sureklilik: Math.max(
      longest >= 30 ? 35 : longest >= 21 ? 30 : longest >= 14 ? 25 : longest >= 7 ? 15 : longest >= 3 ? 6 : 0,
      active7d >= 5 ? 30 : active7d >= 3 ? 22 : 0,
    ),
    olceklenme: new14 >= 30 ? 25 : new14 >= 15 ? 20 : new14 >= 8 ? 14 : new14 >= 3 ? 8 : new14 >= 1 ? 3 : 0,
    kopya: maxDup >= 5 ? 15 : maxDup >= 3 ? 10 : maxDup >= 2 ? 5 : 0,
    erisim: reach >= 200_000 ? 15 : reach >= 50_000 ? 11 : reach >= 10_000 ? 7 : reach >= 1_000 ? 3 : 0,
    genisleme: countries.length >= 8 ? 10 : countries.length >= 4 ? 7 : countries.length >= 2 ? 4 : 0,
  };
  const raw = parts.sureklilik + parts.olceklenme + parts.kopya + parts.erisim + parts.genisleme;
  const score = active.length === 0 ? Math.min(15, raw) : raw;
  const stage: AdStage =
    ads.length === 0
      ? "none"
      : active.length === 0
        ? "stopped"
        : parts.sureklilik >= 25 && active.length >= 2
          ? "proven"
          : parts.olceklenme >= 14 || parts.kopya >= 10
            ? "scaling"
            : "testing";

  const texts = ads.map((a) => [...(a.ad_creative_link_titles ?? []), ...(a.ad_creative_bodies ?? []), ...(a.ad_creative_link_descriptions ?? [])].join(" "));
  return { score, stage, parts, creatives, countries, active7d, active14d, spend, products: advertisedProducts(ads, products), offers: adOffers(texts) };
}
