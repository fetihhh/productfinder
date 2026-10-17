import assert from "node:assert/strict";
import { test } from "node:test";
import { inventoryFromHtml, parseShopifyJs, shopifyJsUrl, stockEvents } from "../dtc/stock.ts";

test("shopifyJsUrl: dil ve koleksiyon önekleri korunur, ürün dışı adres null", () => {
  assert.equal(shopifyJsUrl("https://x.com/products/lamp?variant=1"), "https://x.com/products/lamp.js");
  assert.equal(shopifyJsUrl("https://x.com/de/collections/all/products/lamp"), "https://x.com/de/collections/all/products/lamp.js");
  assert.equal(shopifyJsUrl("https://x.com/pages/about"), null);
  assert.equal(shopifyJsUrl("bozuk"), null);
});

test("parseShopifyJs: kuruş → birim, indirim öncesi fiyat yalnızca fiyattan büyükse", () => {
  const p = parseShopifyJs(JSON.stringify({ id: 1, variants: [{ available: true, price: 1999, compare_at_price: 1999 }] }))!;
  assert.equal(p.price, 19.99);
  assert.equal(p.compareAt, null);
  assert.equal(p.tracked, false);
  assert.equal(parseShopifyJs("<html>"), null);
});

test("inventoryFromHtml: JSON adetleri yalnızca varyant sayısı tutarsa, Dawn stok bildirimi", () => {
  const json = `{"variants":[{"inventory_quantity":3},{"inventory_quantity":-2}]}`;
  assert.equal(inventoryFromHtml(json, 2), 3);
  assert.equal(inventoryFromHtml(json, 3), null); // önerilen ürünlerin adetleri karışmış olabilir
  assert.equal(inventoryFromHtml(`<div class="product__inventory"><span>12 in stock</span></div>`, 1), 12);
  assert.equal(inventoryFromHtml(`<div class="urgency">Only 7 left!</div>`, 1), null); // uygulama sayacı okunmaz
});

test("stockEvents: tükenen/yeniden gelen varyant, azalan adet, fiyat değişimi", () => {
  const m = (price: number | null, a: number | null, v: number | null, inv: number | null) => ({ price, variantsAvailable: a, variantsTotal: v, inventory: inv });
  assert.deepEqual(stockEvents(null, m(10, 3, 3, 5)), { soldOut: 0, restocked: 0, unitsSold: 0, priceChanged: false });
  assert.deepEqual(stockEvents(m(10, 3, 3, 9), m(8, 1, 3, 4)), { soldOut: 2, restocked: 0, unitsSold: 5, priceChanged: true });
  assert.deepEqual(stockEvents(m(10, 1, 3, 4), m(10, 3, 3, 20)), { soldOut: 0, restocked: 2, unitsSold: 0, priceChanged: false });
  // Varyant yapısı değiştiyse stok farkı sayılmaz.
  assert.equal(stockEvents(m(10, 3, 3, null), m(10, 1, 4, null)).soldOut, 0);
});
