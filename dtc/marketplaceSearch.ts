// Pazaryeri araması: Tavily (ücretsiz 1.000 kredi/ay, basic arama = 1 kredi).
// Sorgu yalnızca config/marketplaces.ts'teki alan adlarıyla sınırlanır.
import { marketplaceFor, marketplaceSearchDomains } from "../lib/domain.ts";
import { normalizeName } from "../lib/productName.ts";
import { brandTokens, modelCoverage, modelTokens, tokens } from "./match.ts";

export type SearchResult = { title: string; url: string; content: string };
export type SearchOutcome =
  | {
      ok: true;
      results: SearchResult[];
      /** Doğrudan aramada okunamayan siteler ve zorunlu bir sitenin eksik olup olmadığı. */
      failed?: string[];
      incomplete?: boolean;
      checked?: string[];
    }
  | { ok: false; quota: boolean; reason: string };

export const CONNECTORS = new Set(["for", "compatible", "fits", "fit", "replacement", "fur", "kompatibel", "passend", "icin", "uyumlu", "pour", "para"]);
export const ACCESSORIES = new Set([
  "case", "cases", "cover", "covers", "strap", "straps", "band", "bands", "protector", "protectors", "charger", "charging", "cable",
  "film", "glass", "holder", "mount", "sleeve", "skin", "skins", "bumper", "shell", "replacement", "accessories", "accessory",
  "kilif", "kilifi", "kayis", "kayisi", "koruyucu", "sarj", "aksesuar", "aksesuarlari", "hulle", "armband", "schutzfolie", "ladekabel", "ersatz",
]);

/**
 * Üçüncü taraf aksesuar ilanı mı ("Case for Mibro GS", "Mibro GS için kılıf")? Bunlar markanın kendi ürünü değildir.
 * Marka adından önce "for/için/compatible…" geçiyorsa ya da marka başlığın başında değilken aksesuar kelimesi varsa → evet.
 */
export function isThirdPartyAccessory(title: string, brands: string[]): boolean {
  const words = normalizeName(title).split(" ");
  const at = words.findIndex((w, i) => brands.some((b) => w === b || words.slice(i, i + 3).join("") === b));
  if (at < 0) return false;
  if (words.slice(0, at).some((w) => CONNECTORS.has(w))) return true;
  return at > 1 && words.some((w) => ACCESSORIES.has(w));
}

export type SearchFn = (query: string) => Promise<SearchOutcome>;

export function tavilySearch(apiKey: string): SearchFn {
  return async (query) => {
    let res: Response;
    try {
      res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: 10,
          include_domains: marketplaceSearchDomains(),
        }),
      });
    } catch (err) {
      return { ok: false, quota: false, reason: `Tavily ağ hatası: ${(err as Error).message}` };
    }
    if (res.status === 432 || res.status === 433 || res.status === 429) {
      return { ok: false, quota: true, reason: `Tavily kota/limit (HTTP ${res.status})` };
    }
    if (!res.ok) return { ok: false, quota: false, reason: `Tavily HTTP ${res.status}` };
    const data = (await res.json()) as { results?: SearchResult[] };
    return { ok: true, results: (data.results ?? []).map((r) => ({ title: r.title ?? "", url: r.url, content: r.content ?? "" })) };
  };
}

export function buildQuery(brandDomain: string, productName: string): string {
  const label = brandDomain.split(".")[0];
  const compact = (s: string) => normalizeName(s).replace(/\s+/g, "");
  return compact(productName).includes(compact(label)) ? productName : `${label} ${productName}`;
}

/** Arama/kategori sonuç sayfaları ilan değildir (sorgu kelimelerini zaten içerirler). */
export function isSearchPage(url: URL): boolean {
  for (const key of ["k", "q", "query", "keyword", "keywords", "_nkw", "search", "searchTerm"]) {
    if (url.searchParams.has(key)) return true;
  }
  if (/(^|\/)(s|sr|search|ara|market)(\/|$)/i.test(url.pathname)) return true;
  // Alışveriş dışı alt alanlar (kariyer, yatırımcı, yardım…) ilan değildir.
  return /^(careers|jobs|investors?|corporate|help|support|press|news|blog|about)\./i.test(url.hostname);
}

export type MarketplaceMatch = { url: string; why: string };

/** Amazon kitap ilanı: ASIN yerine ISBN-10 (rakamla başlar, ör. /dp/2100888005). Kitap fiziksel ürün rakibi değildir. */
export function isBookListing(url: URL): boolean {
  return /amazon\./.test(url.hostname) && /\/(?:dp|gp\/product)\/\d{9}[\dX](?:[/?]|$)/i.test(url.pathname);
}

/**
 * Bir arama sonucunun aynı ürünün pazaryeri ilanı olup olmadığına karar verir:
 *  - arama sayfaları ve (Facebook gibi) pazaryeri bölümü dışındaki sayfalar sayılmaz,
 *  - marka adı ilan BAŞLIĞINDA geçmeli (açıklamadaki geçişler benzer/kopya ürünlerde yanıltıyor),
 *  - modelin ilk kelimesi geçmeli ve model kelimelerinin en az %60'ı başlık+açıklamada bulunmalı.
 * Markanın pazaryerindeki resmi mağaza sayfası (amazon.com/stores/Marka) da kanıt sayılır.
 */
