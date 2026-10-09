import { test } from "node:test";
import assert from "node:assert/strict";
import { directQuery, directSearch, parseAliExpress, parseAmazon, parseOtto, type DirectSite } from "../dtc/directSearch.ts";
import { findBrandListing, findMarketplaceListing, isThirdPartyAccessory, type SearchOutcome } from "../dtc/marketplaceSearch.ts";
import { verifyProduct, WIDE_PENDING, type VerifyDeps } from "../dtc/verify.ts";
import type { FetchResult } from "../lib/http.ts";

const ok = (url: string, text: string): FetchResult => ({ ok: true, status: 200, url, contentType: "text/html", text });

const AMAZON = `<div class="s-main-slot">
<div role="listitem" data-asin="B0FL7B6G8F" data-index="2" data-component-type="s-search-result" class="s-result-item">
  <div><h2 class="a-size-mini"><span>mibro</span></h2><a href="/mibro-GS-Explorer/dp/B0FL7B6G8F"><h2 aria-label="x"><span>GS Explorer S Titanium Outdoor GPS Smartwatch</span></h2></a></div>
</div>
<div role="listitem" data-asin="B0ABCDEFGH" data-index="3" data-component-type="s-search-result">
  <h2><span>Wanme</span></h2><h2><span>Band Compatible with Mibro GS Explorer S, Silicone Strap</span></h2>
</div>
<div data-asin="" data-component-type="s-search-result"><h2>Boş</h2></div>
</div>`;

const ALI = `{"itemList":{"content":[{"redirectedId":"1","itemType":"productV3","productId":"1005009945027623","image":{"imgUrl":"//x.jpg"},"title":{"displayTitle":"PC saat k\\u0131l\\u0131f\\u0131 Mibro GS i\\u00e7i bo\\u015f koruyucu k\\u0131l\\u0131f"},"prices":{}},
{"itemType":"productV3","productId":"1005007556064024","title":{"displayTitle":"Mibro GS Explorer S Smart Watch AMOLED GPS"}}]}}`;

const OTTO = `<article data-qa="reptile-product-tile"><a href="/p/shop-n-smile-ring-S00J10FQ/" aria-label="shop&#39;n smile Smart Ring &amp; Tracker" data-link-type="tile"></a></article>
<article><a href="/p/mibro-gs-explorer-s-S01/" aria-label="Mibro GS Explorer S Smartwatch" data-link-type="tile"></a></article>`;

test("parseAmazon: marka satırı + ürün adı başlıkta birleşir, ASIN'den ilan adresi", () => {
  const r = parseAmazon(AMAZON);
  assert.deepEqual(r.map((x) => [x.title, x.url]), [
    ["mibro GS Explorer S Titanium Outdoor GPS Smartwatch", "https://www.amazon.com/dp/B0FL7B6G8F"],
    ["Wanme Band Compatible with Mibro GS Explorer S, Silicone Strap", "https://www.amazon.com/dp/B0ABCDEFGH"],
  ]);
});

test("parseAliExpress ve parseOtto", () => {
  const ali = parseAliExpress(ALI);
  assert.equal(ali.length, 2);
  assert.equal(ali[0].title, "PC saat kılıfı Mibro GS içi boş koruyucu kılıf");
  assert.equal(ali[1].url, "https://www.aliexpress.com/item/1005007556064024.html");
  const otto = parseOtto(OTTO);
  assert.deepEqual(otto.map((x) => x.title), ["shop'n smile Smart Ring & Tracker", "Mibro GS Explorer S Smartwatch"]);
  assert.equal(otto[1].url, "https://www.otto.de/p/mibro-gs-explorer-s-S01/");
});

test("isThirdPartyAccessory: başka satıcının aksesuarı markanın ürünü sayılmaz", () => {
  const b = ["mibro"];
  assert.equal(isThirdPartyAccessory("PC saat kılıfı Mibro GS içi boş", b), true);
  assert.equal(isThirdPartyAccessory("Case for Mibro GS Explorer", b), true);
  assert.equal(isThirdPartyAccessory("Wanme Band Compatible with Mibro GS Explorer S", b), true);
  assert.equal(isThirdPartyAccessory("mibro GS Explorer S Titanium Smartwatch", b), false);
  assert.equal(isThirdPartyAccessory("Mibro Watch Strap 22mm", b), false);
});

test("Eşleştirme: aksesuarlar atlanır, markanın kendi ilanı bulunur", () => {
  const amazon = parseAmazon(AMAZON);
  assert.equal(findMarketplaceListing(amazon, "mibrofit.com", "Mibro GS Explorer S")?.url, "https://www.amazon.com/dp/B0FL7B6G8F");
  assert.equal(findMarketplaceListing([amazon[1]], "mibrofit.com", "Mibro GS Explorer S"), null);
  assert.equal(findMarketplaceListing(parseAliExpress(ALI).slice(0, 1), "mibrofit.com", "Mibro GS Explorer S"), null);
  assert.equal(findBrandListing([amazon[1]], "Mibro", "mibrofit.com", "Mibro GS Explorer S"), null);
  assert.ok(findBrandListing(amazon, "Mibro", "mibrofit.com", "Mibro GS Explorer S"));
});

