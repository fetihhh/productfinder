import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterCopies, copyPoints, hashToHex, hexToWords, shopIdFromImage, wordsDistance } from "../dtc/copies.ts";
import { hamming } from "../dtc/imageDistance.ts";

const h = (bits: string) => hashToHex(BigInt(`0b${bits.padEnd(256, "0")}`));

test("hashToHex / wordsDistance: 256 bitlik özet ve bigint farkıyla aynı sonuç", () => {
  const a = BigInt(`0x${"f0".repeat(32)}`);
  const b = a ^ (BigInt(`0x${"01".repeat(32)}`)); // 32 bit farklı
  assert.equal(hashToHex(1n), `${"0".repeat(63)}1`);
  assert.equal(wordsDistance(hexToWords(hashToHex(a)), hexToWords(hashToHex(b))), hamming(a, b));
  assert.equal(wordsDistance(hexToWords(hashToHex(a)), hexToWords(hashToHex(b))), 32);
  // Erken durma: eşiği aşınca saymayı bırakır (sonuç eşikten büyük kalır).
  assert.ok(wordsDistance(hexToWords(hashToHex(0n)), hexToWords(hashToHex(a)), 10) > 10);
});

test("clusterCopies: aynı fotoğraf ya da aynı AliExpress görseli → aynı küme; anahtar ilk açılan mağaza", () => {
  const lamp = "1".repeat(100) + "0".repeat(156);
  const lampEdited = "1".repeat(100) + "0".repeat(20) + "1".repeat(10) + "0".repeat(126); // 10 bit farklı
  const other = "0".repeat(100) + "1".repeat(156);
  const groups = clusterCopies(
    [
      { domain: "late.shop", hash: h(lampEdited), aliId: null, firstProductAt: "2026-09-20T00:00:00Z" },
      { domain: "first.shop", hash: h(lamp), aliId: null, firstProductAt: "2026-08-01T00:00:00Z" },
      { domain: "noimage.shop", hash: null, aliId: "S4f799d2afe244d7189aaf61e0b2036edi", firstProductAt: "2026-09-01T00:00:00Z" },
      { domain: "aliclone.shop", hash: h(other), aliId: "S4f799d2afe244d7189aaf61e0b2036edi", firstProductAt: "2026-09-05T00:00:00Z" },
      { domain: "alone.shop", hash: h("10".repeat(128)), aliId: null, firstProductAt: null },
    ],
    40,
  );
  assert.deepEqual(groups.get("late.shop"), { group: "first.shop", size: 2, sameSeller: false });
  assert.deepEqual(groups.get("first.shop"), { group: "first.shop", size: 2, sameSeller: false });
  assert.deepEqual(groups.get("noimage.shop"), { group: "noimage.shop", size: 2, sameSeller: false });
  assert.deepEqual(groups.get("aliclone.shop"), { group: "noimage.shop", size: 2, sameSeller: false });
  assert.deepEqual(groups.get("alone.shop"), { group: null, size: 1, sameSeller: false });
});

test("copyPoints: başka mağaza 1 → 8, 2–4 → 12, ≥ 5 → 15", () => {
  assert.deepEqual([0, 1, 2, 4, 5, 9].map(copyPoints), [0, 8, 12, 12, 15, 15]);
});

test("clusterCopies: aynı Shopify mağazasının başka alan adı kopya sayılmaz; birebir aynı başlık+fiyat = aynı satıcı ağı", () => {
  const img = "1".repeat(128) + "0".repeat(128);
  assert.equal(shopIdFromImage("https://cdn.shopify.com/s/files/1/0764/2352/8587/files/15_b250.jpg?v=1"), "0764/2352/8587");
  assert.equal(shopIdFromImage("https://example.com/a.jpg"), null);
  const sameShop = clusterCopies(
    [
      { domain: "bravunet.com", hash: h(img), aliId: null, firstProductAt: null, shopId: "0764/2352/8587" },
      { domain: "bravunetvip.com", hash: h(img), aliId: null, firstProductAt: null, shopId: "0764/2352/8587" },
    ],
    40,
  );
  assert.deepEqual(sameShop.get("bravunet.com"), { group: null, size: 1, sameSeller: false });

  const farm = clusterCopies(
    [
      { domain: "braceletholder.shop", hash: h(img), aliId: null, firstProductAt: "2026-08-26", shopId: "1", title: "Totally Bamboo 3-Piece Board", price: 17.99 },
      { domain: "breakfastmart.shop", hash: h(img), aliId: null, firstProductAt: "2026-08-28", shopId: "2", title: "Totally Bamboo 3-Piece Board!", price: 17.99 },
    ],
    40,
  );
  assert.deepEqual(farm.get("breakfastmart.shop"), { group: "braceletholder.shop", size: 2, sameSeller: true });

  const rivals = clusterCopies(
    [
      { domain: "calmi-a.com", hash: h(img), aliId: null, firstProductAt: "2026-09-17", shopId: "1", title: "Calmi Ring", price: 54.9 },
      { domain: "calmi-b.com", hash: h(img), aliId: null, firstProductAt: "2026-09-29", shopId: "2", title: "Anxiety Relief Ring", price: 39.9 },
    ],
    40,
  );
  assert.equal(rivals.get("calmi-b.com")?.sameSeller, false);
});