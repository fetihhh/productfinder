// Tahminler ve "winner" skoru (0–100). Tüm sayılar kamuya açık işaretlerden türetilmiş KABA tahminlerdir.
//
// Tahmini aylık ziyaret  = 2,4·10¹⁰ × rank^−0,9   (Tranco sırası; aralık ×0,5 – ×2)
//   ör. 10.000. site ≈ 6 M, 100.000. ≈ 760 B, 1.000.000. ≈ 96 B ziyaret/ay. Listede olmayan site < ~100 B.
// Tahmini satış          = yorum sayısı × 10 – 50  (alıcıların %2–%10'u yorum bırakır varsayımı)
// Tahmini aylık satış    = son ≤30 günde eklenen yorum (aylığa ölçeklenmiş, en az 7 günlük veri) × 10 – 50
//
// Winner skoru = KANIT (ürün satıyor mu?) + UYGUNLUK (satılabilir mi?) × kanıt kapısı. Toplam en fazla 100.
//  Kanıt (en fazla 100). Ağırlıklar yeni mağazalarda gerçekten ölçülebilen işaretlere göre: trafik sırası (Tranco ilk 1 M)
//  ve blog gündemi yeni mağazalarda neredeyse hiç oluşmuyor; puan ürün bazında stok hareketine ve kopyalara kaydırıldı.
//   reklam  25 × min(1, reklam kanıt skoru / 80) + 5 × min(1, son 14 günde açılan reklam / 3)
//           (Meta Reklam Kütüphanesi: süreklilik, ölçekleme, kopya, erişim, ülke; en güçlü işaret + bütçe artırımı)
//   talep   20 × min(1, log10(1 + yorum) / 3) × puan katsayısı   (1000 yorum = tam; ★<4 → ×0,6, ★4–4,5 → ×0,85)
//           Yorum artışı henüz ölçülmediyse ×0,5: yeni mağazalar yorumları çoğu zaman toplu içe aktarır.
//           Yorum yoksa toptancı satışı: 10 × min(1, log10(1 + satış) / 4) (ilan fotoğrafla eşleşmediyse ×0,5)
//   ivme    15 × min(1, aylık yeni yorum / 30) (en az 7 günlük ölçüm); yoksa toptancı satış hızı 15 × min(1, haftalık / 100)
//   trafik  3 × sıra puanı + 1 × sıra iyileşmesi   (1 M → 0,1; ≤150 B → 1; 30 günde %20 iyileşme = 1)
//   gündem  1 × trend skoru / 100                  (bloglarda anılma)
//   hareket 15 → ürünün kendi stok azalması (satış işareti): 1 → 6, 2 → 10, 3–4 → 12, ≥ 5 → 15
//           ürün bazında ölçüm yoksa mağazanın toplamı yarım: 1 → 3, ≥ 2 → 5, ≥ 5 → 7
//   kopya   15 → aynı ürünü satan bağımsız mağaza (ürün bazında görsel eşleşmesi): 1 → 6, 2 → 10, 3–4 → 12, ≥ 5 → 15
//           (aynı satıcı ağı sayılmaz)
//  Uygunluk (en fazla 25), kanıt kapısıyla çarpılır: min(1, kanıt / 30). Kanıtı olmayan ürün yalnızca ucuz toptancısı ve
//  uygun fiyatı olduğu için üste çıkamaz.
//   fiyat   10 → 25–150 $, 5 → 15–25 $ veya 150–300 $, 0 → diğer
//   tedarik 15 → toptancıda benzer ürün (benzerlik ≥ %70) 6 + marj puanı (perakende / toptan ≥ 4 → 9, ≥ 3 → 7, ≥ 2 → 4)
//
// Yükseliş skoru ("Yükselenler" görünümü, 0–100): büyüklükten bağımsız, HIZ ölçer.
//   yorum   45 × min(1, aylık büyüme / %30)     aylık büyüme = aylık yeni yorum / max(20, toplam yorum); en az 3 yeni yorum/ay
//   trafik  35 × min(1, (eski sıra / yeni sıra − 1) / 0,2)   (30 günde %20 sıra iyileşmesi = tam)
//   gündem  20 × min(1, son 7 gündeki blog yazısı / 2)
//   reklam  25 × min(1, son 14 günde açılan reklam / 3)   (reklam bütçesinin artırılması). Toplam en fazla 100.

import { IMAGE_MATCH_MAX } from "../config/limits.ts";

export type RankPoint = { day: string; rank: number | null };
export type SnapshotPoint = { day: string; review_count: number | null };
export type Range = { low: number; high: number };

