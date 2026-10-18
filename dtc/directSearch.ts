// Doğrudan pazaryeri araması: kota ve anahtar gerektirmez. Toptan platformları (AliExpress, Alibaba) burada aranmaz;
// onlar eleme sebebi değil tedarik kaynağıdır (dtc/suppliers.ts). Yalnızca robots.txt'nin arama sayfasına izin verdiği
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
  { name: "Otto", searchUrl: (q) => `https://www.otto.de/suche/${encodeURIComponent(q)}/`, parse: parseOtto, required: false },
];

/** Sorgu: ürün adı marka adını içermiyorsa marka adı eklenir. */
export function directQuery(brandName: string, productName: string): string {
  const compact = (s: string) => normalizeName(s).replace(/\s+/g, "");
  const brand = brandName.replace(/[®™]/g, "").trim();
  const q = compact(productName).includes(compact(brand)) ? productName : `${brand} ${productName}`;
  // Karakter (kod noktası) bazında kısaltılır: "𝗨𝗹𝘁𝗿𝗮" gibi süslü harfler iki UTF-16 birimidir, ortadan bölünürse adres kodlanamaz (URI malformed).
  return Array.from(q.replace(/["“”]/g, "").trim()).slice(0, 120).join("");
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
