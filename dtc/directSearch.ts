// Doğrudan pazaryeri araması: kota ve anahtar gerektirmez. Yalnızca robots.txt'nin arama sayfasına izin verdiği
// ve sonuçları HTML'de sunan siteler kullanılır; istekler lib/http.ts üzerinden (alan adı başına 1 istek/sn).
// CAPTCHA / bot sayfası dönerse atlatılmaz, o site "kontrol edilemedi" sayılır.
import { decodeEntities, stripTags } from "../lib/html.ts";
import type { FetchResult } from "../lib/http.ts";
import { normalizeName } from "../lib/productName.ts";
import type { SearchFn, SearchResult } from "./marketplaceSearch.ts";

type FetchPage = (url: string, accept?: string) => Promise<FetchResult>;

export type DirectSite = {
  name: string;
  searchUrl: (query: string) => string;
  parse: (html: string) => SearchResult[];
  /** Bu site okunamazsa doğrudan kontrol eksik sayılır (Amazon gibi en büyük pazaryerleri). */
  required: boolean;
};

const BOT_PAGE = /validateCaptcha|captcha|robot check|are you a human|unusual traffic|anomaly-modal/i;

/** amazon.com arama sayfası: her sonuç bir s-search-result bloğu; başlık bloktaki h2'ler (marka satırı + ürün adı). */
export function parseAmazon(html: string): SearchResult[] {
  const out: SearchResult[] = [];
  const parts = html.split(/(?=<div[^>]*data-component-type="s-search-result")/);
  for (const part of parts.slice(1)) {
    const asin = part.match(/data-asin="([A-Z0-9]{10})"/)?.[1];
    if (!asin) continue;
    const block = part.slice(0, 30_000);
    // Yalnızca ilk iki h2 (marka satırı + ürün adı); son bloğa sayfa altındaki başlıklar da karışır.
    const title = [...block.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].slice(0, 2).map((m) => stripTags(m[1]).trim()).filter(Boolean).join(" ");
    if (title) out.push({ title: decodeEntities(title), url: `https://www.amazon.com/dp/${asin}`, content: "" });
  }
  return out;
}

/** AliExpress arama sayfası: ürünler sayfadaki gömülü JSON'da (productId + displayTitle). */
export function parseAliExpress(html: string): SearchResult[] {
  const out: SearchResult[] = [];
  for (const chunk of html.split(/(?="productId":")/).slice(1)) {
    const id = chunk.match(/^"productId":"(\d+)"/)?.[1];
    const raw = chunk.slice(0, 4000).match(/"displayTitle":"((?:[^"\\]|\\.)*)"/)?.[1];
    if (!id || !raw) continue;
    let title: string;
    try {
      title = JSON.parse(`"${raw}"`) as string;
    } catch {
      continue;
    }
    if (!out.some((r) => r.url.endsWith(`/${id}.html`))) out.push({ title, url: `https://www.aliexpress.com/item/${id}.html`, content: "" });
  }
  return out;
}

/** otto.de arama sayfası: ürün kutucuğu bağlantısı aria-label'da ürün adını taşır. */
export function parseOtto(html: string): SearchResult[] {
  const out: SearchResult[] = [];
  for (const m of html.matchAll(/<a href="(\/p\/[^"]+)" aria-label="([^"]+)" data-link-type="tile"/g)) {
    const url = `https://www.otto.de${m[1]}`;
    if (!out.some((r) => r.url === url)) out.push({ title: decodeEntities(m[2]), url, content: "" });
  }
  return out;
}

export const DIRECT_SITES: DirectSite[] = [
  { name: "Amazon.com", searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, parse: parseAmazon, required: true },
  { name: "AliExpress", searchUrl: (q) => `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/\s+/g, "-"))}.html`, parse: parseAliExpress, required: false },
  { name: "Otto", searchUrl: (q) => `https://www.otto.de/suche/${encodeURIComponent(q)}/`, parse: parseOtto, required: false },
];

/** Sorgu: ürün adı marka adını içermiyorsa marka adı eklenir. */
export function directQuery(brandName: string, productName: string): string {
  const compact = (s: string) => normalizeName(s).replace(/\s+/g, "");
  const brand = brandName.replace(/[®™]/g, "").trim();
  const q = compact(productName).includes(compact(brand)) ? productName : `${brand} ${productName}`;
  return q.replace(/["“”]/g, "").trim().slice(0, 120);
}

/**
 * Tüm doğrudan siteleri arar. Siteler farklı alan adlarında olduğu için paralel çalışır.
 * `failed`: okunamayan siteler; zorunlu bir site okunamazsa sonuç eksik sayılır.
 */
export function directSearch(fetchPage: FetchPage, sites: DirectSite[] = DIRECT_SITES): SearchFn {
  return async (query) => {
    const settled = await Promise.all(
      sites.map(async (site) => {
        const res = await fetchPage(site.searchUrl(query));
        if (!res.ok) return { site, results: null, why: res.reason };
        if (BOT_PAGE.test(res.text.slice(0, 50_000)) && site.parse(res.text).length === 0) return { site, results: null, why: "bot doğrulama sayfası" };
        return { site, results: site.parse(res.text), why: "" };
      }),
    );
    const failed = settled.filter((s) => s.results === null);
    return {
      ok: true,
      results: settled.flatMap((s) => s.results ?? []),
      failed: failed.map((s) => `${s.site.name} (${s.why})`),
      incomplete: failed.some((s) => s.site.required),
      checked: settled.filter((s) => s.results !== null).map((s) => s.site.name),
    };
  };
}
