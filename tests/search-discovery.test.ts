import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateDomains, discoveryQueries, SEARCH_PRODUCTS, SEARCH_PRODUCTS_TR } from "../dtc/searchDiscovery.ts";

test("discoveryQueries: her ürün üç dilde, Türkçe ürünler üç niyetle; tekrar yok", () => {
  const q = discoveryQueries();
  assert.equal(q.length, SEARCH_PRODUCTS.length * 3 + SEARCH_PRODUCTS_TR.length * 3);
  assert.ok(q.includes("posture corrector buy online free shipping"));
  assert.ok(q.includes("boyun masaj aleti kapıda ödeme"));
  assert.equal(new Set(q).size, q.length);
});

test("candidateDomains: pazaryeri, sosyal ağ, büyük site ve devlet/eğitim siteleri atılır", () => {
  assert.deepEqual(
    candidateDomains([
      "https://www.getcosmora.com/products/galaxy",
      "https://shop.brasapro.com/",
      "https://www.amazon.de/dp/X",
      "https://www.trendyol.com/x",
      "https://en.wikipedia.org/wiki/Posture",
      "https://www.instagram.com/p/1",
      "https://www.nih.gov/x",
      "https://www.gelvessa.com/carsaf",
      "not a url",
    ]),
    ["getcosmora.com", "brasapro.com", "gelvessa.com"],
  );
});
