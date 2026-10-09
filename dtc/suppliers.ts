// Toptancı (tedarikçi) araması: ürünün aynısı/muadili toptan platformlarda var mı, kaça?
// Yalnızca robots.txt'nin izin verdiği ve sonuçları HTML/JSON olarak sunan arama sayfaları kullanılır:
//   AliExpress  /w/wholesale-<sözcükler>.html          (adet fiyatı + satış adedi)
//   Alibaba     /showroom/<sözcükler>.html             (toptan fiyat aralığı + MOQ + tedarikçi)
//   Made-in-China /products-search/hot-china-products/<Sözcükler>.html
// Alibaba /trade/search, DHgate arama, CJdropshipping (robots yasak), 1688 (giriş/JS) kullanılmaz.
// Eşleşme metin benzerliğiyle yapılır; sonuçlar ADAYDIR, görselden kontrol edilmelidir.
import { decodeEntities, stripTags } from "../lib/html.ts";
import type { FetchResult } from "../lib/http.ts";
import { normalizeName } from "../lib/productName.ts";
import { ACCESSORIES, CONNECTORS } from "./marketplaceSearch.ts";
import { brandTokens, tokens } from "./match.ts";

type FetchPage = (url: string, accept?: string, extra?: Record<string, string>) => Promise<FetchResult>;

export type SupplierSource = "aliexpress" | "alibaba" | "madeinchina";

export type SupplierOffer = {
  source: SupplierSource;
  url: string;
  title: string;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  moq: string | null;
  sold: number | null;
  supplierName: string | null;
  /** Arama sözcüklerinin ilan başlığında geçme oranı (0..1). */
  similarity: number;
};

export type SupplierResult = { query: string; offers: SupplierOffer[]; failed: string[] };

export const SOURCE_NAMES: Record<SupplierSource, string> = { aliexpress: "AliExpress", alibaba: "Alibaba", madeinchina: "Made-in-China" };

/** Marka/model dışı, ürünü tarif eden sözcükler genelde sonda değil ama hepsi aranır; bunlar ürünü tarif etmez. */
const NOT_GENERIC = new Set(["pro", "max", "ultra", "plus", "lite", "gen", "edition", "series", "version", "official", "original", "limited", "classic", "premium"]);
const MIN_SIMILARITY = 0.7;
const PER_SOURCE = 5;
const BOT_PAGE = /punish|captcha|slide to verify|x5sec|unusual traffic|are you a human/i;

/**
 * Büyük markaların kendi ürünleri ve ikinci el ilanlar toptan tedarik değildir ("DJI Osmo Action … Adventure Combo").
 * Genişletmek için listeye küçük harfle marka adı ekleyin.
 */
const BIG_BRAND_WORDS = new Set([
  "dji", "gopro", "insta360", "apple", "iphone", "samsung", "xiaomi", "huawei", "sony", "bose", "jbl", "anker", "soundcore",
  "logitech", "lenovo", "oneplus", "garmin", "fitbit", "nikon", "canon", "fujifilm", "philips", "dyson", "lego", "nike", "adidas",
]);
const USED = /\b(refurbish(ed)?|used|second[- ]hand|pre-?owned)\b/i;

export function isBrandedOrUsed(title: string): boolean {
  if (USED.test(title)) return true;
  return normalizeName(title).split(" ").some((w) => BIG_BRAND_WORDS.has(w));
}

/**
 * Toptancıda aranacak genel ürün tarifi: ürün adından marka sözcükleri, model kodları (rakam içeren) ve
 * pazarlama ekleri çıkarılır; Shopify ürün türü eksikse eklenir. ör. "TDM. Neo Hybrid Headphone - Speakers"
 * → "neo hybrid headphone speakers".
 */
export function supplierQuery(name: string, brandDomain: string, productType: string | null = null): string {
  const brands = new Set(brandTokens(brandDomain, name));
  const words = tokens(name).filter((t) => !brands.has(t) && !/\d/.test(t) && !NOT_GENERIC.has(t) && t.length >= 3);
  for (const t of tokens(productType ?? "")) if (!words.some((w) => stem(w) === stem(t)) && !/\d/.test(t)) words.push(t);
  return (words.length ? words : tokens(name)).slice(0, 6).join(" ");
}

function stem(t: string): string {
  return t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
}

/** "Case for X", "X için kılıf": aranan ürün değil, onun aksesuarı (sorguda aksesuar sözcüğü yoksa). */
export function isAccessoryListing(query: string, title: string): boolean {
  const q = new Set(query.split(" ").map(stem));
  const words = normalizeName(title).split(" ");
  return words.some((w) => ACCESSORIES.has(w) && !q.has(stem(w))) && words.some((w) => CONNECTORS.has(w));
}