export type WinnerInput = {
  reviewCount: number | null;
  rating: number | null;
  price: number | null;
  currency: string | null;
  trendScore: number;
  /** Son 7 gündeki blog yazısı sayısı (trend skoru dökümündeki m7). */
  mentions7d?: number;
  ranks: RankPoint[];
  snapshots: SnapshotPoint[];
  /** Toptancı araması: en iyi eşleşmelerin en düşük birim fiyatı (USD) ve kâr marjı (perakende / toptan). */
  supplierMinUsd?: number | null;
  marginRatio?: number | null;
  /** Reklam kanıt skoru (0–100); yoksa reklam puanından (0–25) × 4. Son 14 günde açılan reklam sayısı. */
  adScore?: number;
  adPoints?: number;
  newAds14d?: number;
  /** Ürünün mağazasında toplam stok azalması ve aynı ürünü satan bağımsız mağaza sayısı (yeni mağaza keşfi). */
  stockDrops?: number;
  independentCopies?: number;
  /** Ürün bazında (store_items): ürünün kendi stok azalması ve aynı ürünü satan bağımsız mağaza sayısı; varsa mağaza toplamının yerine geçer. */
  productStockDrops?: number | null;
  productCopies?: number | null;
  /** Asıl toptan ilanın toplam satışı ve haftalık satış hızı (AliExpress "N sold"); ilan fotoğrafla mı eşleşti. */
  supplierSold?: number | null;
  supplierSoldPerWeek?: number | null;
  supplierByImage?: boolean;
};

export type Momentum = {
  score: number;
  parts: { yorum: number; trafik: number; gundem: number; reklam: number };
  /** Aylık yorum büyümesi (0,25 = %25). */
  reviewGrowth: number | null;
};

export type WinnerBreakdown = {
  parts: { talep: number; ivme: number; trafik: number; gundem: number; fiyat: number; tedarik: number; reklam: number; hareket: number; kopya: number };
  rank: number | null;
  rankChange: number | null;
  visits: Range | null;
  sales: Range | null;
  reviewsPerMonth: number | null;
  salesPerMonth: Range | null;
  revenuePerMonth: Range | null;
  priceUsd: number | null;
  historyDays: number;
  /** Kanıt puanı (reklam, talep, ivme, trafik, gündem, hareket, kopya) ve uygunluk kapısı (0–1). */
  evidence?: number;
  gate?: number;
  momentum: Momentum;
};

export function momentumScore(reviews: number | null, rpm: number | null, change: number | null, mentions7d: number, newAds14d = 0): Momentum {
  const reviewGrowth = rpm !== null && rpm >= 3 ? rpm / Math.max(20, reviews ?? 0) : null;
  const parts = {
    yorum: round1(reviewGrowth === null ? 0 : 45 * clamp01(reviewGrowth / 0.3)),
    trafik: round1(change === null ? 0 : 35 * clamp01((change - 1) / 0.2)),
    gundem: round1(20 * clamp01(mentions7d / 2)),
    reklam: round1(25 * clamp01(newAds14d / 3)),
  };
  return {
    score: round1(Math.min(100, parts.yorum + parts.trafik + parts.gundem + parts.reklam)),
    parts,
    reviewGrowth: reviewGrowth === null ? null : Math.round(reviewGrowth * 1000) / 1000,
  };
}

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const REVIEW_TO_SALES: Range = { low: 10, high: 50 };

/** Fiyat bandı karşılaştırması için yaklaşık kurlar (1 birim = x USD). Kesin değildir, yalnızca bant seçer. */
const USD_RATE: Record<string, number> = {
  USD: 1, EUR: 1.1, GBP: 1.3, CHF: 1.15, CAD: 0.73, AUD: 0.66, NZD: 0.6, SGD: 0.75, HKD: 0.13,
  CNY: 0.14, JPY: 0.0068, KRW: 0.00073, SEK: 0.095, NOK: 0.093, DKK: 0.15, PLN: 0.25, TRY: 0.025, INR: 0.012,
};

export function toUsd(price: number | null, currency: string | null): number | null {
  if (price === null || !Number.isFinite(Number(price))) return null;
  const rate = USD_RATE[(currency ?? "USD").toUpperCase()];
  return rate ? Number(price) * rate : null;
}

export function visitsFromRank(rank: number): Range & { mid: number } {
  const mid = 2.4e10 * Math.pow(rank, -0.9);
  return { low: Math.round(mid / 2), mid: Math.round(mid), high: Math.round(mid * 2) };
}

/** En yeni ölçüm ile ondan ≤30 gün önceki en eski ölçüm arasındaki fark. */
function window30<T extends { day: string }>(points: T[], value: (p: T) => number | null): { latest: number; earliest: number; days: number } | null {
  const valid = points.filter((p) => value(p) !== null).sort((a, b) => a.day.localeCompare(b.day));
  if (valid.length < 2) return null;
  const last = valid[valid.length - 1];
  const lastT = Date.parse(last.day);
  const first = valid.find((p) => lastT - Date.parse(p.day) <= 30 * DAY)!;
  const days = (lastT - Date.parse(first.day)) / DAY;
  return { latest: value(last)!, earliest: value(first)!, days };
}