export function findMarketplaceListing(
  results: SearchResult[],
  brandDomain: string,
  productName: string,
  /** Marka sözcükleri bilinen durumlarda (yeni mağaza: mağaza adı + alan adı) ürün adının ilk sözcüğü marka sayılmaz. */
  brandWords?: string[],
): MarketplaceMatch | null {
  const brands = brandWords?.length ? brandWords : brandTokens(brandDomain, productName);
  const model = brandWords?.length ? tokens(productName).filter((t) => !brands.includes(t)) : modelTokens(brandDomain, productName);
  for (const r of results) {
    const marketplace = marketplaceFor(r.url);
    // Toptan/tedarik platformundaki ilan eleme sebebi değildir (tedarikçi adayıdır).
    if (!marketplace || marketplace.wholesale) continue;
    let url: URL;
    try {
      url = new URL(r.url);
    } catch {
      continue;
    }
    if (marketplace.listingPath && !marketplace.listingPath.test(url.pathname)) continue;
    if (isSearchPage(url) || isBookListing(url)) continue;

    const title = ` ${normalizeName(r.title)} `;
    if (!brands.some((b) => title.includes(` ${b} `))) continue;
    if (isThirdPartyAccessory(r.title, brands)) continue;

    if (marketplace.storePath?.test(url.pathname)) {
      return { url: r.url, why: `Markanın ${marketplace.name} mağazası var` };
    }
    const text = `${r.title} ${r.content}`;
    if (model.length === 0 || (modelCoverage([model[0]], text) === 1 && modelCoverage(model, text) >= 0.6)) {
      return { url: r.url, why: `${marketplace.name} ilanı` };
    }
  }
  return null;
}

/**
 * Marka düzeyi kontrol: markanın herhangi bir pazaryerinde/büyük perakendecide satılıp satılmadığı.
 * Sonuç başlığında marka adı (tam ifade olarak) ya da alan adının birleşik hali geçmeli; arama sayfaları sayılmaz.
 * 5 harften kısa marka adlarında ürünün model kelimelerinden biri de başlık/açıklamada geçmelidir.
 * productWords verilirse (yeni mağaza ürünleri: mağaza adı çoğu zaman uydurma bir kelimedir ve başka bir markayla çakışır —
 * "Cosmora" projektör mağazası ↔ "Cosmora" klozet kapağı) bu kelimelerden biri de ilanda geçmelidir.
 */
export function findBrandListing(
  results: SearchResult[],
  brandName: string,
  brandDomain: string,
  productName = "",
  productWords?: string[],
): MarketplaceMatch | null {
  const phrase = normalizeName(brandName.replace(/[®™]/g, ""));
  const label = normalizeName(brandDomain.split(".")[0]).replace(/\s+/g, "");
  const model = productName ? modelTokens(brandDomain, productName) : [];
  for (const r of results) {
    const marketplace = marketplaceFor(r.url);
    // Toptan/tedarik platformundaki ilan eleme sebebi değildir (tedarikçi adayıdır).
    if (!marketplace || marketplace.wholesale) continue;
    let url: URL;
    try {
      url = new URL(r.url);
    } catch {
      continue;
    }
    if (marketplace.listingPath && !marketplace.listingPath.test(url.pathname)) continue;
    if (isSearchPage(url) || isBookListing(url)) continue;
    const title = ` ${normalizeName(r.title)} `;
    const hasPhrase = phrase.length >= 3 && title.includes(` ${phrase} `);
    const hasLabel = label.length >= 5 && joinsToLabel(title.trim().split(" "), label);
    if (!hasPhrase && !hasLabel) continue;
    if (isThirdPartyAccessory(r.title, [phrase.replace(/\s+/g, ""), label, ...phrase.split(" ")].filter((b) => b.length >= 3))) continue;
    // Kısa marka adları (TDM, ACE…) başka ürünlerin model kodlarıyla karışır: ek olarak ürünle ilgili bir kelime gerekir.
    const distinctive = hasLabel || phrase.replace(/\s+/g, "").length >= 5;
    if (!distinctive && modelCoverage(model, `${r.title} ${r.content}`) === 0) continue;
    if (productWords?.length && modelCoverage(productWords, `${r.title} ${r.content}`) === 0) continue;
    const kind = marketplace.storePath?.test(url.pathname) ? "mağazası" : "ilanı";
    return { url: r.url, why: `Marka ${marketplace.name}'da satıyor (${kind})` };
  }
  return null;
}

/** Ardışık 1–4 tam kelimenin birleşimi alan adı etiketine eşit mi ("nocs provisions" → "nocsprovisions"; "remember" ≠ "ember"). */
function joinsToLabel(words: string[], label: string): boolean {
  for (let i = 0; i < words.length; i++) {
    let joined = "";
    for (let j = i; j < Math.min(words.length, i + 4); j++) {
      joined += words[j];
      if (joined === label) return true;
      if (joined.length >= label.length) break;
    }
  }
  return false;
}

export function buildBrandQuery(brandName: string): string {
  return `"${brandName.replace(/[®™"]/g, "").trim()}"`;
}
