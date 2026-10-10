import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { closestDistance, dHash, hamming, imageHasher, productImageUrls, thumbnailUrl } from "../dtc/imageHash.ts";
import { findSuppliers, isImageMatch } from "../dtc/suppliers.ts";
import { IMAGE_MATCH_MAX } from "../config/limits.ts";
import type { FetchResult } from "../lib/http.ts";
import { supplierEconomics } from "../lib/winner.ts";

const svg = (shapes: string, size = 300) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 300 300"><rect width="300" height="300" fill="#f4f4f4"/>${shapes}</svg>`);
const LAMP = '<circle cx="150" cy="110" r="70" fill="#e0a020"/><rect x="135" y="170" width="30" height="90" fill="#333"/><rect x="90" y="255" width="120" height="20" fill="#555"/>';
const BOTTLE = '<rect x="110" y="40" width="80" height="230" rx="30" fill="#2060c0"/><rect x="130" y="15" width="40" height="40" fill="#111"/>';

test("dHash: aynı fotoğraf farklı boyut/sıkıştırma/kenar boşluğuyla eşleşir, farklı ürün eşleşmez", async () => {
  const original = await sharp(svg(LAMP)).png().toBuffer();
  const big = await sharp(svg(LAMP, 800)).jpeg({ quality: 55 }).toBuffer();
  const padded = await sharp(svg(LAMP)).extend({ top: 120, bottom: 120, left: 60, right: 60, background: "#ffffff" }).webp().toBuffer();
  const other = await sharp(svg(BOTTLE)).png().toBuffer();

  const [a, b, c, d] = await Promise.all([dHash(original), dHash(big), dHash(padded), dHash(other)]);
  assert.ok(a !== null && b !== null && c !== null && d !== null);
  assert.ok(hamming(a, b) <= IMAGE_MATCH_MAX, `boyut/sıkıştırma farkı ${hamming(a, b)}`);
  assert.ok(hamming(a, c) <= IMAGE_MATCH_MAX, `kenar boşluğu farkı ${hamming(a, c)}`);
  assert.ok(hamming(a, d) > IMAGE_MATCH_MAX, `farklı ürün farkı ${hamming(a, d)}`);
  assert.equal(closestDistance([d, a], b), hamming(a, b));
  assert.equal(closestDistance([a], null), null);
  assert.equal(await dHash(new Uint8Array([1, 2, 3, 4])), null);
});

test("imageHasher: aynı görsel bir kez indirilir; Shopify görselleri küçük boyutta istenir", async () => {
  const png = await sharp(svg(LAMP)).png().toBuffer();
  const asked: string[] = [];
  const hash = imageHasher(async (url) => {
    asked.push(url);
    return { ok: true, bytes: new Uint8Array(png) };
  });
  const [x, y] = await Promise.all([hash("https://cdn.shopify.com/s/files/1/lamp.jpg?v=1"), hash("https://cdn.shopify.com/s/files/1/lamp.jpg?v=1")]);
  assert.equal(x, y);
  assert.deepEqual(asked, ["https://cdn.shopify.com/s/files/1/lamp.jpg?v=1&width=300"]);
  assert.equal(thumbnailUrl("https://ae01.alicdn.com/kf/S1.jpg"), "https://ae01.alicdn.com/kf/S1.jpg");
  assert.equal(await hash(null), null);
});

test("productImageUrls: ana görsel + Shopify ürününün ilk 4 görseli, tekrarlar atılır", async () => {
  const asked: string[] = [];
  const urls = await productImageUrls("https://cdn.shopify.com/a.jpg?v=1", "https://shop.com/products/lamp?variant=9", async (url) => {
    asked.push(url);
    return { ok: true, text: JSON.stringify({ images: ["//cdn.shopify.com/a.jpg?v=1", "//cdn.shopify.com/b.jpg", "//cdn.shopify.com/c.jpg", "//cdn.shopify.com/d.jpg", "//cdn.shopify.com/e.jpg"] }) };
  });
  assert.deepEqual(asked, ["https://shop.com/products/lamp.js"]);
  assert.deepEqual(urls, ["https://cdn.shopify.com/a.jpg?v=1", "https://cdn.shopify.com/b.jpg", "https://cdn.shopify.com/c.jpg", "https://cdn.shopify.com/d.jpg"]);
  assert.deepEqual(await productImageUrls(null, "https://brand.com/item/1", async () => ({ ok: false })), []);
});

