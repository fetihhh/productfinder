// Türk e-ticaret altyapıları (ikas, Ticimax): Shopify'daki products.json karşılığı yoktur. Ürün listesi site haritasından
// (sitemap.xml → ürün site haritası: adres, son güncelleme, görsel), öne çıkan ürün ana sayfadan, ürünün adı/fiyatı/para
// birimi/stok durumu ürün sayfasındaki schema.org JSON-LD'den okunur. Mağaza başına ~5 istek; robots.txt'ye uyulur.
import type { FetchResult } from "../lib/http.ts";
import { instagramHandle, tiktokHandle } from "./instagram.ts";
import { productOffer } from "./offers.ts";
import type { LiveStore, StoreProbe, StoreProduct } from "./storeProbe.ts";
import { storeTech } from "./storeTech.ts";

type FetchPage = (url: string, accept?: string) => Promise<FetchResult>;

export type SitemapEntry = { loc: string; lastmod: string | null; image: string | null };

/** Site haritası: urlset ise girdiler, sitemapindex ise alt haritaların adresleri. */
export function parseSitemap(xml: string): { entries: SitemapEntry[]; children: string[] } {
  const children = /<sitemapindex/i.test(xml) ? [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)].map((m) => m[1]) : [];
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => {
    const block = m[1];
    return {
      loc: block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1] ?? "",
      lastmod: block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1] ?? null,
      image: block.match(/<image:loc>\s*([^<\s]+)\s*<\/image:loc>/i)?.[1] ?? null,
    };
  });
  return { entries: entries.filter((e) => e.loc), children };
}

/** Ürün site haritası: adında "product" geçen alt harita (ikas: /products.xml, Ticimax: /sitemap/products/0.xml). */
export const productSitemaps = (children: string[]) => children.filter((c) => /product/i.test(c)).slice(0, 2);

export type LdProduct = { name: string; image: string | null; price: number | null; currency: string | null; inStock: boolean | null; description: string | null };

/** Sayfadaki JSON-LD bloklarından schema.org Product (dizi ve @graph içindekiler dahil). */
export function ldProduct(html: string): LdProduct | null {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      continue;
    }
    const nodes: unknown[] = Array.isArray(data) ? data : [data, ...(((data as { "@graph"?: unknown[] })?.["@graph"] as unknown[]) ?? [])];
    for (const n of nodes) {
      const o = n as Record<string, unknown>;
      const type = o?.["@type"];
      if (!(type === "Product" || (Array.isArray(type) && type.includes("Product")))) continue;
      const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
      const img = Array.isArray(o.image) ? o.image[0] : o.image;
      const price = Number(offers?.price ?? offers?.lowPrice);
      return {
        name: String(o.name ?? "").trim(),
        image: typeof img === "string" ? img : typeof (img as { url?: string })?.url === "string" ? (img as { url: string }).url : null,
        price: Number.isFinite(price) && price > 0 ? price : null,
        currency: typeof offers?.priceCurrency === "string" ? offers.priceCurrency : null,
        inStock: typeof offers?.availability === "string" ? /InStock|LimitedAvailability|PreOrder/i.test(offers.availability) : null,
        description: typeof o.description === "string" ? o.description : null,
      };
    }
  }
  return null;
}

/** Mağaza adı: JSON-LD Store/Organization adı, yoksa sayfa başlığının ilk parçası. */
export function shopNameOf(html: string): string | null {
  const ld = html.match(/"@type"\s*:\s*"(?:Store|Organization|OnlineStore)"[^}]*?"name"\s*:\s*"([^"]{2,80})"/)?.[1];
  if (ld) return ld;
  const title = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1]?.trim();
  return title ? title.split(/\s[|\-–—]\s/).pop()!.trim() : null;
}

/** Adres yolundan okunur ad: "/halter-yaka-kemerli-elbise-siyah-148386" → "Halter yaka kemerli elbise siyah". */
export function titleFromPath(path: string): string {
  const slug = decodeURIComponent(path.replace(/^\/+|\/+$/g, "").split("/").pop() ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+[a-z]*\d{4,}$/i, "")
    .trim();
  return slug ? slug.charAt(0).toLocaleUpperCase("tr") + slug.slice(1) : path;
}

const pathOf = (loc: string) => {
  try {
    return new URL(loc).pathname;
  } catch {
    return loc;
  }
};