test("directQuery: marka adı yoksa eklenir", () => {
  assert.equal(directQuery("Mibro", "Mibro GS Explorer S"), "Mibro GS Explorer S");
  assert.equal(directQuery("Nocs Provisions", "Portal AFN7"), "Nocs Provisions Portal AFN7");
  assert.equal(directQuery("TDM.", ""), "TDM.");
});

const site = (name: string, required: boolean, html: string | null): DirectSite => ({
  name,
  required,
  searchUrl: (q) => `https://${name}/s?q=${encodeURIComponent(q)}`,
  parse: (h) => (h.includes("ITEM") ? [{ title: `Acme ${name} item`, url: `https://${name}/p/1`, content: "" }] : []),
});

test("directSearch: zorunlu site okunamazsa sonuç eksik; bot sayfası atlatılmaz", async () => {
  const pages: Record<string, FetchResult> = {
    a: { ok: false, url: "a", reason: "HTTP 503", retryable: true },
    b: ok("b", "<html>ITEM</html>"),
    c: ok("c", "<form action='/errors/validateCaptcha'></form>"),
  };
  const search = directSearch(async (u) => pages[new URL(u).hostname], [site("a", true, null), site("b", false, null), site("c", false, null)]);
  const out = await search("acme");
  assert.ok(out.ok);
  assert.equal(out.incomplete, true);
  assert.deepEqual(out.checked, ["b"]);
  assert.deepEqual(out.failed, ["a (HTTP 503)", "c (bot doğrulama sayfası)"]);
  assert.equal(out.results.length, 1);
});

// ---- Doğrulama akışı ----

const BASE = "https://shop.acmewidgets.com";
const PAGE = `<html><head><link href="//cdn.shopify.com/x.css"><meta property="og:site_name" content="Acme Widgets"></head>
<body><form action="/cart/add"></form></body></html>`;
const PRODUCT = JSON.stringify({ product: { id: 9, title: "Acme Widgets Lumen Lamp", variants: [{ requires_shipping: true, price: "79.00" }] } });
const pages: Record<string, FetchResult> = {
  [`${BASE}/products/lumen`]: ok(`${BASE}/products/lumen`, PAGE),
  [`${BASE}/products/lumen.json`]: ok("j", PRODUCT),
};
const input = { brandDomain: "acmewidgets.com", productUrl: `${BASE}/products/lumen`, productName: "Acme Widgets Lumen Lamp" };
const clean = (incomplete = false) => async (): Promise<SearchOutcome> => ({ ok: true, results: [], incomplete, checked: ["Amazon.com"], failed: [] });

function deps(direct: VerifyDeps["directSearch"], wide: VerifyDeps["searchMarketplaces"]): VerifyDeps {
  return { fetchPage: async (u) => pages[u] ?? { ok: false, url: u, reason: "HTTP 404", retryable: false }, searchMarketplaces: wide, directSearch: direct, now: Date.parse("2026-10-09T12:00:00Z") };
}

test("Doğrudan aramada Amazon ilanı → Tavily'ye hiç gitmeden elenir", async () => {
  let wideCalls = 0;
  const direct = async (): Promise<SearchOutcome> => ({
    ok: true,
    results: [{ title: "Acme Widgets Lumen Lamp, Dimmable", url: "https://www.amazon.com/dp/B000000001", content: "" }],
  });
  const r = await verifyProduct(input, deps(direct, async () => (wideCalls++, { ok: true, results: [] })));
  assert.equal(r.status, "rejected_marketplace");
  assert.match(r.reason, /doğrudan arama/);
  assert.equal(r.brandCheck?.status, "found");
  assert.equal(wideCalls, 0);
});

test("Tavily kotası doluyken doğrudan kontrol tamsa → kısmi doğrulama (ertesi gün yeniden denenir)", async () => {
  const r = await verifyProduct(input, deps(clean(), null));
  assert.equal(r.status, "verified");
  assert.equal(r.retryable, true);
  assert.match(r.reason, new RegExp(WIDE_PENDING.slice(0, 20)));
  assert.equal(r.brandCheck, null);
});

test("Amazon okunamadıysa ve Tavily kotası doluysa → doğrulanmadı", async () => {
  const r = await verifyProduct(input, deps(clean(true), null));
  assert.equal(r.status, "unverified");
  assert.equal(r.retryable, true);
});

test("Doğrudan arama temiz + Tavily temiz → tam doğrulama ve marka 'clean'", async () => {
  const r = await verifyProduct(input, deps(clean(), async () => ({ ok: true, results: [] })));
  assert.equal(r.status, "verified");
  assert.equal(r.retryable, false);
  assert.equal(r.brandCheck?.status, "clean");
  assert.match(r.reason, /Doğrudan arama: Amazon\.com temiz/);
});
