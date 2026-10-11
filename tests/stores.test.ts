import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRdapRegistration } from "../dtc/rdap.ts";
import { aliImageId, hasDropshipSignal, nextCheck, parseStoreProducts, pickHero, probeStore, storeActivity, storeScore, type LiveStore } from "../dtc/storeProbe.ts";
import type { FetchResult } from "../lib/http.ts";
import { findShopifyDomains, parseDomainList, whoisdsUrl } from "../lib/nrd.ts";
import { storeAgeDays } from "../lib/stores.ts";

const ok = (url: string, text: string): FetchResult => ({ ok: true, status: 200, url, contentType: "application/json", text });
const NOW = Date.parse("2026-10-09T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

test("whoisdsUrl ve parseDomainList: uygun uzantılar, yorumlar ve IDN'ler", () => {
  assert.equal(whoisdsUrl("2026-10-08"), "https://www.whoisds.com/whois-database/newly-registered-domains/MjAyNi0xMC0wOC56aXA=/nrd");
  const list = "# Newly Registered Domains\nSootheCo.store\r\ngvjsj.top\nxn--bcher-kva.com\nsub.domain.shop\na.b.c.d.com\nlittlesnowglobe.com\n\n";
  assert.deepEqual(parseDomainList(list), ["sootheco.store", "sub.domain.shop", "littlesnowglobe.com"]);
});

test("findShopifyDomains: yalnızca 23.227.38.x'e çözülenler", async () => {
  const dns: Record<string, string[]> = { "a.com": ["23.227.38.65"], "b.com": ["104.21.3.4"], "c.shop": ["23.227.38.32", "1.1.1.1"] };
  const hits = await findShopifyDomains(["a.com", "b.com", "c.shop", "nx.com"], 2, async (d) => {
    if (!dns[d]) throw new Error("ENOTFOUND");
    return dns[d];
  });
  assert.deepEqual(hits.sort(), ["a.com", "c.shop"]);
});

const PRODUCTS = JSON.stringify({
  products: [
    {
      handle: "posture-corrector", title: "Posture Corrector Pro", product_type: "Health", created_at: "2026-09-20T10:00:00Z",
      body_html: "<p>Relieve pain fast.</p><p><strong>Shipping:</strong> 7-15 business days.</p>",
      images: [{ src: "https://cdn.shopify.com/a.jpg" }],
      variants: [
        { price: "29.99", compare_at_price: "59.99", requires_shipping: true, available: true },
        { price: "34.99", compare_at_price: "69.99", requires_shipping: true, available: false },
      ],
    },
    {
      handle: "gift-card", title: "Gift Card", created_at: "2026-09-18T10:00:00Z",
      variants: [{ price: "25.00", compare_at_price: null, requires_shipping: false, available: true }],
    },
    {
      handle: "neck-massager", title: "Neck Massager", created_at: "2026-09-25T10:00:00Z",
      variants: [{ price: "39.00", compare_at_price: "79.00", requires_shipping: true, available: true }],
    },
  ],
});

test("parseStoreProducts ve pickHero: ana sayfadaki ilk ürün, yoksa en yeni fiziksel ürün", () => {
  const products = parseStoreProducts(PRODUCTS)!;
  const { detail, ...first } = products[0];
  assert.deepEqual(detail?.variants.map((v) => [v.price, v.compareAt, v.available]), [[29.99, 59.99, true], [34.99, 69.99, false]]);
  assert.deepEqual(detail?.images, ["https://cdn.shopify.com/a.jpg"]);
  assert.deepEqual(first, {
    handle: "posture-corrector", title: "Posture Corrector Pro", image: "https://cdn.shopify.com/a.jpg", price: 29.99, compareAt: 69.99,
    createdAt: "2026-09-20T10:00:00Z", physical: true, productType: "Health", availableVariants: 1, totalVariants: 2, aliImageId: null, dropship: true, apparel: false,
    offer: { discountPct: 57, freeShipping: false, guaranteeDays: null, bundle: false },
  });
  assert.equal(products[1].physical, false);
  assert.equal(pickHero(products, '<a href="/collections/all/products/posture-corrector?variant=1">')?.handle, "posture-corrector");
  assert.equal(pickHero(products, '<a href="/products/gift-card">')?.handle, "neck-massager"); // dijital ürün atlanır
  assert.equal(pickHero(products, null)?.handle, "neck-massager");
  assert.equal(parseStoreProducts("<html>password</html>"), null);
});

test("probeStore: açık, şifreli, kapalı ve silinmiş mağaza", async () => {
  const B = "https://shop.example";
  const live = await probeStore("shop.example", async (u) =>
    u.endsWith("products.json?limit=250") ? ok(u, PRODUCTS)
    : u.endsWith("meta.json") ? ok(u, JSON.stringify({ id: 1, name: "Calm Neck", country: "US", currency: "USD", myshopify_domain: "x.myshopify.com", ships_to_countries: ["US", "TR"], published_products_count: 3 }))
    : ok(u, '<a href="/products/posture-corrector">'),
  );
  assert.equal(live.state, "live");
  if (live.state === "live") {
    assert.deepEqual(
      [live.productCount, live.physicalCount, live.discountedCount, live.minPrice, live.firstProductAt, live.shipsToTr, live.hero?.handle, live.availableVariants, live.totalVariants],
      [3, 2, 2, 25, "2026-09-18T10:00:00Z", true, "posture-corrector", 3, 4],
    );
  }
  assert.deepEqual(await probeStore("shop.example", async () => ok(`${B}/password`, "<html>")), { state: "closed", why: "Şifreli (henüz açılmamış)" });
  assert.equal((await probeStore("shop.example", async (u) => ({ ok: false, url: u, reason: "HTTP 402", retryable: false }))).state, "closed");
  assert.equal((await probeStore("shop.example", async (u) => ({ ok: false, url: u, reason: "HTTP 404", retryable: false }))).state, "dead");
  assert.equal((await probeStore("shop.example", async (u) => ({ ok: false, url: u, reason: "HTTP 429", retryable: true }))).state, "error");
  // robots.txt kalıcı yasak → kapanmış sayılır; geçici okunamaması (Shopify 429) → hata, ertesi gün yeniden denenir.
  assert.equal((await probeStore("shop.example", async (u) => ({ ok: false, url: u, reason: "robots.txt izin vermiyor", retryable: false }))).state, "dead");
  assert.equal(
    (await probeStore("shop.example", async (u) => ({ ok: false, url: u, reason: "robots.txt geçici olarak okunamadı (HTTP 429)", retryable: true }))).state,
    "error",
  );
  assert.deepEqual(await probeStore("shop.example", async (u) => ok(u, '{"products":[]}')), { state: "closed", why: "Boş mağaza" });
});

const store = (over: Partial<LiveStore> = {}): LiveStore => ({
  state: "live", products: parseStoreProducts(PRODUCTS)!, productCount: 3, physicalCount: 2, discountedCount: 2, dropshipCount: 1, apparelCount: 0, aliImageCount: 0, minPrice: 25, maxPrice: 39,
  firstProductAt: daysAgo(20), lastProductAt: daysAgo(5), availableVariants: 3, totalVariants: 4, shopName: "Calm Neck", country: "US",
  currency: "USD", shipsToTr: true, hero: parseStoreProducts(PRODUCTS)![0], ...over,
});

test("storeActivity ve storeScore", () => {
  assert.deepEqual(storeActivity(null, store()), { productGrowth: 0, soldOut: 0 });
  assert.deepEqual(storeActivity({ product_count: 2, available_variants: 4, total_variants: 4 }, store()), { productGrowth: 1, soldOut: 1 });
  // odak 21 (3 ürün) + yenilik 15 (20 gün) + dropship 10 (1/3) + indirim 10 (2/3) + fiyat 10 (29,99) + hareket 0
  assert.equal(storeScore(store(), { productGrowth: 0, soldOut: 0 }, NOW), 66);
  assert.equal(storeScore(store(), { productGrowth: 1, soldOut: 2 }, NOW), 86);
  assert.equal(storeScore(store({ dropshipCount: 2 }), { productGrowth: 0, soldOut: 0 }, NOW), 76);
  assert.equal(storeScore(store({ apparelCount: 2 }), { productGrowth: 0, soldOut: 0 }, NOW), 46);
  assert.equal(storeScore(store({ firstProductAt: daysAgo(200) }), { productGrowth: 0, soldOut: 0 }, NOW), 51);
  assert.equal(storeScore(store({ physicalCount: 0 }), { productGrowth: 0, soldOut: 0 }, NOW), 0);
});

test("nextCheck: kontrol takvimi", () => {
  assert.deepEqual(nextCheck("live", 40, NOW), { status: "live", next: daysAgo(-7) });
  assert.equal(nextCheck("live", 160, NOW).status, "old");
  assert.deepEqual(nextCheck("closed", 10, NOW), { status: "closed", next: daysAgo(-14) });
  assert.equal(nextCheck("closed", 95, NOW).status, "dead");
  assert.equal(nextCheck("dead", 1, NOW).status, "dead");
  assert.deepEqual(nextCheck("error", 1, NOW), { status: "pending", next: daysAgo(-1) });
  // Puanı yüksek açık mağaza ertesi gün yeniden kontrol edilir (20 saat sonra = sonraki günlük çalıştırma).
  assert.deepEqual(nextCheck("live", 40, NOW, 60), { status: "live", next: new Date(NOW + 20 * 3_600_000).toISOString() });
  assert.equal(nextCheck("live", 40, NOW, 54).next, daysAgo(-7));
});

test("aliImageId: AliExpress görsel kimliği Shopify dosya adında korunur → dropship işareti", () => {
  assert.equal(aliImageId("https://cdn.shopify.com/s/files/1/0744/7933/7603/files/S4f799d2afe244d7189aaf61e0b2036edi.avif?v=1787638130"), "S4f799d2afe244d7189aaf61e0b2036edi");
  assert.equal(aliImageId("https://cdn.shopify.com/s/files/1/files/Hb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e.jpg"), null); // 31 onaltılık, harf yok
  assert.equal(aliImageId("https://cdn.shopify.com/s/files/1/files/Hb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6k_3f2a1b-uuid.jpg"), "Hb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6k");
  assert.equal(aliImageId("https://cdn.shopify.com/s/files/1/files/sneaker-brown.jpg"), null);
  assert.equal(aliImageId(null), null);
  const json = JSON.stringify({ products: [{ handle: "box", title: "UV Box", body_html: "<p>Clean</p>", variants: [{ price: "39", requires_shipping: true, available: true }], images: [{ src: "https://cdn.shopify.com/files/S4f799d2afe244d7189aaf61e0b2036edi.avif" }] }] });
  const [p] = parseStoreProducts(json)!;
  assert.equal(p.aliImageId, "S4f799d2afe244d7189aaf61e0b2036edi");
  assert.equal(p.dropship, true);
});

test("storeAgeDays ve RDAP kayıt tarihi", () => {
  assert.equal(Math.floor(storeAgeDays({ registered_on: "2026-09-09", discovered_at: daysAgo(1), first_product_at: daysAgo(10) }, NOW)), 30);
  assert.equal(
    parseRdapRegistration(JSON.stringify({ events: [{ eventAction: "expiration", eventDate: "2027-05-01T00:00:00Z" }, { eventAction: "registration", eventDate: "2026-05-01T08:12:00Z" }] })),
    "2026-05-01",
  );
  assert.equal(parseRdapRegistration("not json"), null);
});

test("hasDropshipSignal: uzun teslimat aralığı ya da dünya geneli gönderim", () => {
  assert.equal(hasDropshipSignal("<p>Delivery: 10-20 working days</p>"), true);
  assert.equal(hasDropshipSignal("Free Worldwide Shipping on all orders"), true);
  assert.equal(hasDropshipSignal("Ships in 1-3 business days from our Austin warehouse"), false);
  assert.equal(hasDropshipSignal("Made in Portugal from natural cork"), false);
});
