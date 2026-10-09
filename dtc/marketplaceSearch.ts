// Pazaryeri araması: Tavily (ücretsiz 1.000 kredi/ay, basic arama = 1 kredi).
// Sorgu yalnızca config/marketplaces.ts'teki alan adlarıyla sınırlanır.
import { marketplaceFor, marketplaceSearchDomains } from "../lib/domain.ts";
import { normalizeName } from "../lib/productName.ts";
import { brandTokens, modelCoverage, modelTokens } from "./match.ts";

export type SearchResult = { title: string; url: string; content: string };
export type SearchOutcome =
  | { ok: true; results: SearchResult[] }
  | { ok: false; quota: boolean; reason: string };

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
  return normalizeName(productName).includes(normalizeName(label)) ? productName : `${label} ${productName}`;
}

/** Arama/kategori sonuç sayfaları ilan değildir (sorgu kelimelerini zaten içerirler). */
export function isSearchPage(url: URL): boolean {
  for (const key of ["k", "q", "query", "keyword", "keywords", "_nkw", "search", "searchTerm"]) {
    if (url.searchParams.has(key)) return true;
  }
  return /(^|\/)(s|sr|search|ara)(\/|$)/i.test(url.pathname);
}

export type MarketplaceMatch = { url: string; why: string };

/**
 * Bir arama sonucunun aynı ürünün pazaryeri ilanı olup olmadığına karar verir:
 *  - arama sayfaları ve (Facebook gibi) pazaryeri bölümü dışındaki sayfalar sayılmaz,
 *  - marka adı ilan BAŞLIĞINDA geçmeli (açıklamadaki geçişler benzer/kopya ürünlerde yanıltıyor),
 *  - modelin ilk kelimesi geçmeli ve model kelimelerinin en az %60'ı başlık+açıklamada bulunmalı.
 * Markanın pazaryerindeki resmi mağaza sayfası (amazon.com/stores/Marka) da kanıt sayılır.
 */
export function findMarketplaceListing(results: SearchResult[], brandDomain: string, productName: string): MarketplaceMatch | null {
  const brands = brandTokens(brandDomain, productName);
  const model = modelTokens(brandDomain, productName);
  for (const r of results) {
    const marketplace = marketplaceFor(r.url);
    if (!marketplace) continue;
    let url: URL;
    try {
      url = new URL(r.url);
    } catch {
      continue;
    }
    if (marketplace.listingPath && !marketplace.listingPath.test(url.pathname)) continue;
    if (isSearchPage(url)) continue;

    const title = ` ${normalizeName(r.title)} `;
    if (!brands.some((b) => title.includes(` ${b} `))) continue;

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