/** ikas/Ticimax mağazası: site haritası + ana sayfa + öne çıkan ürün sayfası. */
export async function probeTrStore(domain: string, platform: "ikas" | "ticimax", fetchPage: FetchPage): Promise<StoreProbe> {
  const base = `https://www.${domain}`;
  const index = await fetchPage(`${base}/sitemap.xml`, "application/xml,text/xml;q=0.9,*/*;q=0.5");
  if (!index.ok) {
    if (/HTTP (404|410)/.test(index.reason) || (/robots/.test(index.reason) && !index.retryable)) return { state: "dead", why: index.reason };
    return { state: "error", why: index.reason };
  }
  const top = parseSitemap(index.text);
  let entries = top.entries;
  for (const child of productSitemaps(top.children)) {
    const r = await fetchPage(child, "application/xml,text/xml;q=0.9,*/*;q=0.5");
    if (r.ok) entries = [...entries, ...parseSitemap(r.text).entries];
  }
  // Ürün olmayan sayfalar (kategori, sayfa, blog) site haritası adından ayrılmıştır; kök ve bilinen yollar yine de atılır.
  entries = entries.filter((e) => {
    const p = pathOf(e.loc);
    return p.length > 1 && !/^\/(pages|blogs?|collections?|kategori|category|brands?|marka|etiket|label|search|arama)\b/i.test(p);
  });
  if (entries.length === 0) return { state: "closed", why: "Site haritasında ürün yok" };
  entries = entries.slice(0, 300);

  const home = await fetchPage(`${base}/`);
  const homeHtml = home.ok ? home.text : null;
  const byPath = new Map(entries.map((e) => [pathOf(e.loc), e]));
  let heroEntry: SitemapEntry | null = null;
  if (homeHtml) {
    for (const m of homeHtml.matchAll(/href="(?:https?:\/\/[^"/]+)?(\/[^"#?]+)"/g)) {
      const e = byPath.get(m[1]);
      if (e) {
        heroEntry = e;
        break;
      }
    }
  }
  heroEntry ??= [...entries].sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))[0];
  const heroPage = await fetchPage(heroEntry.loc);
  const ld = heroPage.ok ? ldProduct(heroPage.text) : null;

  const products: StoreProduct[] = entries.map((e) => {
    const isHero = e === heroEntry;
    const price = isHero ? (ld?.price ?? null) : null;
    return {
      handle: pathOf(e.loc).replace(/^\//, ""),
      title: isHero && ld?.name ? ld.name : titleFromPath(pathOf(e.loc)),
      image: (isHero ? ld?.image : null) ?? e.image,
      price,
      compareAt: null,
      createdAt: e.lastmod,
      physical: true,
      productType: null,
      // Stok yalnızca öne çıkan ürün için bilinir; diğerleri "bilinmiyor" (1/1) sayılır, sahte stok azalması üretmesin.
      availableVariants: isHero && ld?.inStock === false ? 0 : 1,
      totalVariants: 1,
      aliImageId: null,
      dropship: false,
      apparel: false,
      offer: productOffer(isHero ? (ld?.description ?? null) : null, [], price, null),
    };
  });
  const dates = entries.map((e) => e.lastmod).filter((d): d is string => Boolean(d)).sort();
  const hero = products.find((p) => p.handle === pathOf(heroEntry!.loc).replace(/^\//, "")) ?? null;
  // Ticimax para birimini küçük harfle yazar ("try"); ikas/Ticimax Türk altyapısıdır, bilinmiyorsa TL varsayılır.
  const currency = ld?.currency?.toUpperCase() ?? (platform ? "TRY" : null);
  const live: LiveStore = {
    state: "live",
    products,
    productCount: products.length,
    physicalCount: products.length,
    discountedCount: 0,
    dropshipCount: 0,
    apparelCount: 0,
    aliImageCount: 0,
    minPrice: hero?.price ?? null,
    maxPrice: hero?.price ?? null,
    firstProductAt: dates[0] ?? null,
    lastProductAt: dates[dates.length - 1] ?? null,
    availableVariants: products.reduce((s, p) => s + p.availableVariants, 0),
    totalVariants: products.length,
    shopName: homeHtml ? shopNameOf(homeHtml) : null,
    country: currency === "TRY" ? "TR" : null,
    currency,
    shipsToTr: currency === "TRY" ? true : null,
    hero,
    instagram: homeHtml ? (instagramHandle(homeHtml) ?? "") : undefined,
    tiktok: homeHtml ? (tiktokHandle(homeHtml) ?? "") : undefined,
    tech: homeHtml ? storeTech(homeHtml) : undefined,
  };
  return live;
}
