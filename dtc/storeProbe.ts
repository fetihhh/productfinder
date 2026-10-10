// Yeni Shopify mağazası kontrolü: açık mı (şifre sayfası/boş/kapalı), kaç ürün, ilk ürün ne zaman eklendi,
// indirimli ürün oranı, stok durumu ve ana sayfada öne çıkan ("hero") ürün.
// Uç noktalar Shopify'ın herkese açık JSON'ları: /products.json ve /meta.json. Şifreli mağazaya girilmez.
import { STORE_DAILY_MIN_SCORE } from "../config/limits.ts";
import type { FetchResult } from "../lib/http.ts";
import { productOffer, type ProductOffer } from "./offers.ts";
import { parseShopifyMeta } from "./signals.ts";

type FetchPage = (url: string, accept?: string) => Promise<FetchResult>;
type Json = Record<string, unknown>;

export type StoreProduct = {
  handle: string;
  title: string;
  image: string | null;
  price: number | null;
  compareAt: number | null;
  createdAt: string | null;
  physical: boolean | null;
  productType: string | null;
  availableVariants: number;
  totalVariants: number;
  /** Açıklamada dropshipping işareti: uzun teslimat aralığı ("7-15 business days") ya da dünya geneli gönderim. */
  dropship: boolean;
  /** Baskılı giyim / merch (tişört, kapüşonlu, şapka…). */
  apparel: boolean;
  /** Görselin dosya adı AliExpress görsel kimliği (ör. S4f799d…edi.avif): fotoğraf AliExpress'ten alınmış. */
  aliImageId: string | null;
  /** Ürün sayfasındaki teklif: indirim, ücretsiz kargo, garanti, paket. */
  offer: ProductOffer;
};

export type LiveStore = {
  state: "live";
  products: StoreProduct[];
  productCount: number;
  physicalCount: number;
  discountedCount: number;
  dropshipCount: number;
  apparelCount: number;
  aliImageCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  firstProductAt: string | null;
  lastProductAt: string | null;
  availableVariants: number;
  totalVariants: number;
  shopName: string | null;
  country: string | null;
  currency: string | null;
  shipsToTr: boolean | null;
  hero: StoreProduct | null;
};

export type StoreProbe = LiveStore | { state: "closed" | "dead"; why: string } | { state: "error"; why: string };

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

const DELIVERY_RANGE = /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:business\s+|working\s+)?days/gi;
const WORLDWIDE = /worldwide\s+shipping|ships?\s+worldwide|free\s+(?:worldwide|global|international)\s+shipping/i;
const APPAREL = /\b(t-?shirts?|tees?|hoodies?|sweatshirts?|crewnecks?|caps?|beanies?|hats?|jerseys?|joggers?|sweatpants|apparel|clothing)\b/i;

/**
 * AliExpress görsel kimliği: "S"/"H"/"U"/"A" + 32 onaltılık + 1 harf (alicdn / aliexpress-media dosya adları). Mağaza
 * fotoğrafı AliExpress'ten indirip yüklediğinde Shopify dosya adını korur (sonuna "_1" ya da uuid ekleyebilir).
 */
export function aliImageId(url: string | null): string | null {
  const file = url?.split("?")[0].split("/").pop() ?? "";
  return file.match(/^([SHUA][0-9a-f]{32}[a-z])(?:[_-][\w-]*)?\.(?:jpe?g|png|webp|avif|gif)$/i)?.[1] ?? null;
}

/** Teslimat aralığının üst sınırı ≥ 10 gün (Çin'den gönderim) ya da dünya geneli gönderim vurgusu. */
export function hasDropshipSignal(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, " ");
  for (const m of text.matchAll(DELIVERY_RANGE)) if (Number(m[2]) >= 10 && Number(m[2]) <= 60) return true;
  return WORLDWIDE.test(text);
}

