import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDomain, marketplaceSearchDomains, registrableDomain } from "../lib/domain.ts";

test("registrableDomain eTLD+1 döndürür", () => {
  assert.equal(registrableDomain("https://www.allbirds.com/products/x?y=1"), "allbirds.com");
  assert.equal(registrableDomain("shop.brand.co.uk"), "brand.co.uk");
  assert.equal(registrableDomain("https://smile.amazon.com.tr/dp/1"), "amazon.com.tr");
  assert.equal(registrableDomain("http://127.0.0.1"), null);
  assert.equal(registrableDomain("localhost"), null);
});

test("DTC alan adları kabul edilir", () => {
  for (const d of ["https://www.allbirds.com", "ridge.com", "https://bellroy.com/products/x", "brand.com.tr"]) {
    const v = classifyDomain(d);
    assert.equal(v.ok, true, `${d} kabul edilmeliydi`);
  }
});

test("Pazaryeri alan adları ve alt alanları reddedilir", () => {
  const cases: [string, string][] = [
    ["https://www.amazon.com.tr/dp/B0", "Amazon"],
    ["trendyol.com", "Trendyol"],
    ["https://shop.ebay.de/item/1", "eBay"],
    ["brandname.etsy.com", "Etsy"],
    ["https://www.hepsiburada.com/x", "Hepsiburada"],
    ["shop.tiktok.com", "TikTok Shop"],
    ["https://www.facebook.com/marketplace/item/1", "Facebook Marketplace"],
    ["mercadolivre.com.br", "Mercado Libre"],
    ["https://amzn.to/3abc", "Amazon"],
    ["https://link.amazon/xyz", "Amazon"],
    ["https://www.bestbuy.com/site/x", "Best Buy"],
  ];
  for (const [input, name] of cases) {
    const v = classifyDomain(input);
    assert.equal(v.ok, false, `${input} reddedilmeliydi`);
    if (!v.ok) {
      assert.equal(v.kind, "marketplace");
      assert.match(v.reason, new RegExp(name));
    }
  }
});

test("Kendi alan adı olmayan barındırma adresleri reddedilir", () => {
  for (const d of ["brand.myshopify.com", "https://instagram.com/brand", "brand.wixsite.com"]) {
    const v = classifyDomain(d);
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.kind, "not_own_domain");
  }
});

test("Marka adında pazaryeri adı geçmesi tek başına reddettirmez", () => {
  assert.equal(classifyDomain("amazonite-jewelry.com").ok, true);
  assert.equal(classifyDomain("wishbone-design.co").ok, true);
});

test("Pazaryeri arama alan adları boş değil ve tekrarsız", () => {
  const domains = marketplaceSearchDomains();
  assert.ok(domains.length >= 20);
  assert.equal(new Set(domains).size, domains.length);
});
