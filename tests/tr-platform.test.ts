import { test } from "node:test";
import assert from "node:assert/strict";
import { findStoreDomains, isCloudflareIp, platformFromCname } from "../lib/nrd.ts";
import { ldProduct, parseSitemap, productSitemaps, shopNameOf, titleFromPath } from "../dtc/trPlatform.ts";

test("platformFromCname ve isCloudflareIp: ikas / Ticimax imzaları", () => {
  assert.equal(platformFromCname(["eu1.myikas.com"]), "ikas");
  assert.equal(platformFromCname(["proxy.ticimax.cloud."]), "ticimax");
  assert.equal(platformFromCname(["shops.myshopify.com"]), null);
  assert.equal(isCloudflareIp("172.66.1.12"), true);
  assert.equal(isCloudflareIp("104.16.109.26"), true);
  assert.equal(isCloudflareIp("162.159.141.14"), true);
  assert.equal(isCloudflareIp("23.227.38.65"), false);
});

test("findStoreDomains: Shopify A kaydı; Cloudflare'deki alan adında www CNAME'i ikas/Ticimax", async () => {
  const a: Record<string, string[]> = { "s.com": ["23.227.38.65"], "ik.com": ["172.66.1.12"], "tc.com": ["104.16.109.26"], "cf.com": ["104.18.1.1"], "x.com": ["1.2.3.4"] };
  const c: Record<string, string[]> = { "www.ik.com": ["eu1.myikas.com"], "www.tc.com": ["proxy.ticimax.cloud"], "www.cf.com": ["foo.example.com"] };
  const found = await findStoreDomains(
    Object.keys(a),
    2,
    async (d) => a[d] ?? [],
    async (h) => c[h] ?? [],
  );
  assert.deepEqual(
    found.sort((x, y) => x.domain.localeCompare(y.domain)),
    [
      { domain: "ik.com", platform: "ikas" },
      { domain: "s.com", platform: "shopify" },
      { domain: "tc.com", platform: "ticimax" },
    ],
  );
});

test("parseSitemap: dizin ve ürün haritası (adres, son güncelleme, görsel)", () => {
  const index = parseSitemap(
    `<sitemapindex><sitemap><loc>https://www.x.com/pages.xml</loc></sitemap><sitemap><loc>https://www.x.com/products.xml</loc></sitemap><sitemap><loc>https://www.x.com/sitemap/products/0.xml</loc></sitemap></sitemapindex>`,
  );
  assert.deepEqual(productSitemaps(index.children), ["https://www.x.com/products.xml", "https://www.x.com/sitemap/products/0.xml"]);
  const urls = parseSitemap(
    `<urlset><url><loc>https://www.x.com/carsaf-sabitleyici</loc><lastmod>2026-10-01T10:00:00Z</lastmod><image:image><image:loc>https://cdn.myikas.com/a.webp</image:loc></image:image></url><url><loc>https://www.x.com/elbise-siyah-148386</loc></url></urlset>`,
  );
  assert.deepEqual(urls.entries, [
    { loc: "https://www.x.com/carsaf-sabitleyici", lastmod: "2026-10-01T10:00:00Z", image: "https://cdn.myikas.com/a.webp" },
    { loc: "https://www.x.com/elbise-siyah-148386", lastmod: null, image: null },
  ]);
  assert.equal(titleFromPath("/halter-yaka-kemerli-elbise-siyah-148386"), "Halter yaka kemerli elbise siyah");
  assert.equal(titleFromPath("/carsaf-sabitleyici"), "Carsaf sabitleyici");
});

test("ldProduct ve shopNameOf: JSON-LD ürün (fiyat, para birimi, stok) ve mağaza adı", () => {
  const html = `<title>Ana Sayfa | Gelvessa</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","name":"Gelvessa","url":"https://www.gelvessa.com"}</script>
    <script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","name":"Çarşaf Sabitleyici","image":["https://cdn.myikas.com/1.webp"],"offers":{"@type":"Offer","price":"299.90","priceCurrency":"try","availability":"https://schema.org/InStock"}}</script>`;
  assert.deepEqual(ldProduct(html), { name: "Çarşaf Sabitleyici", image: "https://cdn.myikas.com/1.webp", price: 299.9, currency: "try", inStock: true, description: null });
  assert.equal(shopNameOf(html), "Gelvessa");
  assert.equal(ldProduct("<html></html>"), null);
});