test("findSuppliers: fotoğrafla eşleşen ilan metin benzerliği düşük olsa da önce gelir; fiyat ondan hesaplanır", async () => {
  const lamp = await dHash(await sharp(svg(LAMP)).png().toBuffer());
  const bottle = await dHash(await sharp(svg(BOTTLE)).png().toBuffer());
  const page = JSON.stringify([
    { title: "Portable LED Moon Desk Lamp Rechargeable", img: "desk.jpg", price: 9.5 },
    { title: "Rechargeable Moon Lamp Night Light Bedroom", img: "other.jpg", price: 2.1 },
    { title: "Kids Bedside Light Gift", img: "lamp.jpg", price: 3.4 },
  ]);
  const site = {
    source: "aliexpress" as const,
    url: (q: string) => `https://x.test/${q}`,
    parse: (html: string) =>
      (JSON.parse(html) as { title: string; img: string; price: number }[]).map((o, i) => ({
        source: "aliexpress" as const,
        url: `https://x.test/item/${i}`,
        title: o.title,
        imageUrl: `https://img.test/${o.img}`,
        priceMin: o.price,
        priceMax: o.price,
        currency: "USD",
        moq: null,
        sold: null,
        supplierName: null,
      })),
  };
  const fetchPage = async (url: string): Promise<FetchResult> => ({ ok: true, status: 200, url, contentType: "text/html", text: page });
  const hashImage = async (url: string | null) => (url?.endsWith("lamp.jpg") ? lamp : bottle);

  const r = await findSuppliers(
    { name: "Glow Moon Lamp Rechargeable Bedside Light", brandDomain: "glowshop.com", productType: null, imageHashes: [lamp!] },
    fetchPage,
    [site],
    hashImage,
  );
  assert.equal(r.offers[0].title, "Kids Bedside Light Gift");
  assert.equal(r.offers[0].imageDistance, 0);
  assert.ok(isImageMatch(r.offers[0]));
  assert.ok(r.offers[0].similarity >= 0.95);
  assert.ok(r.offers.every((o) => o.title !== "Rechargeable Moon Lamp Night Light Bedroom" || !isImageMatch(o)));
  // Fotoğrafla eşleşen fiyatlı ilan varsa marj yalnızca onlardan: 3,4 $ (2,1 $'lık farklı ürün değil).
  assert.deepEqual(supplierEconomics(r.offers, 34, "USD"), { minUsd: 3.4, margin: 10 });

  // Ürün görseli yoksa yalnızca metin eşleşmesi (görsel karşılaştırılmaz).
  const textOnly = await findSuppliers({ name: "Glow Moon Lamp Rechargeable Bedside Light", brandDomain: "glowshop.com", productType: null }, fetchPage, [site], hashImage);
  assert.ok(textOnly.offers.every((o) => o.imageDistance === null));
});

test("findSuppliers: mağaza görselinin AliExpress kimliği ilanın görsel adresinde geçerse kesin eşleşme (görsel indirilmez)", async () => {
  const id = "S4f799d2afe244d7189aaf61e0b2036edi";
  const site = {
    source: "aliexpress" as const,
    url: (q: string) => `https://x.test/${q}`,
    parse: () => [
      { source: "aliexpress" as const, url: "https://x.test/item/1", title: "Mini UV Lamp Box Phone", imageUrl: `https://ae-pic-a1.aliexpress-media.com/kf/${id}.jpg`, priceMin: 6.5, priceMax: 6.5, currency: "USD", moq: null, sold: 120, supplierName: null },
      { source: "aliexpress" as const, url: "https://x.test/item/2", title: "Sterilizer Box Multifunctional UV", imageUrl: "https://ae-pic-a1.aliexpress-media.com/kf/Sother.jpg", priceMin: 3, priceMax: 3, currency: "USD", moq: null, sold: 5, supplierName: null },
    ],
  };
  let hashed = 0;
  const r = await findSuppliers(
    { name: "Multifunctional UV-C Sterilizer Box", brandDomain: "aerocleantech.store", productType: null, nameStartsWithBrand: false, aliImageIds: [id] },
    async (url) => ({ ok: true, status: 200, url, contentType: "text/html", text: "" }),
    [site],
    async () => (hashed++, null),
  );
  assert.equal(r.offers[0].url, "https://x.test/item/1");
  assert.equal(r.offers[0].imageDistance, 0);
  assert.ok(isImageMatch(r.offers[0]));
  assert.equal(hashed, 0); // ürün görsel özeti verilmediği için görsel karşılaştırma yapılmaz
});