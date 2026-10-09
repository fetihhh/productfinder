import { test } from "node:test";
import assert from "node:assert/strict";
import { bestCatalogMatch, verifyProduct, type VerifyDeps } from "../dtc/verify.ts";
import { detectPlatform, pageSignals, parseShopifyCatalog, parseShopifyProduct, shopifyProductJsonUrl } from "../dtc/signals.ts";
import { findMarketplaceListing, type SearchOutcome } from "../dtc/marketplaceSearch.ts";
import type { FetchResult } from "../lib/http.ts";

// ---- Sahte sayfalar ----

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

const SHOPIFY_PAGE = `<html><head><link href="//cdn.shopify.com/s/files/theme.css">
${ld({ "@context": "https://schema.org", "@type": "Product", name: "TDM NEO", image: "https://cdn.shopify.com/neo.jpg",
  offers: { "@type": "Offer", price: "149.00", priceCurrency: "USD", availability: "https://schema.org/InStock" } })}
</head><body><form action="/cart/add" method="post"><button>Add to cart</button></form></body></html>`;

const shopifyJson = (requiresShipping: boolean, title = "TDM NEO Hybrid Headphones") =>
  JSON.stringify({ product: { title, image: { src: "https://cdn.shopify.com/p.jpg" }, variants: [{ requires_shipping: requiresShipping }] } });

const WOO_PAGE = `<html><head><link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css"></head>
<body class="woocommerce">${ld({ "@graph": [{ "@type": "Product", name: "Compact EDC Sling",
  offers: [{ "@type": "Offer", price: "59.99", priceCurrency: "USD" }] }] })}
<button class="single_add_to_cart_button">Add to cart</button></body></html>`;

const CUSTOM_PAGE = `<html><body>${ld({ "@type": "Product", name: "ArkTac Ultra",
  offers: { "@type": "AggregateOffer", lowPrice: 89.95, priceCurrency: "USD" } })}
${ld({ "@type": "OfferShippingDetails", shippingRate: { value: 0 } })}</body></html>`;

const NO_SHOP_PAGE = `<html><body><h1>Astron GPS Solar</h1><p>Find a retailer near you.</p></body></html>`;

const APP_PAGE = `<html><body>${ld({ "@type": "SoftwareApplication", name: "Cool App",
  offers: { "@type": "Offer", price: "4.99" } })}<a>Buy now</a></body></html>`;

const ok = (url: string, text: string): FetchResult => ({ ok: true, status: 200, url, contentType: "text/html", text });

function deps(pages: Record<string, FetchResult>, search: SearchOutcome | null = { ok: true, results: [] }): VerifyDeps & { searches: string[] } {
  const searches: string[] = [];
  return {
    searches,
    fetchPage: async (url) => pages[url] ?? { ok: false, url, reason: "Ağ hatası: timeout", retryable: true },
    searchMarketplaces: search === null ? null : async (q) => (searches.push(q), search),
  };
}

// ---- DTC alan adları → verified ----

test("DTC 1: Shopify mağazası, kargo gerektiren ürün, pazaryerinde yok → verified", async () => {
  const d = deps({
    "https://tdmofficial.com/products/tdmneo": ok("https://tdmofficial.com/products/tdmneo", SHOPIFY_PAGE),
    "https://tdmofficial.com/products/tdmneo.json": ok("https://tdmofficial.com/products/tdmneo.json", shopifyJson(true)),
  });
  const r = await verifyProduct({ brandDomain: "tdmofficial.com", productUrl: "https://tdmofficial.com/products/tdmneo", productName: "TDM Neo Hybrid Headphones" }, d);
  assert.equal(r.status, "verified", r.reason);
  assert.equal(r.platform, "shopify");
  assert.equal(r.physical, true);
  assert.equal(r.name, "TDM NEO Hybrid Headphones");
  assert.match(r.reason, /Shopify kargo gerektiriyor/);
  // Katı mod: ürün araması + marka araması
  assert.equal(d.searches.length, 2);
  assert.equal(r.brandCheck?.status, "clean");
});

test("DTC 2: WooCommerce mağazası (JSON-LD @graph) → verified", async () => {
  const url = "https://www.tomtoc.com/product/compact-edc-sling/";
  const r = await verifyProduct({ brandDomain: "tomtoc.com", productUrl: url, productName: "Tomtoc Compact EDC Sling Bag" }, deps({ [url]: ok(url, WOO_PAGE) }));
  assert.equal(r.status, "verified", r.reason);
  assert.equal(r.platform, "woocommerce");
  assert.match(r.reason, /fiyat 59\.99 USD/);
});

