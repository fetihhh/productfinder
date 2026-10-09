import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyProduct, type VerifyDeps } from "../dtc/verify.ts";
import { countryFromTld, pageSignals, parseShopifyMeta, parseYotpoBottomline } from "../dtc/signals.ts";
import { findBrandListing, type SearchOutcome } from "../dtc/marketplaceSearch.ts";
import type { FetchResult } from "../lib/http.ts";

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const ok = (url: string, text: string): FetchResult => ({ ok: true, status: 200, url, contentType: "text/html", text });
const NOW = Date.parse("2026-10-09T12:00:00Z");

const PAGE = `<html><head><link href="//cdn.shopify.com/x.css">
<meta property="og:site_name" content="Nocs Provisions">
<script src="https://cdn-widgetsrepository.yotpo.com/v1/loader/ABCDEFGHIJKLMNOPQRSTUVWX" async></script>
</head><body><form action="/cart/add"></form></body></html>`;
const PRODUCT = JSON.stringify({
  product: {
    id: 4242, title: "Portal AFN7", published_at: "2026-09-01T00:00:00Z", image: { src: "https://cdn.shopify.com/p.jpg" },
    variants: [{ requires_shipping: true, price: "149.00" }, { requires_shipping: true, price: "129.00" }],
  },
});
const META = JSON.stringify({
  id: 1, name: "Nocs Provisions®", city: "Olympic Valley", country: "US", currency: "USD",
  myshopify_domain: "nocs.myshopify.com", ships_to_countries: ["US", "DE", "TR"], published_products_count: 38,
});
const YOTPO = JSON.stringify({ status: { code: 200 }, response: { bottomline: { average_score: 4.7, total_reviews: 312 } } });

const BASE = "https://www.nocsprovisions.com";
const pages: Record<string, FetchResult> = {
  [`${BASE}/products/portal`]: ok(`${BASE}/products/portal`, PAGE),
  [`${BASE}/products/portal.json`]: ok(`${BASE}/products/portal.json`, PRODUCT),
  [`${BASE}/meta.json`]: ok(`${BASE}/meta.json`, META),
  ["https://api-cdn.yotpo.com/products/ABCDEFGHIJKLMNOPQRSTUVWX/4242/bottomline"]: ok("y", YOTPO),
};

function deps(results: (q: string) => SearchOutcome): VerifyDeps & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    now: NOW,
    fetchPage: async (url) => pages[url] ?? { ok: false, url, reason: "HTTP 404", retryable: false },
    searchMarketplaces: async (q) => (queries.push(q), results(q)),
  };
}
const empty = (): SearchOutcome => ({ ok: true, results: [] });
const input = { brandDomain: "nocsprovisions.com", productUrl: `${BASE}/products/portal`, productName: "Nocs Provisions Portal AFN7" };

test("Ülke, Türkiye'ye satış, fiyat, yorum ve çıkış tarihi toplanır", async () => {
  const r = await verifyProduct(input, deps(empty));
  assert.equal(r.status, "verified", r.reason);
  assert.deepEqual(r.store, { brandName: "Nocs Provisions", country: "US", city: "Olympic Valley", shipsToTr: true, productCount: 38 });
  assert.equal(r.sales.price, 129);
  assert.equal(r.sales.currency, "USD");
  assert.equal(r.sales.reviewCount, 312);
  assert.equal(r.sales.rating, 4.7);
  assert.equal(r.sales.reviewSource, "Yotpo");
  assert.equal(r.sales.launchedAt, "2026-09-01T00:00:00Z");
  assert.equal(r.sales.variantCount, 2);
});