export function parseStoreProducts(text: string): StoreProduct[] | null {
  let data: { products?: Json[] };
  try {
    data = JSON.parse(text) as { products?: Json[] };
  } catch {
    return null;
  }
  if (!Array.isArray(data.products)) return null;
  return data.products.flatMap((p) => {
    if (typeof p.handle !== "string" || typeof p.title !== "string") return [];
    const variants = Array.isArray(p.variants) ? (p.variants as Json[]) : [];
    const prices = variants.map((v) => num(v.price)).filter((n): n is number => n !== null);
    const compares = variants.map((v) => num(v.compare_at_price)).filter((n): n is number => n !== null);
    const shipping = variants.map((v) => v.requires_shipping).filter((v): v is boolean => typeof v === "boolean");
    const images = Array.isArray(p.images) ? (p.images as Json[]) : [];
    const price = prices.length ? Math.min(...prices) : null;
    const compareAt = compares.length ? Math.max(...compares) : null;
    return [{
      handle: p.handle,
      title: p.title,
      image: typeof images[0]?.src === "string" ? (images[0].src as string) : null,
      price,
      compareAt: compareAt !== null && price !== null && compareAt > price ? compareAt : null,
      createdAt: typeof p.created_at === "string" ? p.created_at : typeof p.published_at === "string" ? p.published_at : null,
      physical: shipping.length ? shipping.some(Boolean) : null,
      productType: typeof p.product_type === "string" && p.product_type.trim() ? p.product_type.trim() : null,
      availableVariants: variants.filter((v) => v.available === true).length,
      totalVariants: variants.length,
      aliImageId: images.map((im) => aliImageId(typeof im.src === "string" ? im.src : null)).find(Boolean) ?? null,
      dropship: (typeof p.body_html === "string" && hasDropshipSignal(p.body_html)) || images.some((im) => aliImageId(typeof im.src === "string" ? im.src : null)),
      apparel: APPAREL.test(`${p.title} ${typeof p.product_type === "string" ? p.product_type : ""}`),
      offer: productOffer(
        typeof p.body_html === "string" ? p.body_html : null,
        variants.map((v) => (typeof v.title === "string" ? v.title : "")),
        price,
        compareAt !== null && price !== null && compareAt > price ? compareAt : null,
      ),
    }];
  });
}

/** Ana sayfadaki ilk ürün bağlantısı mağazanın öne çıkardığı üründür; yoksa en yeni fiziksel ürün. */
export function pickHero(products: StoreProduct[], homepageHtml: string | null): StoreProduct | null {
  if (homepageHtml) {
    for (const m of homepageHtml.matchAll(/href="(?:https?:\/\/[^"/]+)?(?:\/[a-z]{2}(?:-[a-z]{2})?)?(?:\/collections\/[^"/]+)?\/products\/([^"/?#]+)/gi)) {
      const hit = products.find((p) => p.handle === decodeURIComponent(m[1]));
      if (hit && hit.physical !== false) return hit;
    }
  }
  const physical = products.filter((p) => p.physical !== false);
  return [...physical].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0] ?? null;
}

export async function probeStore(domain: string, fetchPage: FetchPage): Promise<StoreProbe> {
  const res = await fetchPage(`https://${domain}/products.json?limit=250`, "application/json");
  if (!res.ok) {
    if (/HTTP (402|423)/.test(res.reason)) return { state: "closed", why: `Mağaza kapalı (${res.reason})` };
    // robots.txt yasağı kalıcıdır; robots.txt'nin geçici okunamaması (429/5xx) değil.
    if (/HTTP (404|410)/.test(res.reason) || (/robots/.test(res.reason) && !res.retryable)) return { state: "dead", why: res.reason };
    return { state: "error", why: res.reason };
  }
  if (/\/password\b/.test(new URL(res.url).pathname)) return { state: "closed", why: "Şifreli (henüz açılmamış)" };
  const products = parseStoreProducts(res.text);
  if (!products) return { state: "closed", why: "Ürün listesi yok" };
  if (products.length === 0) return { state: "closed", why: "Boş mağaza" };

  const prices = products.map((p) => p.price).filter((n): n is number => n !== null);
  const dates = products.map((p) => p.createdAt).filter((d): d is string => Boolean(d)).sort();
  // Mağaza bilgisi ve ana sayfa yalnızca aday olabilecek mağazalar için okunur (istek tasarrufu):
  // ürünlerin çoğu fiziksel, en fazla 100 ürün ve ilk ürün son 150 gün içinde.
  const promising =
    products.filter((p) => p.physical === true).length / products.length >= 0.5 &&
    products.length <= 100 &&
    Boolean(dates[0]) &&
    Date.now() - Date.parse(dates[0]) <= 150 * 86_400_000;
  const metaRes = promising ? await fetchPage(`https://${domain}/meta.json`, "application/json") : null;
  const meta = metaRes?.ok ? parseShopifyMeta(metaRes.text) : null;
  const home = promising ? await fetchPage(`https://${domain}/`) : null;
  return {
    state: "live",
    products,
    productCount: meta?.productCount ?? products.length,
    physicalCount: products.filter((p) => p.physical === true).length,
    discountedCount: products.filter((p) => p.compareAt !== null).length,
    dropshipCount: products.filter((p) => p.dropship).length,
    apparelCount: products.filter((p) => p.apparel).length,
    aliImageCount: products.filter((p) => p.aliImageId).length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    firstProductAt: dates[0] ?? null,
    lastProductAt: dates[dates.length - 1] ?? null,
    availableVariants: products.reduce((s, p) => s + p.availableVariants, 0),
    totalVariants: products.reduce((s, p) => s + p.totalVariants, 0),
    shopName: meta?.name ?? null,
    country: meta?.country ?? null,
    currency: meta?.currency ?? null,
    shipsToTr: meta?.shipsTo ? meta.shipsTo.includes("TR") : null,
    hero: pickHero(products, home?.ok ? home.text : null),
  };
}