export function reviewsPerMonth(snapshots: SnapshotPoint[]): number | null {
  const w = window30(snapshots, (s) => s.review_count);
  if (!w || w.days < 7) return null;
  return Math.max(0, ((w.latest - w.earliest) / w.days) * 30);
}

/** Sıra iyileşme oranı: eski sıra / yeni sıra (>1 → trafik artıyor). */
export function rankChange(ranks: RankPoint[]): number | null {
  const w = window30(ranks, (r) => r.rank);
  if (!w || w.days < 7) return null;
  return w.earliest / w.latest;
}

export function rankPoints(rank: number | null): number {
  if (!rank) return 0;
  return clamp01(0.1 + (0.9 * (6 - Math.log10(rank))) / (6 - Math.log10(150_000)));
}

/** Tedarik puanı: toptancıda benzer ürün bulunduysa 8, üstüne kâr marjına göre en fazla 12. */
/**
 * Toptan ilanın satış hızı (haftalık): son ≤ 60 gündeki en eski ve en yeni ölçüm arasındaki satış artışı, en az 6 gün arayla.
 * AliExpress büyük sayıları yuvarlar ("5,000+ sold"); artış ancak bir sonraki eşik aşılınca görünür.
 */
export function soldPerWeek(points: { day: string; sold: number | null }[]): number | null {
  const valid = points.filter((p) => p.sold !== null).sort((a, b) => a.day.localeCompare(b.day));
  if (valid.length < 2) return null;
  const last = valid[valid.length - 1];
  const first = valid.find((p) => Date.parse(last.day) - Date.parse(p.day) <= 60 * DAY)!;
  const days = (Date.parse(last.day) - Date.parse(first.day)) / DAY;
  if (days < 6) return null;
  return Math.round((Math.max(0, last.sold! - first.sold!) / days) * 7 * 10) / 10;
}

export function supplyPoints(supplierMinUsd: number | null, margin: number | null): number {
  if (supplierMinUsd === null) return 0;
  const m = margin ?? 0;
  return 6 + (m >= 4 ? 9 : m >= 3 ? 7 : m >= 2 ? 4 : 0);
}

/** Uygunluk puanının (fiyat + tedarik) tam sayılması için gereken kanıt puanı. */
export const EVIDENCE_GATE = 30;

/** Yalnızca metin benzerliğiyle bulunan ilanlarda kabul edilen en yüksek perakende/toptan oranı. */
export const MAX_TEXT_MARGIN = 50;

/**
 * Benzerliği ≥ %70 olan toptancı ilanlarındaki en düşük birim fiyat (USD) ve perakende fiyata oranı.
 * Fotoğrafla eşleşen (aynı ürün olduğu neredeyse kesin) fiyatlı ilan varsa yalnızca onlar kullanılır.
 */
export function supplierEconomics(
  offers: { similarity: number; priceMin: number | null; currency: string | null; imageDistance?: number | null }[],
  retailPrice: number | null,
  retailCurrency: string | null,
): { minUsd: number | null; margin: number | null } {
  const priced = offers.filter((o) => o.similarity >= 0.7 && o.priceMin !== null && o.priceMin > 0);
  const byImage = priced.filter((o) => o.imageDistance != null && o.imageDistance <= IMAGE_MATCH_MAX);
  const retail = toUsd(retailPrice, retailCurrency);
  // Fotoğrafla doğrulanmamış ilanda perakende fiyatın 1/50'sinden ucuz toptan fiyat gerçekçi değildir
  // (farklı ürün, aksesuar ya da toplu adet fiyatı): marj hesabına katılmaz.
  const plausible = (usd: number) => byImage.length > 0 || retail === null || retail / usd <= MAX_TEXT_MARGIN;
  const prices = (byImage.length ? byImage : priced)
    .map((o) => toUsd(o.priceMin, o.currency))
    .filter((n): n is number => n !== null && n > 0 && plausible(n));
  if (prices.length === 0) return { minUsd: null, margin: null };
  const minUsd = Math.round(Math.min(...prices) * 100) / 100;
  return { minUsd, margin: retail === null ? null : Math.round((retail / minUsd) * 10) / 10 };
}

export function pricePoints(usd: number | null): number {
  if (usd === null) return 0;
  if (usd >= 25 && usd <= 150) return 10;
  if ((usd >= 15 && usd < 25) || (usd > 150 && usd <= 300)) return 5;
  return 0;
}