test("DTC 3: Özel altyapı, AggregateOffer + kargo bilgisi → verified", async () => {
  const url = "https://www.olight.com/store/arktac-ultra";
  const r = await verifyProduct({ brandDomain: "olight.com", productUrl: url, productName: "Olight ArkTac Ultra" }, deps({ [url]: ok(url, CUSTOM_PAGE) }));
  assert.equal(r.status, "verified", r.reason);
  assert.equal(r.platform, "unknown");
  assert.match(r.reason, /kargo\/ağırlık/);
});

// ---- Pazaryeri alan adları → rejected_marketplace ----

for (const [domain, name] of [
  ["amazon.com.tr", "Amazon"],
  ["trendyol.com", "Trendyol"],
  ["ebay.de", "eBay"],
  ["hepsiburada.com", "Hepsiburada"],
] as const) {
  test(`Pazaryeri alan adı ${domain} → ağa çıkmadan rejected_marketplace`, async () => {
    const d = deps({});
    const r = await verifyProduct({ brandDomain: domain, productUrl: `https://www.${domain}/x`, productName: "Ürün" }, d);
    assert.equal(r.status, "rejected_marketplace");
    assert.match(r.reason, new RegExp(name));
    assert.equal(d.searches.length, 0);
  });
}

test("Marka linki pazaryerine yönlendiriyor → rejected_marketplace", async () => {
  const url = "https://brandx.com/buy";
  const r = await verifyProduct(
    { brandDomain: "brandx.com", productUrl: url, productName: "BrandX Lamp" },
    deps({ [url]: ok("https://www.amazon.com/dp/B0TEST", SHOPIFY_PAGE) }),
  );
  assert.equal(r.status, "rejected_marketplace");
  assert.match(r.reason, /pazaryerine yönlendiriyor/);
});

test("DTC sitesi ama ürün Amazon'da da satılıyor → rejected_marketplace", async () => {
  const url = "https://www.olight.com/store/arktac-ultra";
  const search: SearchOutcome = {
    ok: true,
    results: [
      { title: "Olight Warrior 3S flashlight", url: "https://www.amazon.com/dp/B1", content: "" },
      { title: "OLIGHT ArkTac Ultra Multi-Light Flashlight", url: "https://www.amazon.com/dp/B2", content: "" },
    ],
  };
  const r = await verifyProduct({ brandDomain: "olight.com", productUrl: url, productName: "Olight ArkTac Ultra" }, deps({ [url]: ok(url, CUSTOM_PAGE) }, search));
  assert.equal(r.status, "rejected_marketplace");
  assert.match(r.reason, /amazon\.com\/dp\/B2/);
});

// ---- unverified ----

test("Satın alma özelliği yok → unverified", async () => {
  const url = "https://www.seikowatches.com/us-en/products/astron";
  const r = await verifyProduct({ brandDomain: "seikowatches.com", productUrl: url, productName: "Seiko Astron" }, deps({ [url]: ok(url, NO_SHOP_PAGE) }));
  assert.equal(r.status, "unverified");
  assert.equal(r.hasCheckout, false);
  assert.equal(r.retryable, false);
});

test("Dijital ürün (Shopify requires_shipping=false) → unverified, aramaya gidilmez", async () => {
  const d = deps({
    "https://shop.com/products/ebook": ok("https://shop.com/products/ebook", SHOPIFY_PAGE),
    "https://shop.com/products/ebook.json": ok("https://shop.com/products/ebook.json", shopifyJson(false)),
  });
  const r = await verifyProduct({ brandDomain: "shop.com", productUrl: "https://shop.com/products/ebook", productName: "Ebook" }, d);
  assert.equal(r.status, "unverified");
  assert.equal(r.physical, false);
  assert.equal(d.searches.length, 0);
});

test("Yazılım ürünü (schema.org SoftwareApplication) → unverified", async () => {
  const url = "https://coolapp.io/";
  const r = await verifyProduct({ brandDomain: "coolapp.io", productUrl: url, productName: "Cool App" }, deps({ [url]: ok(url, APP_PAGE) }));
  assert.equal(r.status, "unverified");
  assert.match(r.reason, /SoftwareApplication/);
});

test("Kota dolu → unverified ve tekrar denenecek", async () => {
  const url = "https://www.olight.com/store/arktac-ultra";
  const r = await verifyProduct({ brandDomain: "olight.com", productUrl: url, productName: "Olight ArkTac Ultra" }, deps({ [url]: ok(url, CUSTOM_PAGE) }, null));
  assert.equal(r.status, "unverified");
  assert.equal(r.retryable, true);
  assert.match(r.reason, /kota/);
});