/** Sorgu sözcüklerinin başlıkta geçme oranı (basit tekil/çoğul eşleşmesiyle). */
export function similarity(query: string, title: string, weights?: Map<string, number>): number {
  const q = [...new Set(query.split(" ").filter(Boolean).map(stem))];
  if (q.length === 0) return 0;
  const t = new Set(normalizeName(title).split(" ").map(stem));
  const w = (x: string) => weights?.get(x) ?? 1;
  const total = q.reduce((s, x) => s + w(x), 0);
  return Math.round((q.filter((x) => t.has(x)).reduce((s, x) => s + w(x), 0) / total) * 1000) / 1000;
}

/**
 * Sözcük ağırlıkları, aynı sonuç sayfasındaki başlıklardan (sayfa içi IDF): sonuçların çoğunda geçen sözcük
 * ("wallet") az, azında geçen ayırt edici sözcük ("cork") çok ağırlık alır. Hiç geçmeyen sözcük de en yüksek ağırlığı
 * alır: sayfada hiç mantar cüzdan yoksa sıradan cüzdanlar eşleşme sayılmaz.
 */
export function pageWeights(query: string, titles: string[]): Map<string, number> {
  const q = [...new Set(query.split(" ").filter(Boolean).map(stem))];
  const sets = titles.map((t) => new Set(normalizeName(t).split(" ").map(stem)));
  const n = sets.length;
  const weights = new Map<string, number>();
  for (const x of q) {
    const df = sets.filter((s) => s.has(x)).length;
    weights.set(x, df === 0 ? Number.NaN : Math.log((n + 1) / df) + 0.1);
  }
  const max = Math.max(0.1, ...[...weights.values()].filter((v) => !Number.isNaN(v)));
  for (const [x, v] of weights) if (Number.isNaN(v)) weights.set(x, max);
  return weights;
}