function ratingFactor(rating: number | null): number {
  if (rating === null) return 1;
  if (rating >= 4.5) return 1;
  return rating >= 4 ? 0.85 : 0.6;
}

/** Ürünün kendi stok azalması (ölçüldüyse) ya da mağazanın toplamı (yarım puan). */
export function movementPoints(productDrops: number | null, storeDrops: number): number {
  if (productDrops !== null && productDrops > 0) return productDrops >= 5 ? 15 : productDrops >= 3 ? 12 : productDrops >= 2 ? 10 : 6;
  return storeDrops >= 5 ? 7 : storeDrops >= 2 ? 5 : storeDrops >= 1 ? 3 : 0;
}

/** Aynı ürünü satan bağımsız mağaza sayısına göre kopya puanı. */
export function copyTier(copies: number): number {
  return copies >= 5 ? 15 : copies >= 3 ? 12 : copies >= 2 ? 10 : copies >= 1 ? 6 : 0;
}

const scale = (n: number, r: Range): Range => ({ low: Math.round(n * r.low), high: Math.round(n * r.high) });

export function winnerScore(input: WinnerInput): { score: number; breakdown: WinnerBreakdown } {
  const reviews = input.reviewCount;
  const latestRank = [...input.ranks].sort((a, b) => b.day.localeCompare(a.day))[0]?.rank ?? null;
  const change = rankChange(input.ranks);
  const rpm = reviewsPerMonth(input.snapshots);
  const priceUsd = toUsd(input.price, input.currency);

  // Artışı ölçülmemiş yorumlar yarım sayılır (toplu içe aktarılmış olabilir).
  const reviewTalep = reviews ? 20 * clamp01(Math.log10(1 + reviews) / 3) * ratingFactor(input.rating) * (rpm === null ? 0.5 : 1) : 0;
  const supplierTalep = input.supplierSold ? 10 * clamp01(Math.log10(1 + input.supplierSold) / 4) * (input.supplierByImage ? 1 : 0.5) : 0;
  const talep = Math.max(reviewTalep, supplierTalep);
  const perWeek = input.supplierSoldPerWeek ?? null;
  const ivme = rpm !== null ? 15 * clamp01(rpm / 30) : perWeek !== null ? 15 * clamp01(perWeek / 100) * (input.supplierByImage ? 1 : 0.5) : 0;
  const trafik = 3 * rankPoints(latestRank) + (change === null ? 0 : clamp01((change - 1) / 0.2));
  const gundem = clamp01(Number(input.trendScore) / 100);
  const adScore = input.adScore ?? (input.adPoints ?? 0) * 4;
  const reklam = 25 * clamp01(adScore / 80) + (adScore > 0 ? 5 * clamp01((input.newAds14d ?? 0) / 3) : 0);
  const hareket = movementPoints(input.productStockDrops ?? null, input.stockDrops ?? 0);
  const kopya = copyTier(input.productCopies ?? input.independentCopies ?? 0);
  const evidence = talep + ivme + trafik + gundem + reklam + hareket + kopya;
  const gate = clamp01(evidence / EVIDENCE_GATE);
  const fiyat = pricePoints(priceUsd) * gate;
  const tedarik = supplyPoints(input.supplierMinUsd ?? null, input.marginRatio ?? null) * gate;

  const salesPerMonth = rpm === null ? null : scale(rpm, REVIEW_TO_SALES);
  const days = new Set([...input.snapshots.map((s) => s.day), ...input.ranks.map((r) => r.day)]);
  const parts = { talep: round1(talep), ivme: round1(ivme), trafik: round1(trafik), gundem: round1(gundem), fiyat: round1(fiyat), tedarik: round1(tedarik), reklam: round1(reklam), hareket, kopya };
  return {
    score: round1(Math.min(100, parts.talep + parts.ivme + parts.trafik + parts.gundem + parts.fiyat + parts.tedarik + parts.reklam + parts.hareket + parts.kopya)),
    breakdown: {
      parts,
      rank: latestRank,
      rankChange: change === null ? null : Math.round(change * 1000) / 1000,
      visits: latestRank ? (({ low, high }) => ({ low, high }))(visitsFromRank(latestRank)) : null,
      sales: reviews ? scale(reviews, REVIEW_TO_SALES) : null,
      reviewsPerMonth: rpm === null ? null : round1(rpm),
      salesPerMonth,
      revenuePerMonth: salesPerMonth && input.price !== null ? scale(Number(input.price), salesPerMonth) : null,
      priceUsd: priceUsd === null ? null : round1(priceUsd),
      historyDays: days.size,
      evidence: round1(evidence),
      gate: Math.round(gate * 100) / 100,
      momentum: momentumScore(reviews, rpm, change, input.mentions7d ?? 0, input.newAds14d ?? 0),
    },
  };
}
