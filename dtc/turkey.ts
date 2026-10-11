// Türkiye'de satılıyor mu: ürünün Türk pazaryerlerinde ve fiyat karşılaştırma sitelerinde benzer ilanları. Tavily arama
// API'siyle yapılır (sitelerin kendisi kazınmaz; Trendyol/Pazarama/Cimri aramayı robots.txt ile kapatır, diğerleri 403
// döner). Sonuçlar "benzer ilan" olarak gösterilir: aynı ürün olduğu kesin değildir, kullanıcı bağlantıdan kontrol eder.
import { isSearchPage, type SearchResult } from "./marketplaceSearch.ts";

export const TR_DOMAINS = ["trendyol.com", "hepsiburada.com", "n11.com", "amazon.com.tr", "ciceksepeti.com", "pazarama.com", "akakce.com", "cimri.com"];

const SITE_NAMES: Record<string, string> = {
  "trendyol.com": "Trendyol",
  "hepsiburada.com": "Hepsiburada",
  "n11.com": "n11",
  "amazon.com.tr": "Amazon TR",
  "ciceksepeti.com": "Çiçeksepeti",
  "pazarama.com": "Pazarama",
  "akakce.com": "Akakçe",
  "cimri.com": "Cimri",
};

export type TrListing = { title: string; url: string; site: string; price: number | null };

/** "1.299,90 TL", "₺549", "549,00 ₺" → 1299.9 / 549. Mantıksız değerler (≤ 1 TL ya da ≥ 1 milyon) atlanır. */
export function tryPrice(text: string): number | null {
  const m = text.match(/(?:₺\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?))|(?:(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:TL|₺))/);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 1 && n < 1_000_000 ? n : null;
}

const siteOf = (url: URL) => TR_DOMAINS.find((d) => url.hostname === d || url.hostname.endsWith(`.${d}`)) ?? null;

/** Arama sonuçlarından ilanlar: yalnızca Türk siteleri, arama/kategori sayfaları ve tekrarlar atılır (en fazla 8). */
export function trListings(results: SearchResult[]): TrListing[] {
  const out: TrListing[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    let url: URL;
    try {
      url = new URL(r.url);
    } catch {
      continue;
    }
    const site = siteOf(url);
    if (!site || isSearchPage(url)) continue;
    const key = `${url.hostname}${url.pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: r.title.slice(0, 160), url: r.url, site: SITE_NAMES[site], price: tryPrice(`${r.title} ${r.content}`) });
    if (out.length >= 8) break;
  }
  return out;
}

/** Arama ifadesi: ürünün kısa adı (marka dışı, en fazla 6 kelime) + "fiyat" (Türkçe ilan sayfalarını öne çıkarır). */
export function trQuery(name: string, brandWords: string[] = []): string {
  const words = name
    .replace(/[™®|—–·:()[\]"]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !brandWords.includes(w.toLowerCase()));
  return `${words.slice(0, 6).join(" ")} fiyat`;
}
