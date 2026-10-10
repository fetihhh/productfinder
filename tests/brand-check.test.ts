import { test } from "node:test";
import assert from "node:assert/strict";
import { findBrandListing, findMarketplaceListing, isBookListing } from "../dtc/marketplaceSearch.ts";
import { clip } from "../lib/text.ts";

test("clip: emoji ortasından kesilmez, bozuk vekil karakter temizlenir", () => {
  const s = "Lamp 👓👓👓";
  assert.equal(clip(s, 6), "Lamp 👓");
  assert.equal(JSON.stringify(clip("abc\ud83d", 10)), JSON.stringify("abc�"));
  assert.equal(clip("kısa", 10), "kısa");
});

test("isBookListing: Amazon'da ISBN numaralı ilanlar kitaptır", () => {
  assert.equal(isBookListing(new URL("https://www.amazon.com/dp/2100888005")), true);
  assert.equal(isBookListing(new URL("https://www.amazon.com/Some-Title/dp/096722491X/ref=x")), true);
  assert.equal(isBookListing(new URL("https://www.amazon.com/dp/B0HKVD2G9V")), false);
  assert.equal(isBookListing(new URL("https://www.otto.de/p/1234567890")), false);
});

test("findBrandListing: yeni mağaza ürününde başka markanın aynı adlı ilanı eleme sebebi değildir", () => {
  const toilet = [{ title: "Sanilo WC-Sitz Cosmora mit Absenkautomatik", url: "https://www.otto.de/p/sanilo-wc-sitz-cosmora-mit-absenkautomatik-S0MJ30N6/", content: "Toilettendeckel" }];
  const productWords = ["galaxy", "projector", "multi", "slide", "star", "night", "light"];
  // Eski davranış: yalnızca marka adı yeterliydi.
  assert.ok(findBrandListing(toilet, "Cosmora", "getcosmora.com", "Cosmora Galaxy Projector"));
  assert.equal(findBrandListing(toilet, "Cosmora", "getcosmora.com", "Cosmora Galaxy Projector", productWords), null);
  // Aynı markanın gerçekten projektör ilanı varsa yine elenir.
  const real = [{ title: "Cosmora Galaxy Star Projector Night Light", url: "https://www.amazon.com/dp/B0ABCDEFGH", content: "" }];
  assert.ok(findBrandListing(real, "Cosmora", "getcosmora.com", "Cosmora Galaxy Projector", productWords));
});

test("findMarketplaceListing ve findBrandListing: kitap ilanı sayılmaz", () => {
  const book = [{ title: "Mineraly Restore Chews", url: "https://www.amazon.com/dp/5171221561", content: "restore chews" }];
  assert.equal(findMarketplaceListing(book, "getmineraly.com", "Mineraly Restore Chews"), null);
  assert.equal(findBrandListing(book, "Mineraly", "getmineraly.com", "Mineraly Restore Chews"), null);
});
