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

export type PageSignals = {
  hasCartForm: boolean;
  hasBuyButton: boolean;
  offer: { price: string; currency: string | null; availability: string | null } | null;
  productName: string | null;
  productImage: string | null;
  digitalType: string | null;
  shippingDetails: boolean;
  hasProductSchema: boolean;
};

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
  };
}

// ---- Shopify ----

/** /products/<handle> (yerel önekli /en-us/products/<handle> dahil) → /products/<handle>.json */
export function shopifyProductJsonUrl(pageUrl: string): string | null {
  const url = new URL(pageUrl);
  const m = url.pathname.match(/^((?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:collections\/[^/]+\/)?products\/[^/.?#]+)\/?$/i);
  if (!m) return null;
  return `${url.origin}${m[1]}.json`;
}

export type ShopifyProduct = { title: string | null; image: string | null; requiresShipping: boolean | null; variantCount: number };

export type ShopifyListing = {
  handle: string;
  title: string;
  image: string | null;
  requiresShipping: boolean | null;
  available: boolean | null;
};

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
        handle: p.handle,
        title: p.title,
        image: typeof images[0]?.src === "string" ? (images[0].src as string) : null,
        requiresShipping: shipping.length ? shipping.some(Boolean) : null,
        available: available.length ? available.some(Boolean) : null,
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
      title: typeof p.title === "string" ? p.title : null,
      image: typeof image === "string" ? image : null,
      requiresShipping: flags.length ? flags.some(Boolean) : null,
      variantCount: variants.length,
    };
  } catch {
    return null;
  }
}