/** Sayfadaki `marker`'dan sonraki ilk JSON dizisini/nesnesini (dengeli parantezlerle) ayrıştırır. */
export function extractJson(text: string, marker: string): unknown {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  let start = at + marker.length;
  while (start < text.length && text[start] !== "[" && text[start] !== "{") start++;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      if (--depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const https = (u: unknown): string | null => (typeof u === "string" && u ? (u.startsWith("//") ? `https:${u}` : u) : null);

/** "$1.08-1.58", "US$10.00 - 20.00" → [1.08, 1.58] */
export function priceRange(s: string): [number | null, number | null] {
  const nums = [...s.replace(/,(?=\d{3}\b)/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return [null, null];
  return [Math.min(...nums), Math.max(...nums)];
}

type RawOffer = Omit<SupplierOffer, "similarity">;

export function parseAliExpressOffers(html: string): RawOffer[] {
  const out: RawOffer[] = [];
  for (const chunk of html.split(/(?="productId":")/).slice(1)) {
    const id = chunk.match(/^"productId":"(\d+)"/)?.[1];
    const head = chunk.slice(0, 6000);
    const raw = head.match(/"displayTitle":"((?:[^"\\]|\\.)*)"/)?.[1];
    if (!id || !raw || out.some((o) => o.url.endsWith(`/${id}.html`))) continue;
    let title: string;
    try {
      title = JSON.parse(`"${raw}"`) as string;
    } catch {
      continue;
    }
    const price = head.match(/"salePrice":\{[^}]*?"currencyCode":"([A-Z]{3})","minPrice":([\d.]+)/);
    const sold = head.match(/"real_trade_count":"(\d+)"/)?.[1] ?? head.match(/"tradeDesc":"([\d.,]+)\+?/)?.[1]?.replace(/[.,]/g, "");
    out.push({
      source: "aliexpress",
      url: `https://www.aliexpress.com/item/${id}.html`,
      title,
      imageUrl: https(head.match(/"imgUrl":"([^"]+)"/)?.[1]),
      priceMin: price ? Number(price[2]) : null,
      priceMax: price ? Number(price[2]) : null,
      currency: price?.[1] ?? null,
      moq: null,
      sold: sold ? Number(sold) : null,
      supplierName: null,
    });
  }
  return out;
}

type AlibabaItem = { title?: string; url?: string; image?: string; price?: string; moq?: string; supplier?: { name?: string } };

export function parseAlibabaOffers(html: string): RawOffer[] {
  const items = extractJson(html, '"products":{"items":');
  if (!Array.isArray(items)) return [];
  return (items as AlibabaItem[]).flatMap((it) => {
    const url = https(it.url);
    if (!it.title || !url) return [];
    const [min, max] = priceRange(it.price ?? "");
    return [{
      source: "alibaba" as const,
      url: url.split("?")[0],
      title: decodeEntities(stripTags(it.title)),
      imageUrl: https(it.image),
      priceMin: min,
      priceMax: max,
      currency: it.price?.includes("$") ? "USD" : null,
      moq: it.moq ?? null,
      sold: null,
      supplierName: it.supplier?.name ?? null,
    }];
  });
}

export function parseMadeInChinaOffers(html: string): RawOffer[] {
  const out: RawOffer[] = [];
  const parts = html.split('<h2 class="product-name"');
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i].slice(0, 6000);
    const link = block.match(/<a\b[^>]*?\btitle="([^"]+)"[^>]*?\bhref="([^"]+)"/);
    if (!link) continue;
    const price = block.match(/<strong class="price">([\s\S]*?)<\/strong>/)?.[1];
    const [min, max] = price ? priceRange(stripTags(price)) : [null, null];
    const imgs = [...parts[i - 1].slice(-4000).matchAll(/data-original="([^"]+)"/g)];
    out.push({
      source: "madeinchina",
      url: https(link[2])!,
      title: decodeEntities(link[1]),
      imageUrl: https(imgs[imgs.length - 1]?.[1]),
      priceMin: min,
      priceMax: max,
      currency: price?.includes("US$") ? "USD" : null,
      moq: block.match(/<span>([^<]+)<\/span>\s*<\/span>\s*<span class="moq-text">/)?.[1]?.trim() ?? null,
      sold: null,
      supplierName: decodeEntities(block.match(/class="company-name[^"]*">\s*<a[^>]*title="([^"]+)"/)?.[1] ?? "") || null,
    });
  }
  return out;
}

type Site = { source: SupplierSource; url: (q: string) => string; parse: (html: string) => RawOffer[]; extra?: Record<string, string> };

export const SUPPLIER_SITES: Site[] = [
  {
    source: "aliexpress",
    url: (q) => `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/\s+/g, "-"))}.html`,
    parse: parseAliExpressOffers,
    // Karşılaştırılabilir sonuç için dil/para birimi tercihi (aksi halde IP'ye göre Türkçe başlık + TL fiyat gelir).
    extra: { "Accept-Language": "en-US,en;q=0.9", Cookie: "aep_usuc_f=site=glo&c_tp=USD&region=US&b_locale=en_US" },
  },
  { source: "alibaba", url: (q) => `https://www.alibaba.com/showroom/${encodeURIComponent(q.replace(/\s+/g, "-"))}.html`, parse: parseAlibabaOffers },
  {
    source: "madeinchina",
    url: (q) => `https://www.made-in-china.com/products-search/hot-china-products/${encodeURIComponent(q.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join("_"))}.html`,
    parse: parseMadeInChinaOffers,
  },
];

/** Üç toptancıyı paralel arar (farklı alan adları); her kaynaktan en benzer 5 ilan, benzerlik ≥ %70. */
export async function findSuppliers(
  p: { name: string; brandDomain: string; productType: string | null },
  fetchPage: FetchPage,
  sites: Site[] = SUPPLIER_SITES,
): Promise<SupplierResult> {
  const query = supplierQuery(p.name, p.brandDomain, p.productType);
  // Sonuç çıkmazsa son iki sözcükle (genelde ürün türü: "hybrid headphone speakers" → "headphone speakers") yeniden denenir.
  const words = query.split(" ");
  const attempts = [...new Set([query, words.length > 2 ? words.slice(-2).join(" ") : query])];
  const failed: string[] = [];
  const perSite = await Promise.all(
    sites.map(async (site) => {
      let why = "";
      for (const q of attempts) {
        const res = await fetchPage(site.url(q), undefined, site.extra);
        if (!res.ok) {
          why = res.reason;
          break;
        }
        const raw = site.parse(res.text);
        if (raw.length === 0 && BOT_PAGE.test(res.text.slice(0, 100_000))) {
          why = "bot doğrulama sayfası";
          break;
        }
        // Benzerlik her zaman ürünün TAM tarifine göre ölçülür (kısaltılmış sorgu yalnızca arama içindir).
        const weights = pageWeights(query, raw.map((o) => o.title));
        const offers = raw
          .map((o) => ({ ...o, similarity: similarity(query, o.title, weights) }))
          .filter((o) => o.similarity >= MIN_SIMILARITY && !isAccessoryListing(query, o.title) && !isBrandedOrUsed(o.title))
          .sort((a, b) => b.similarity - a.similarity || (b.sold ?? 0) - (a.sold ?? 0))
          .slice(0, PER_SOURCE);
        if (offers.length) return offers;
      }
      if (why) failed.push(`${SOURCE_NAMES[site.source]} (${why})`);
      return [];
    }),
  );
  const offers = perSite.flat().sort((a, b) => b.similarity - a.similarity);
  return { query, offers, failed };
}
