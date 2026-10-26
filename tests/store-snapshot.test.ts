import { test } from "node:test";
import assert from "node:assert/strict";
import type { StoreProduct } from "../dtc/storeProbe.ts";
import { mergeSnapshot, SNAPSHOT_LIMIT } from "../dtc/storeSnapshot.ts";

const product = (handle: string, over: Partial<StoreProduct> = {}): StoreProduct => ({
  handle,
  title: handle,
  image: null,
  price: 29.99,
  compareAt: null,
  createdAt: "2026-09-01T00:00:00Z",
  physical: true,
  productType: null,
  availableVariants: 3,
  totalVariants: 3,
  dropship: false,
  apparel: false,
  aliImageId: null,
  offer: { discountPct: null, freeShipping: false, guaranteeDays: null, bundle: false },
  ...over,
});

test("mergeSnapshot: ilk görüntüde olay yok; sonra stok azalması, fiyat değişimi ve yeni ürün sayılır", () => {
  const first = mergeSnapshot(null, [product("lamp"), product("mug", { aliImageId: "S0123456789abcdef0123456789abcdefa" })], "2026-10-01");
  assert.deepEqual(first.events, { newProducts: 0, stockDrops: 0, priceChanges: 0 });
  assert.equal(first.items.find((i) => i.h === "lamp")?.f, "2026-09-01");
  assert.equal(first.items.find((i) => i.h === "mug")?.ali, true);

  const second = mergeSnapshot(
    first.items,
    [product("lamp", { availableVariants: 1 }), product("mug", { price: 24.99 }), product("fan", { createdAt: "2026-10-02T00:00:00Z" })],
    "2026-10-02",
  );
  assert.deepEqual(second.events, { newProducts: 1, stockDrops: 1, priceChanges: 1 });
  // Hareket sırası: stok azalan ürün önce, sonra fiyatı değişen, sonra yeni.
  assert.deepEqual(second.items.map((i) => [i.h, i.so, i.pc, i.pp, i.ld]), [
    ["lamp", 1, 0, null, "2026-10-02"],
    ["mug", 0, 1, 29.99, "2026-10-02"],
    ["fan", 0, 0, null, "2026-10-02"],
  ]);
  assert.equal(second.items.find((i) => i.h === "fan")?.f, "2026-10-02");

  // Varyant yapısı değiştiyse (yeni beden eklendi) stok azalması sayılmaz; sayaçlar korunur.
  const third = mergeSnapshot(second.items, [product("lamp", { availableVariants: 0, totalVariants: 4 })], "2026-10-03");
  assert.equal(third.events.stockDrops, 0);
  assert.equal(third.items[0].so, 1);
});

test("mergeSnapshot: en fazla 40 ürün, en hareketliler tutulur", () => {
  const many = Array.from({ length: 80 }, (_, i) => product(`p${i}`, { createdAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z` }));
  const first = mergeSnapshot(null, many, "2026-10-01");
  assert.equal(first.items.length, SNAPSHOT_LIMIT);
});