test("Katı mod: ürün temiz ama marka Amazon'da satıyor → rejected_marketplace, marka 'found'", async () => {
  const d = deps((q) =>
    q.startsWith('"')
      ? { ok: true, results: [{ title: "Nocs Provisions Zoom Tube 8x32 Monocular", url: "https://www.amazon.com/dp/B07X", content: "" }] }
      : empty(),
  );
  const r = await verifyProduct(input, d);
  assert.equal(r.status, "rejected_marketplace");
  assert.match(r.reason, /Marka Amazon'da satıyor/);
  assert.equal(r.brandCheck?.status, "found");
  assert.deepEqual(d.queries, ["Nocs Provisions Portal AFN7", '"Nocs Provisions"']);
});

test("Önbellekte 'found' olan marka ağa çıkmadan elenir", async () => {
  const d = deps(empty);
  let fetched = 0;
  const r = await verifyProduct(
    { ...input, brand: { marketplaceStatus: "found", marketplaceEvidence: "Amazon mağazası", marketplaceCheckedAt: "2026-10-01T00:00:00Z" } },
    { ...d, fetchPage: async (u) => (fetched++, d.fetchPage(u)) },
  );
  assert.equal(r.status, "rejected_marketplace");
  assert.equal(fetched, 0);
  assert.equal(d.queries.length, 0);
});

test("Taze 'clean' marka için yalnızca ürün araması yapılır; bayat kayıt yeniden aranır", async () => {
  const fresh = deps(empty);
  await verifyProduct({ ...input, brand: { marketplaceStatus: "clean", marketplaceEvidence: null, marketplaceCheckedAt: "2026-10-01T00:00:00Z" } }, fresh);
  assert.equal(fresh.queries.length, 1);
  const stale = deps(empty);
  await verifyProduct({ ...input, brand: { marketplaceStatus: "clean", marketplaceEvidence: null, marketplaceCheckedAt: "2026-08-01T00:00:00Z" } }, stale);
  assert.equal(stale.queries.length, 2);
});

test("Marka eşleştirme: tam ifade veya birleşik alan adı; arama sayfası ve alakasız başlık sayılmaz", () => {
  const r = (title: string, url: string) => findBrandListing([{ title, url, content: "" }], "Ember", "ember.com");
  assert.ok(r("Ember Temperature Control Smart Mug 2", "https://www.walmart.com/ip/1"));
  assert.equal(r("Ember Temperature Control Smart Mug 2", "https://www.amazon.com/s?k=ember"), null);
  assert.equal(r("Remember Me Candle", "https://www.amazon.com/dp/2"), null);
  const store = findBrandListing(
    [{ title: "Amazon.com: NocsProvisions", url: "https://www.amazon.com/stores/NocsProvisions/page/1", content: "" }],
    "Nocs",
    "nocsprovisions.com",
  );
  assert.match(store!.why, /mağazası/);
});

test("Yorum kaynakları: schema.org AggregateRating ve Judge.me rozeti", () => {
  const a = pageSignals(ld({ "@type": "Product", name: "X", aggregateRating: { "@type": "AggregateRating", ratingValue: "4.6", reviewCount: "87" } }));
  assert.deepEqual(a.rating, { count: 87, value: 4.6, source: "schema.org" });
  const j = pageSignals(`<div class="jdgm-widget jdgm-prev-badge" data-average-rating="4.90" data-number-of-reviews="1204"></div>`);
  assert.deepEqual(j.rating, { count: 1204, value: 4.9, source: "Judge.me" });
  assert.deepEqual(parseYotpoBottomline(YOTPO), { count: 312, value: 4.7, source: "Yotpo" });
});

test("Shopify meta.json ve alan adı uzantısından ülke", () => {
  assert.deepEqual(parseShopifyMeta(META), {
    name: "Nocs Provisions", country: "US", city: "Olympic Valley", shipsTo: ["US", "DE", "TR"], productCount: 38, currency: "USD",
  });
  assert.equal(parseShopifyMeta("<html>"), null);
  assert.equal(countryFromTld("ch"), "CH");
  assert.equal(countryFromTld("co.uk"), "GB");
  assert.equal(countryFromTld("com.tr"), "TR");
  assert.equal(countryFromTld("com"), null);
  assert.equal(countryFromTld("co"), null);
  assert.equal(countryFromTld("io"), null);
});

test("Marka yanlış pozitifleri: kısa ad başka ürünün model kodu, Etsy /market/ araması, kariyer alt alanı", () => {
  const tdm = findBrandListing(
    [{ title: "Explore Scientific TDM Telescope Drive Master Encoder Only", url: "https://www.adorama.com/es0721001.html", content: "" }],
    "TDM.",
    "tdmofficial.com",
    "TDM Neo Hybrid Headphones",
  );
  assert.equal(tdm, null);
  const tdmReal = findBrandListing(
    [{ title: "TDM Neo Hybrid Headphones Speaker", url: "https://www.adorama.com/tdmneo.html", content: "" }],
    "TDM.",
    "tdmofficial.com",
    "TDM Neo Hybrid Headphones",
  );
  assert.ok(tdmReal);
  const etsy = findBrandListing([{ title: "Rare Vintage Timex - Etsy", url: "https://www.etsy.com/market/rare_vintage_timex", content: "" }], "Timex", "timex.com");
  assert.equal(etsy, null);
  const careers = findBrandListing([{ title: "Timex jobs at Staples", url: "https://careers.staples.com/en/x", content: "" }], "Timex", "timex.com");
  assert.equal(careers, null);
});
