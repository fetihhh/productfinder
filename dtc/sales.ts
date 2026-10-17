// Doğrulanmış ürünlerin günlük satış işaretleri (fiyat, yorum, stok). Pazaryeri araması yapmaz, kota harcamaz.
import type { FetchResult } from "../lib/http.ts";
import { pageSignals, parseShopifyProduct, parseYotpoBottomline, shopifyProductJsonUrl, type PageSignals, type Rating } from "./signals.ts";
import { inventoryFromHtml, parseShopifyJs, shopifyJsUrl } from "./stock.ts";

type FetchPage = (url: string, accept?: string) => Promise<FetchResult>;

/** Sayfadaki yorum özeti; yoksa Yotpo'nun herkese açık özet uç noktası. */
export async function readRating(signals: PageSignals, productId: string | null, fetchPage: FetchPage): Promise<Rating | null> {
  if (signals.rating) return signals.rating;
  if (!signals.yotpoAppKey || !productId) return null;
  const res = await fetchPage(`https://api-cdn.yotpo.com/products/${signals.yotpoAppKey}/${productId}/bottomline`, "application/json");
  return res.ok ? parseYotpoBottomline(res.text) : null;
}

export type SalesSnapshot = {
  price: number | null;
  currency: string | null;
  reviewCount: number | null;
  rating: number | null;
  availability: string | null;
  /** Satış takibi (Shopify .js): indirim öncesi fiyat, stokta olan / toplam varyant, görünüyorsa kalan adet. */
  compareAt?: number | null;
  variantsAvailable?: number | null;
  variantsTotal?: number | null;
  inventory?: number | null;
  stockTracked?: boolean | null;
};

export async function readSales(productUrl: string, fetchPage: FetchPage): Promise<{ ok: true; sales: SalesSnapshot } | { ok: false; reason: string }> {
  const page = await fetchPage(productUrl);
  if (!page.ok) return { ok: false, reason: page.reason };
  const signals = pageSignals(page.text);
  let price = signals.offer ? Number(signals.offer.price) : null;
  let productId = signals.shopifyProductId;

  // .js: varyant stoğu ve indirim öncesi fiyat; okunamazsa .json (yalnızca fiyat ve kimlik).
  const jsUrl = shopifyJsUrl(page.url);
  const js = jsUrl ? await fetchPage(jsUrl, "application/json") : null;
  const stock = js?.ok ? parseShopifyJs(js.text) : null;
  if (stock) {
    price = stock.price ?? price;
    productId = stock.id ?? productId;
  } else {
    const jsonUrl = shopifyProductJsonUrl(page.url);
    if (jsonUrl) {
      const res = await fetchPage(jsonUrl, "application/json");
      const product = res.ok ? parseShopifyProduct(res.text) : null;
      if (product) {
        price = product.price ?? price;
        productId = product.id ?? productId;
      }
    }
  }
  const rating = await readRating(signals, productId, fetchPage);
  return {
    ok: true,
    sales: {
      price: price !== null && Number.isFinite(price) ? price : null,
      currency: signals.offer?.currency ?? null,
      reviewCount: rating?.count ?? null,
      rating: rating?.value ?? null,
      availability: signals.offer?.availability ?? null,
      compareAt: stock?.compareAt ?? null,
      variantsAvailable: stock ? stock.variants.filter((v) => v.available).length : null,
      variantsTotal: stock ? stock.variants.length : null,
      inventory: inventoryFromHtml(page.text, stock?.variants.length ?? null),
      stockTracked: stock ? stock.tracked : null,
    },
  };
}