// ---- Puan ve kontrol takvimi ----

const DAY = 86_400_000;

export type StoreActivity = { productGrowth: number; soldOut: number };

/** İki kontrol arasındaki değişim: eklenen ürün ve tükenen varyant sayısı (satış işareti). */
export function storeActivity(prev: { product_count: number | null; available_variants: number | null; total_variants: number | null } | null, cur: LiveStore): StoreActivity {
  if (!prev || prev.product_count === null) return { productGrowth: 0, soldOut: 0 };
  const soldOut =
    prev.available_variants !== null && prev.total_variants === cur.totalVariants ? Math.max(0, prev.available_variants - cur.availableVariants) : 0;
  return { productGrowth: Math.max(0, cur.productCount - prev.product_count), soldOut };
}

/**
 * Mağaza puanı (0–100), hangi mağazaların ürününün aday yapılacağını belirler:
 *   odak 25 (tek ürün 25, 2–5 → 21, 6–15 → 15, 16–50 → 8, fazlası 2) · yenilik 15 (ilk ürün ≤ 30 gün 15, ≤ 90 → 10, ≤ 150 → 6)
 *   dropship 20 (ürünlerin ≥ %50'sinde uzun teslimat/dünya geneli gönderim 20, bazılarında 10)
 *   indirim 10 (ürünlerin ≥ %50'si indirimli) · fiyat 10 (öne çıkan ürün 15–150) · hareket 20 (yeni ürün +10, tükenen varyant +10)
 *   baskılı giyim/merch mağazası (ürünlerin ≥ %50'si) −20.
 * Fiziksel ürün oranı %50'nin altındaysa (dijital/hizmet) puan 0.
 */
export type StoreScoreParts = { odak: number; yenilik: number; dropship: number; indirim: number; fiyat: number; hareket: number; merch: number };

/** Puanın bileşenleri (merch eksi puandır). Fiziksel olmayan mağazada null. */
export function storeScoreParts(s: LiveStore, activity: StoreActivity, now = Date.now()): StoreScoreParts | null {
  if (s.productCount === 0 || s.physicalCount / Math.max(1, s.products.length) < 0.5) return null;
  const n = s.productCount;
  const total = Math.max(1, s.products.length);
  const age = s.firstProductAt ? (now - Date.parse(s.firstProductAt)) / DAY : Infinity;
  const hp = s.hero?.price ?? null;
  return {
    odak: n <= 1 ? 25 : n <= 5 ? 21 : n <= 15 ? 15 : n <= 50 ? 8 : 2,
    yenilik: age <= 30 ? 15 : age <= 90 ? 10 : age <= 150 ? 6 : 0,
    dropship: s.dropshipCount / total >= 0.5 ? 20 : s.dropshipCount > 0 ? 10 : 0,
    indirim: s.discountedCount / total >= 0.5 ? 10 : 0,
    fiyat: hp !== null && hp >= 15 && hp <= 150 ? 10 : 0,
    hareket: (activity.productGrowth > 0 ? 10 : 0) + (activity.soldOut > 0 ? 10 : 0),
    merch: s.apparelCount / total >= 0.5 ? -20 : 0,
  };
}

export function storeScore(s: LiveStore, activity: StoreActivity, now = Date.now()): number {
  const p = storeScoreParts(s, activity, now);
  return p ? Math.max(0, p.odak + p.yenilik + p.dropship + p.indirim + p.fiyat + p.hareket + p.merch) : 0;
}

/**
 * Sonraki kontrol: şifreli/boş mağaza 14 günde bir (90 günü geçince bırakılır), açık mağaza haftada bir (150 güne kadar);
 * puanı yüksek açık mağaza her gün (stok tükenmesi ve yeni ürün günler içinde görünsün).
 */
export type StoreStatus = "pending" | "closed" | "live" | "dead" | "old";

export function nextCheck(state: StoreProbe["state"], storeAgeDays: number, now = Date.now(), score = 0): { status: StoreStatus; next: string } {
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  if (state === "error") return { status: "pending", next: at(1) };
  // dead/old: artık kontrol edilmez (next yalnızca alan dolu kalsın diye).
  if (state === "dead") return { status: "dead", next: at(0) };
  if (state === "closed") return storeAgeDays > 90 ? { status: "dead", next: at(0) } : { status: "closed", next: at(14) };
  if (storeAgeDays > 150) return { status: "old", next: at(0) };
  // Günlük çalıştırma her gün aynı saatte başlar: 20 saat sonrası ertesi günün çalıştırmasına denk gelir.
  return { status: "live", next: score >= STORE_DAILY_MIN_SCORE ? at(20 / 24) : at(7) };
}
