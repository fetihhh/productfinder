// Satış takibi: Shopify'ın herkese açık ürün uç noktası (/products/<handle>.js) her varyantın stokta olup olmadığını,
// fiyatını ve indirim öncesi fiyatını verir; kalan adet verilmez (Shopify 2017'den beri gizliyor). Tema kalan adedi
// sayfada gösteriyorsa ("Only 5 left", Dawn'ın stok bildirimi ya da ürün JSON'undaki inventory_quantity) o da okunur.
// Satış işaretleri iki ölçüm arasındaki farktan çıkar: tükenen varyant, yeniden stoğa giren varyant, azalan adet, fiyat değişimi.

type Json = Record<string, unknown>;

export type Variant = { available: boolean; price: number | null; compareAt: number | null; tracked: boolean };

export type ShopifyJsProduct = {
  id: string | null;
  price: number | null;
  compareAt: number | null;
  variants: Variant[];
  /** Mağaza en az bir varyantta stok takibi yapıyor (inventory_management = shopify). Yapmıyorsa varyant hep "stokta" görünür. */
  tracked: boolean;
};

/** .js uç noktasında fiyatlar kuruş cinsindendir (4990 → 49,90). */
const cents = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) / 100 : null;
};

/** "https://x.com/products/lamp?variant=1" → "https://x.com/products/lamp.js" (dil ve koleksiyon önekleri korunur). */
export function shopifyJsUrl(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const m = url.pathname.match(/^((?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:collections\/[^/]+\/)?products\/[^/.?#]+)\/?$/i);
  return m ? `${url.origin}${m[1]}.js` : null;
}

export function parseShopifyJs(text: string): ShopifyJsProduct | null {
  let p: Json;
  try {
    p = JSON.parse(text) as Json;
  } catch {
    return null;
  }
  if (!p || typeof p !== "object" || !Array.isArray(p.variants)) return null;
  const variants = (p.variants as Json[]).map((v) => ({
    available: v.available === true,
    price: cents(v.price),
    compareAt: cents(v.compare_at_price),
    tracked: v.inventory_management === "shopify",
  }));
  const prices = variants.map((v) => v.price).filter((n): n is number => n !== null);
  const compares = variants.map((v) => v.compareAt).filter((n): n is number => n !== null);
  const price = prices.length ? Math.min(...prices) : cents(p.price);
  const compareAt = compares.length ? Math.max(...compares) : null;
  return {
    id: typeof p.id === "number" || typeof p.id === "string" ? String(p.id) : null,
    price,
    compareAt: compareAt !== null && price !== null && compareAt > price ? compareAt : null,
    variants,
    tracked: variants.some((v) => v.tracked),
  };
}

/**
 * Temanın gösterdiği kalan adet. Yalnızca Shopify'ın kendi verisinden gelen biçimler okunur: ürün JSON'undaki
 * "inventory_quantity" toplamı ya da Dawn temasının stok bildirimi (`product__inventory`). Uygulamaların "Son 7 ürün!"
 * sayaçları çoğu zaman uydurma olduğu için okunmaz. JSON'daki adetler yalnızca sayısı ürünün varyant sayısına eşitse
 * kullanılır (sayfadaki önerilen ürünlerin adetleri karışmasın).
 */
export function inventoryFromHtml(html: string, variantCount: number | null): number | null {
  const qty = [...html.matchAll(/"inventory_quantity"\s*:\s*(-?\d+)/g)].map((m) => Number(m[1]));
  if (qty.length && variantCount && qty.length === variantCount) return qty.reduce((a, n) => a + Math.max(0, n), 0);
  const block = html.match(/class=["'][^"']*product__inventory[^"']*["'][^>]*>([\s\S]{0,600}?)<\/(?:p|div)>/i)?.[1];
  if (!block) return null;
  const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const n = text.match(/(\d{1,5})\s*(?:left|in stock|auf lager|op voorraad|en stock|disponibles?|stokta|adet|kaldı|übrig|rimasti|kpl|st\b)/i)?.[1];
  return n ? Number(n) : null;
}

export type Measurement = {
  price: number | null;
  variantsAvailable: number | null;
  variantsTotal: number | null;
  inventory: number | null;
  currency?: string | null;
};

/**
 * Fiyat değişimi sayılmayan oynama: Avrupalı mağazaların çoğu ABD'deki sunucuya fiyatı günlük kurla USD gösterir
 * (Shopify Markets) ve kur her gün biraz oynar; ayrıca yuvarlama farkları (191 → 190). %3'ten küçük fark değişim sayılmaz.
 */
export const PRICE_CHANGE_MIN = 0.03;

export type StockEvents = { soldOut: number; restocked: number; unitsSold: number; priceChanged: boolean };

/**
 * İki ölçüm arasındaki satış işaretleri. Varyant yapısı değiştiyse (varyant eklendi/silindi) stok farkı sayılmaz.
 * Adet artışı yeniden stok sayılır, satış değil.
 */
export function stockEvents(prev: Measurement | null, cur: Measurement): StockEvents {
  const none = { soldOut: 0, restocked: 0, unitsSold: 0, priceChanged: false };
  if (!prev) return none;
  const sameShape = prev.variantsTotal !== null && prev.variantsTotal === cur.variantsTotal;
  const pa = prev.variantsAvailable;
  const ca = cur.variantsAvailable;
  return {
    soldOut: sameShape && pa !== null && ca !== null && ca < pa ? pa - ca : 0,
    restocked: sameShape && pa !== null && ca !== null && ca > pa ? ca - pa : 0,
    unitsSold: prev.inventory !== null && cur.inventory !== null && cur.inventory < prev.inventory ? prev.inventory - cur.inventory : 0,
    priceChanged:
      prev.price !== null &&
      cur.price !== null &&
      prev.price > 0 &&
      !(prev.currency && cur.currency && prev.currency !== cur.currency) &&
      Math.abs(prev.price - cur.price) / prev.price >= PRICE_CHANGE_MIN,
  };
}