test("Site erişilemiyor → unverified ve tekrar denenecek", async () => {
  const r = await verifyProduct({ brandDomain: "down.com", productUrl: "https://down.com/p", productName: "X" }, deps({}));
  assert.equal(r.status, "unverified");
  assert.equal(r.retryable, true);
});

// ---- yardımcılar ----

test("Platform tespiti", () => {
  assert.equal(detectPlatform(SHOPIFY_PAGE), "shopify");
  assert.equal(detectPlatform(WOO_PAGE), "woocommerce");
  assert.equal(detectPlatform('<img src="https://static.wixstatic.com/x.png">'), "wix");
  assert.equal(detectPlatform('<script src="https://cdn11.bigcommerce.com/s-1/x.js">'), "bigcommerce");
  assert.equal(detectPlatform('<link href="/on/demandware.static/x.css">'), "salesforce");
  assert.equal(detectPlatform(NO_SHOP_PAGE), "unknown");
});

test("Shopify ürün JSON adresi ve ayrıştırma", () => {
  assert.equal(shopifyProductJsonUrl("https://ember.com/products/ember-tumbler-2"), "https://ember.com/products/ember-tumbler-2.json");
  assert.equal(shopifyProductJsonUrl("https://x.com/en-us/products/a-b?variant=1"), "https://x.com/en-us/products/a-b.json");
  assert.equal(shopifyProductJsonUrl("https://x.com/collections/all/products/a"), "https://x.com/collections/all/products/a.json");
  assert.equal(shopifyProductJsonUrl("https://x.com/pages/about"), null);
  assert.deepEqual(parseShopifyProduct(shopifyJson(true, "T")), {
    id: null, title: "T", image: "https://cdn.shopify.com/p.jpg", requiresShipping: true, variantCount: 1, price: null, publishedAt: null, productType: null,
  });
  assert.equal(parseShopifyProduct("<html>"), null);
});

test("Sıfır fiyatlı Offer satın alma sayılmaz", () => {
  const s = pageSignals(ld({ "@type": "Product", name: "X", offers: { "@type": "Offer", price: "0" } }));
  assert.equal(s.offer, null);
  assert.equal(s.hasProductSchema, true);
});

test("Pazaryeri eşleştirme: marka + model gerekli", () => {
  const results = [
    { title: "Ember Mug 2 Temperature Control", url: "https://www.amazon.com/dp/1", content: "" },
    { title: "Remember this tumbler", url: "https://www.amazon.com/dp/2", content: "" },
    { title: "Ember Tumbler 16 oz", url: "https://ember.com/x", content: "" },
  ];
  // Model belirteçleri: "tumbler", "2". Hiçbir pazaryeri sonucu marka+model içermiyor.
  assert.equal(findMarketplaceListing(results, "ember.com", "Ember Tumbler 2"), null);
  const hit = findMarketplaceListing(
    [...results, { title: "Ember Tumbler 2, 16 oz Heated Travel", url: "https://www.trendyol.com/ember/p-1", content: "" }],
    "ember.com",
    "Ember Tumbler 2",
  );
  assert.equal(hit?.url, "https://www.trendyol.com/ember/p-1");
});

// ---- Faz C gerçek çalıştırmada bulunan hatalar için regresyon testleri ----

const SHOPIFY_HOME = '<html><link href="//cdn.shopify.com/x.css"><form action="/cart/add"></form></html>';
const CATALOG = JSON.stringify({ products: [
  { handle: "laptop-sleeve", title: "Laptop Sleeve 14", variants: [{ requires_shipping: true, available: true }], images: [] },
  { handle: "compact-edc-sling-bag", title: "Compact EDC Sling Bag 2L", variants: [{ requires_shipping: true, available: true }], images: [{ src: "https://cdn.shopify.com/sling.jpg" }] },
] });

test("Blog ana sayfaya link verdi: Shopify kataloğunda ürün bulunur → verified ve ürün sayfası düzeltilir", async () => {
  const d = deps({
    "https://www.tomtoc.com/": ok("https://www.tomtoc.com/", SHOPIFY_HOME),
    "https://www.tomtoc.com/products.json?limit=250": ok("https://www.tomtoc.com/products.json?limit=250", CATALOG),
  });
  const r = await verifyProduct({ brandDomain: "tomtoc.com", productUrl: "https://www.tomtoc.com/", productName: "Tomtoc Compact EDC Sling Bag" }, d);
  assert.equal(r.status, "verified", r.reason);
  assert.equal(r.productUrl, "https://www.tomtoc.com/products/compact-edc-sling-bag");
  assert.equal(r.name, "Compact EDC Sling Bag 2L");
  assert.match(r.reason, /kataloğunda satışta/);
});

