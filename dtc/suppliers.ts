// Toptancı (tedarikçi) araması: ürünün aynısı/muadili toptan platformlarda var mı, kaça?
// Yalnızca robots.txt'nin izin verdiği ve sonuçları HTML/JSON olarak sunan arama sayfaları kullanılır:
//   AliExpress  /w/wholesale-<sözcükler>.html          (adet fiyatı + satış adedi)
//   Alibaba     /showroom/<sözcükler>.html             (toptan fiyat aralığı + MOQ + tedarikçi)
//   Made-in-China /products-search/hot-china-products/<Sözcükler>.html
// Alibaba /trade/search, DHgate arama, CJdropshipping (robots yasak), 1688 (giriş/JS) kullanılmaz.
// Eşleşme metin benzerliğiyle yapılır; ürün görselleri verilirse en benzer ilanların fotoğrafları da karşılaştırılır
// (dropshipping mağazaları çoğunlukla tedarikçinin fotoğrafını kullanır). Görselle eşleşen ilan en güvenilir adaydır.
import { IMAGE_MATCH_MAX } from "../config/limits.ts";
import { decodeEntities, stripTags } from "../lib/html.ts";
import type { FetchResult } from "../lib/http.ts";
import { normalizeName } from "../lib/productName.ts";
import { closestDistance } from "./imageDistance.ts";
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
  /** Arama sözcüklerinin ilan başlığında geçme oranı (0..1); görselle eşleşen ilanda en az 0,95. */
  similarity: number;
  /** Ürün görseliyle dHash farkı (0 = aynı fotoğraf); karşılaştırılmadıysa null. */
  imageDistance: number | null;
};

export const isImageMatch = (o: { imageDistance: number | null }) => o.imageDistance !== null && o.imageDistance <= IMAGE_MATCH_MAX;

export type SupplierResult = { query: string; offers: SupplierOffer[]; failed: string[] };

export const SOURCE_NAMES: Record<SupplierSource, string> = { aliexpress: "AliExpress", alibaba: "Alibaba", madeinchina: "Made-in-China" };

