// Marka sayfasından platform, satın alma ve fiziksel ürün işaretlerini çıkaran saf fonksiyonlar.

export type Platform = "shopify" | "woocommerce" | "bigcommerce" | "wix" | "squarespace" | "magento" | "salesforce" | "unknown";

const PLATFORM_MARKERS: [Platform, RegExp][] = [
  ["shopify", /cdn\.shopify\.com|Shopify\.theme|\.myshopify\.com/],
  ["woocommerce", /wp-content\/plugins\/woocommerce|class=["'][^"']*\bwoocommerce\b|wc-block-/i],
  ["bigcommerce", /cdn\d*\.bigcommerce\.com|data-stencil|BCData/i],
  ["wix", /static\.wixstatic\.com|wix-ecommerce|_wixCIDX/i],
  ["squarespace", /static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/i],
  ["magento", /Magento_|mage\/cookies|data-mage-init/],
  ["salesforce", /demandware\.static|\/on\/demandware\.store\//i],
];

export function detectPlatform(html: string): Platform {
  for (const [platform, re] of PLATFORM_MARKERS) if (re.test(html)) return platform;
  return "unknown";
}

type Json = Record<string, unknown>;

/** <script type="application/ld+json"> içindeki tüm nesneleri (@graph dahil) düz liste olarak döndürür. */
export function parseJsonLd(html: string): Json[] {
  const out: Json[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const obj = node as Json;
    if (obj["@type"]) out.push(obj);
    for (const v of Object.values(obj)) if (v && typeof v === "object") walk(v);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      // bozuk JSON-LD: atla
    }
  }
  return out;
}

function types(obj: Json): string[] {
  const t = obj["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

const DIGITAL_TYPES = new Set([
  "SoftwareApplication", "MobileApplication", "WebApplication", "VideoGame", "DigitalDocument",
  "Course", "Event", "Service", "Book", "Movie", "MusicAlbum", "Game",
]);

export type Rating = { count: number; value: number | null; source: string };

export type PageSignals = {
  hasCartForm: boolean;
  hasBuyButton: boolean;
  offer: { price: string; currency: string | null; availability: string | null } | null;
  productName: string | null;
  productImage: string | null;
  digitalType: string | null;
  shippingDetails: boolean;
  hasProductSchema: boolean;
  /** Sayfada doğrudan okunabilen yorum özeti (schema.org AggregateRating veya Judge.me rozeti). */
  rating: Rating | null;
  /** Marka adı: og:site_name, schema.org Organization veya Product.brand. */
  siteName: string | null;
  /** schema.org adresindeki ülke (ISO-2), varsa. */
  orgCountry: string | null;
  shopifyProductId: string | null;
  yotpoAppKey: string | null;
};

const COUNTRY_NAMES: Record<string, string> = {
  "united states": "US", usa: "US", "united kingdom": "GB", uk: "GB", germany: "DE", deutschland: "DE",
  france: "FR", italy: "IT", spain: "ES", netherlands: "NL", switzerland: "CH", canada: "CA", australia: "AU",
  japan: "JP", china: "CN", portugal: "PT", sweden: "SE", denmark: "DK", norway: "NO", turkey: "TR", türkiye: "TR",
};

function countryCode(v: unknown): string | null {
  const raw = typeof v === "string" ? v : v && typeof v === "object" ? (v as Json).name : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_NAMES[s.toLowerCase()] ?? null;
}

function ratingFromJsonLd(ld: Json[]): Rating | null {
  for (const o of ld) {
    const agg = (types(o).includes("AggregateRating") ? o : (o.aggregateRating as Json | undefined)) ?? null;
    if (!agg || typeof agg !== "object") continue;
    const count = Number(agg.reviewCount ?? agg.ratingCount);
    if (Number.isFinite(count) && count >= 0) {
      const value = Number(agg.ratingValue);
      return { count, value: Number.isFinite(value) ? value : null, source: "schema.org" };
    }
  }
  return null;
}

function ratingFromJudgeMe(html: string): Rating | null {
  const m = html.match(/class=["'][^"']*jdgm-prev-badge[^"']*["'][^>]*>/i)?.[0] ?? html.match(/<[^>]*data-number-of-reviews=[^>]*>/i)?.[0];
  if (!m) return null;
  const count = Number(m.match(/data-number-of-reviews=["']?(\d+)/i)?.[1]);
  const value = Number(m.match(/data-average-rating=["']?([\d.]+)/i)?.[1]);
  return Number.isFinite(count) ? { count, value: Number.isFinite(value) && count > 0 ? value : null, source: "Judge.me" } : null;
}

function firstString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === "object" && typeof (v as Json).url === "string") return (v as Json).url as string;
  return null;
}

export function pageSignals(html: string): PageSignals {
  const ld = parseJsonLd(html);
  const product = ld.find((o) => types(o).some((t) => t === "Product" || t === "ProductGroup"));
  // Fiyat Offer'ın kendisinde (price/lowPrice) ya da priceSpecification içinde olabilir.
  const offerPrice = (o: Json): string | null => {
    const spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
    const raw = o.price ?? o.lowPrice ?? (spec && typeof spec === "object" ? (spec as Json).price : undefined);
    return raw !== undefined && raw !== null && Number(raw) > 0 ? String(raw) : null;
  };
  const offerObj = ld.find((o) => types(o).some((t) => t === "Offer" || t === "AggregateOffer") && offerPrice(o) !== null);
  const digital = ld.flatMap(types).find((t) => DIGITAL_TYPES.has(t)) ?? null;

  return {
    hasCartForm: /<form\b[^>]*action\s*=\s*["'][^"']*\/cart\/add/i.test(html),
    hasBuyButton: /add to (cart|bag|basket)|buy now|sepete ekle|in den warenkorb|ajouter au panier/i.test(html),
    offer: offerObj
      ? {
          price: offerPrice(offerObj)!,
          currency:
            typeof offerObj.priceCurrency === "string"
              ? offerObj.priceCurrency
              : (JSON.stringify(offerObj.priceSpecification ?? "").match(/"priceCurrency":"([A-Z]{3})"/)?.[1] ?? null),
          availability: typeof offerObj.availability === "string" ? offerObj.availability.replace(/^https?:\/\/schema\.org\//, "") : null,
        }
      : null,
    productName: product && typeof product.name === "string" ? product.name.trim() : null,
    productImage: product ? firstString(product.image) : null,
    digitalType: digital,
    shippingDetails: ld.some((o) => types(o).includes("OfferShippingDetails")) || /"weight"\s*:/.test(html),
    hasProductSchema: Boolean(product),
    rating: ratingFromJsonLd(ld) ?? ratingFromJudgeMe(html),
    siteName: siteName(html, ld, product),
    orgCountry:
      ld
        .filter((o) => types(o).some((t) => t === "Organization" || t === "Store" || t === "LocalBusiness"))
        .map((o) => countryCode((o.address as Json | undefined)?.addressCountry))
        .find(Boolean) ?? null,
    shopifyProductId:
      html.match(/ShopifyAnalytics\.meta\s*=\s*\{[^]*?"product":\{"id":(\d+)/)?.[1] ??
      html.match(/"product":\{"id":(\d{6,})/)?.[1] ??
      null,
    yotpoAppKey: html.match(/(?:staticw2\.yotpo\.com|cdn-widgetsrepository\.yotpo\.com\/v1\/loader)\/([A-Za-z0-9]{20,})/)?.[1] ?? null,
  };
}

function siteName(html: string, ld: Json[], product: Json | undefined): string | null {
  const og = html.match(/<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const org = ld.find((o) => types(o).includes("Organization"))?.name;
  const brand = product?.brand;
  const brandName = typeof brand === "string" ? brand : brand && typeof brand === "object" ? (brand as Json).name : null;
  const name = [og, org, brandName].find((v): v is string => typeof v === "string" && v.trim().length >= 2);
  return name ? name.replace(/&amp;/g, "&").trim() : null;
}

// ---- Shopify mağaza bilgisi (/meta.json) ----

export type ShopifyMeta = {
  name: string | null;
  country: string | null;
  city: string | null;
  shipsTo: string[] | null;
  productCount: number | null;
  currency: string | null;
};

export function parseShopifyMeta(text: string): ShopifyMeta | null {
  try {
    const j = JSON.parse(text) as Json;
    if (typeof j.myshopify_domain !== "string" && typeof j.id !== "number") return null;
    const ships = Array.isArray(j.ships_to_countries) ? j.ships_to_countries.filter((c): c is string => typeof c === "string") : null;
    return {
      name: typeof j.name === "string" ? j.name.replace(/[®™]/g, "").trim() : null,
      country: typeof j.country === "string" ? j.country.toUpperCase() : null,
      city: typeof j.city === "string" ? j.city.trim() : null,
      shipsTo: ships,
      productCount: typeof j.published_products_count === "number" ? j.published_products_count : null,
      currency: typeof j.currency === "string" ? j.currency : null,
    };
  } catch {
    return null;
  }
}

/** Yotpo yorum özeti (api-cdn.yotpo.com/products/<appKey>/<productId>/bottomline; robots.txt izin veriyor). */
export function parseYotpoBottomline(text: string): Rating | null {
  try {
    const b = (JSON.parse(text) as { response?: { bottomline?: { total_reviews?: number; average_score?: number } } }).response?.bottomline;
    if (!b || typeof b.total_reviews !== "number") return null;
    return { count: b.total_reviews, value: b.total_reviews > 0 ? (b.average_score ?? null) : null, source: "Yotpo" };
  } catch {
    return null;
  }
}

/** Alan adı uzantısından ülke (yalnızca ülke uzantıları: .ch → CH, .co.uk → GB). */
export function countryFromTld(publicSuffix: string): string | null {
  const last = publicSuffix.split(".").pop() ?? "";
  if (last.length !== 2) return null;
  // Ülkeden bağımsız, marka adı için kullanılan popüler uzantılar (.co, .io …) ülke sayılmaz.
  if (!publicSuffix.includes(".") && ["co", "io", "ai", "me", "tv", "cc", "ly", "fm", "gg", "is", "so", "to"].includes(last)) return null;
  return last === "uk" ? "GB" : last.toUpperCase();
}

// ---- Shopify ----

/** /products/<handle> (yerel önekli /en-us/products/<handle> dahil) → /products/<handle>.json */
export function shopifyProductJsonUrl(pageUrl: string): string | null {
  const url = new URL(pageUrl);
  const m = url.pathname.match(/^((?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:collections\/[^/]+\/)?products\/[^/.?#]+)\/?$/i);
  if (!m) return null;
  return `${url.origin}${m[1]}.json`;
}

export type ShopifyProduct = {
  id: string | null;
  title: string | null;
  image: string | null;
  requiresShipping: boolean | null;
  variantCount: number;
  price: number | null;
  publishedAt: string | null;
  productType: string | null;
};

export type ShopifyListing = {
  id: string | null;
  handle: string;
  title: string;
  image: string | null;
  requiresShipping: boolean | null;
  available: boolean | null;
  variantCount: number;
  price: number | null;
  publishedAt: string | null;
  productType: string | null;
};

function minPrice(variants: Json[]): number | null {
  const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : null;
}

function idOf(p: Json): string | null {
  return typeof p.id === "number" || typeof p.id === "string" ? String(p.id) : null;
}

function productTypeOf(p: Json): string | null {
  return typeof p.product_type === "string" && p.product_type.trim() ? p.product_type.trim().slice(0, 80) : null;
}

function publishedOf(p: Json): string | null {
  const v = p.published_at ?? p.created_at;
  return typeof v === "string" ? v : null;
}

/** /products.json (mağaza kataloğu) ayrıştırma. */
export function parseShopifyCatalog(text: string): ShopifyListing[] {
  try {
    const data = JSON.parse(text) as { products?: Json[] };
    return (data.products ?? []).flatMap((p) => {
      if (typeof p.handle !== "string" || typeof p.title !== "string") return [];
      const variants = Array.isArray(p.variants) ? (p.variants as Json[]) : [];
      const shipping = variants.map((v) => v.requires_shipping).filter((v): v is boolean => typeof v === "boolean");
      const available = variants.map((v) => v.available).filter((v): v is boolean => typeof v === "boolean");
      const images = Array.isArray(p.images) ? (p.images as Json[]) : [];
      return [{
        id: idOf(p),
        handle: p.handle,
        title: p.title,
        image: typeof images[0]?.src === "string" ? (images[0].src as string) : null,
        requiresShipping: shipping.length ? shipping.some(Boolean) : null,
        available: available.length ? available.some(Boolean) : null,
        variantCount: variants.length,
        price: minPrice(variants),
        publishedAt: publishedOf(p),
        productType: productTypeOf(p),
      }];
    });
  } catch {
    return [];
  }
}

export function parseShopifyProduct(text: string): ShopifyProduct | null {
  try {
    const data = JSON.parse(text) as { product?: Json };
    const p = data.product;
    if (!p) return null;
    const variants = Array.isArray(p.variants) ? (p.variants as Json[]) : [];
    const flags = variants.map((v) => v.requires_shipping).filter((v): v is boolean => typeof v === "boolean");
    const image = (p.image as Json | null)?.src;
    return {
      id: idOf(p),
      title: typeof p.title === "string" ? p.title : null,
      image: typeof image === "string" ? image : null,
      requiresShipping: flags.length ? flags.some(Boolean) : null,
      variantCount: variants.length,
      price: minPrice(variants),
      publishedAt: publishedOf(p),
      productType: productTypeOf(p),
    };
  } catch {
    return null;
  }
}