test("Katalogda ürün yoksa → unverified (ana sayfadaki sepet formu sayılmaz)", async () => {
  const d = deps({
    "https://www.tomtoc.com/": ok("https://www.tomtoc.com/", SHOPIFY_HOME),
    "https://www.tomtoc.com/products.json?limit=250": ok("https://www.tomtoc.com/products.json?limit=250", CATALOG),
  });
  const r = await verifyProduct({ brandDomain: "tomtoc.com", productUrl: "https://www.tomtoc.com/", productName: "Tomtoc Hiking Backpack" }, d);
  assert.equal(r.status, "unverified");
  assert.match(r.reason, /kataloğunda bulunamadı/);
  assert.equal(d.searches.length, 0);
});

test("Katalog eşleştirme eşiği", () => {
  const catalog = parseShopifyCatalog(CATALOG);
  assert.equal(bestCatalogMatch(catalog, "tomtoc.com", "Tomtoc Compact EDC Sling Bag")?.handle, "compact-edc-sling-bag");
  assert.equal(bestCatalogMatch(catalog, "tomtoc.com", "Tomtoc Travel Bag"), null);
});

test("Facebook'taki sıradan paylaşım ilan sayılmaz, /marketplace/ ilanı sayılır", () => {
  const post = { title: "Meet TDM Neo Hybrid Headphones", url: "https://www.facebook.com/tdm.thebrand/posts/123", content: "" };
  assert.equal(findMarketplaceListing([post], "tdmofficial.com", "TDM Neo Hybrid Headphones"), null);
  const listing = { ...post, url: "https://www.facebook.com/marketplace/item/999/" };
  assert.equal(findMarketplaceListing([listing], "tdmofficial.com", "TDM Neo Hybrid Headphones")?.url, listing.url);
});

test("Fiyat priceSpecification içinde olabilir", () => {
  const s = pageSignals(ld({ "@type": "Product", name: "StickerPix", offers: { "@type": "Offer",
    priceSpecification: { "@type": "UnitPriceSpecification", price: 299.99, priceCurrency: "USD" } } }));
  assert.deepEqual(s.offer, { price: "299.99", currency: "USD", availability: null });
});

test("Site botlara 403 dönüyorsa kalıcı sonuç (her gün yeniden denenmez)", async () => {
  const d = deps({ "https://www.lego.com/p": { ok: false, url: "https://www.lego.com/p", reason: "HTTP 403", retryable: false } });
  const r = await verifyProduct({ brandDomain: "lego.com", productUrl: "https://www.lego.com/p", productName: "LEGO Set" }, d);
  assert.equal(r.status, "unverified");
  assert.equal(r.retryable, false);
});

test("Yanlış pozitifler: arama sayfası, markası yalnızca açıklamada geçen kopya ürün, farklı model", () => {
  const amazonSearch = { title: "Amazon.com: elevated craft shaker", url: "https://www.amazon.com/elevated-craft-shaker/s?k=elevated+craft+shaker", content: "" };
  assert.equal(findMarketplaceListing([amazonSearch], "elevatedcraft.com", "Elevated Craft Cocktail System"), null);

  const knockoff = { title: "Twist Bluetooth Headphones Speaker 2 in 1", url: "https://electronics.alibaba.com/product/twist-headphones", content: "Like TDM Neo hybrid headphones" };
  assert.equal(findMarketplaceListing([knockoff], "tdmofficial.com", "TDM Neo Hybrid Headphones"), null);

  const otherModel = { title: "Yashica Tank Compact Digital Camera (Black)", url: "https://www.bhphotovideo.com/c/product/1986487-REG/yashica_tank.html", content: "" };
  assert.equal(findMarketplaceListing([otherModel], "yashica.com", "YASHICA Crew Digital Camera"), null);
});

test("Markanın pazaryeri mağaza sayfası kanıt sayılır", () => {
  const store = { title: "Amazon.co.uk: Corkor", url: "https://www.amazon.co.uk/stores/Corkor/page/81A4DE89", content: "" };
  const m = findMarketplaceListing([store], "corkor.com", "Corkor Slim Cork Card Wallet");
  assert.equal(m?.url, store.url);
  assert.match(m!.why, /Amazon mağazası/);
});