/** Marka/model dışı, ürünü tarif eden sözcükler genelde sonda değil ama hepsi aranır; bunlar ürünü tarif etmez. */
const NOT_GENERIC = new Set(["pro", "max", "ultra", "plus", "lite", "gen", "edition", "series", "version", "official", "original", "limited", "classic", "premium"]);
const MIN_SIMILARITY = 0.7;
const PER_SOURCE = 5;
/** Görseli karşılaştırılacak ilanlar: her kaynaktan metin benzerliği ≥ %30 olan en benzer 8 ilan. */
const IMAGE_POOL = 8;
const IMAGE_POOL_MIN = 0.3;
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
export function supplierQuery(name: string, brandDomain: string, productType: string | null = null, nameStartsWithBrand = true): string {
  // Yeni mağaza ürünlerinde ad markayla başlamaz ("Multifunctional UV-C Sterilizer Box"): marka yalnızca alan adıdır.
  const brands = new Set(nameStartsWithBrand ? brandTokens(brandDomain, name) : brandTokens(brandDomain, ""));
  // Alan adını oluşturan sözcükler de markadır: "Advent Bricks…" @ adventbricks.com (sözcükler birleşince alan adı),
  // "Blue Foldable…" @ bluepets.store (sözcük + mağaza eki). "Cabin backpack" @ cabineo.store ise ürün tarifidir.
  for (const t of domainBrandWords(brandTokens(brandDomain, "")[0] ?? "", tokens(name))) brands.add(t);
  const describe = (s: string) => tokens(s).filter((t) => !brands.has(t) && !/\d/.test(t) && !NOT_GENERIC.has(t) && t.length >= 3);
  let words = describe(name);
  // Uzun adlarda ayraçtan (" - ", "|", ",", "(") sonrası pazarlama açıklamasıdır ("… Box - Portable Aromatherapy & Disinfection
  // Chamber"): sorguyu toptancıda sonuçsuz bırakır. Ana bölüm en az 2 sözcükse yalnızca o aranır.
  const main = describe(name.split(/\s[-–—|·•]\s|[,(|·•]/)[0]);
  if (words.length > 4 && main.length >= 2) words = main;
  for (const t of tokens(productType ?? "")) if (!words.some((w) => stem(w) === stem(t)) && !/\d/.test(t)) words.push(t);
  return (words.length ? words : tokens(name)).slice(0, 6).join(" ");
}

function stem(t: string): string {
  return t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
}

/** Mağaza alan adlarında ürün sözcüğüne eklenen yaygın ekler/önekler (bluepets, getlumitree, trycalm). */
const STORE_SUFFIXES = ["pets", "pet", "shop", "store", "co", "home", "life", "hub", "hq", "daily", "mart", "world", "land", "lab", "labs", "official", "gear", "goods", "house", "club", "box", "studio"];
const STORE_PREFIXES = ["get", "try", "my", "the", "shop", "buy", "go", "hello", "hey", "use"];

/**
 * Ürün adındaki sözcüklerden alan adını oluşturanlar: ardışık sözcüklerin birleşimi alan adına eşitse hepsi;
 * alan adı = (önek) + sözcük + (ek) ise o sözcük.
 */
export function domainBrandWords(label: string, words: string[]): string[] {
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    let joined = "";
    for (let j = i; j < Math.min(words.length, i + 4); j++) {
      joined += words[j];
      if (joined === label && j > i) for (let k = i; k <= j; k++) out.add(words[k]);
    }
  }
  for (const w of words) {
    if (w.length < 3 || w === label) continue;
    for (const pre of ["", ...STORE_PREFIXES]) {
      for (const suf of ["", ...STORE_SUFFIXES]) {
        if ((pre || suf) && `${pre}${w}${suf}` === label) out.add(w);
      }
    }
  }
  return [...out];
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

type RawOffer = Omit<SupplierOffer, "similarity" | "imageDistance">;

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

/**
 * Üç toptancıyı paralel arar (farklı alan adları); her kaynaktan en benzer 5 ilan, benzerlik ≥ %70.
 * imageHashes + hashImage verilirse en benzer ilanların fotoğrafı ürün fotoğraflarıyla karşılaştırılır.
 */
export async function findSuppliers(
  p: {
    name: string;
    brandDomain: string;
    productType: string | null;
    imageHashes?: bigint[];
    nameStartsWithBrand?: boolean;
    /** Ürün görsellerinin AliExpress görsel kimlikleri: ilan görsel adresinde aynen geçerse kesin eşleşme. */
    aliImageIds?: string[];
  },
  fetchPage: FetchPage,
  sites: Site[] = SUPPLIER_SITES,
  hashImage?: (url: string | null) => Promise<bigint | null>,
): Promise<SupplierResult> {
  const productHashes = p.imageHashes ?? [];
  const query = supplierQuery(p.name, p.brandDomain, p.productType, p.nameStartsWithBrand ?? true);
  // Tek sözcüklük ya da çok kısa tarif ("out", "plate") rastgele sonuç getirir: aranmaz.
  const described = query.split(" ").filter((w) => w.length >= 3).length;
  if (described < 2) return { query, offers: [], failed: ["tarif çok kısa"] };
  // Yeni mağaza ürünlerinde iki sözcüklük ad çoğunlukla ürün tarifi değil koleksiyon/baskı adıdır ("BLACK OUT");
  // ürün türü de bilinmiyorsa aranmaz (alakasız "blackout perde" ilanları getirir).
  if (p.nameStartsWithBrand === false && described < 3 && !p.productType) return { query, offers: [], failed: ["tarif çok kısa"] };
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
        const scored: SupplierOffer[] = raw
          .map((o) => ({ ...o, similarity: similarity(query, o.title, weights), imageDistance: null }))
          .filter((o) => !isAccessoryListing(query, o.title) && !isBrandedOrUsed(o.title));
        // Mağaza fotoğrafı AliExpress'ten indirilmişse (dosya adı görsel kimliği) aynı kimlikli ilan kesin tedarikçidir.
        for (const o of scored) {
          if (o.imageUrl && p.aliImageIds?.some((id) => o.imageUrl!.includes(id))) {
            o.imageDistance = 0;
            o.similarity = Math.max(o.similarity, 0.95);
          }
        }
        if (hashImage && productHashes.length) {
          const pool = scored.filter((o) => o.similarity >= IMAGE_POOL_MIN && o.imageUrl).sort((a, b) => b.similarity - a.similarity).slice(0, IMAGE_POOL);
          for (const o of pool) {
            if (o.imageDistance === 0) continue;
            o.imageDistance = closestDistance(productHashes, await hashImage(o.imageUrl));
            if (isImageMatch(o)) o.similarity = Math.max(o.similarity, 0.95);
          }
        }
        const offers = scored
          .filter((o) => o.similarity >= MIN_SIMILARITY)
          .sort((a, b) => Number(isImageMatch(b)) - Number(isImageMatch(a)) || b.similarity - a.similarity || (b.sold ?? 0) - (a.sold ?? 0))
          .slice(0, PER_SOURCE);
        if (offers.length) return offers;
      }
      if (why) failed.push(`${SOURCE_NAMES[site.source]} (${why})`);
      return [];
    }),
  );
  const offers = perSite.flat().sort((a, b) => Number(isImageMatch(b)) - Number(isImageMatch(a)) || b.similarity - a.similarity);
  return { query, offers, failed };
}
