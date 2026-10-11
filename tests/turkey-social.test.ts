import { test } from "node:test";
import assert from "node:assert/strict";
import { accountMatchesStore, handleCandidates, parseTiktokOembed, tiktokMatchesStore } from "../dtc/instagram.ts";
import { trListings, trQuery, tryPrice } from "../dtc/turkey.ts";

test("tryPrice: Türk fiyat yazımları", () => {
  assert.equal(tryPrice("Galaksi Projektör 1.299,90 TL kargo bedava"), 1299.9);
  assert.equal(tryPrice("₺549"), 549);
  assert.equal(tryPrice("Fiyat: 349,00 ₺"), 349);
  assert.equal(tryPrice("4,5 yıldız · 120 değerlendirme"), null);
  assert.equal(tryPrice("0,50 TL"), null);
});

test("trListings: yalnızca Türk siteleri; arama sayfaları ve tekrarlar atılır", () => {
  const l = trListings([
    { title: "Galaxy Projektör Yıldızlı Gece Lambası", url: "https://www.trendyol.com/x/galaxy-projektor-p-123", content: "649,90 TL" },
    { title: "Galaxy Projektör", url: "https://www.trendyol.com/x/galaxy-projektor-p-123?boutiqueId=1", content: "" },
    { title: "Arama: galaxy projektör", url: "https://www.hepsiburada.com/ara?q=galaxy", content: "" },
    { title: "Galaxy Projector", url: "https://www.amazon.de/dp/B0ABC", content: "" },
    { title: "Yıldız Projektör", url: "https://www.akakce.com/projektor/en-ucuz-yildiz-fiyati,123.html", content: "En ucuz ₺399" },
  ]);
  assert.deepEqual(
    l.map((x) => [x.site, x.price]),
    [
      ["Trendyol", 649.9],
      ["Akakçe", 399],
    ],
  );
  assert.equal(trQuery("Cosmora Galaxy Projector — Multi-Slide Star Night Light", ["cosmora"]), "Galaxy Projector Multi-Slide Star Night Light fiyat");
});

test("handleCandidates ve doğrulama: alan adı/mağaza adından kullanıcı adları; web sitesinde alan adı geçen hesap kabul", () => {
  assert.deepEqual(handleCandidates("getcosmora.com", "Cosmora", 4), ["getcosmora", "cosmora", "cosmora.official", "cosmora_official"]);
  assert.deepEqual(handleCandidates("brasapro.com", "BRASAPRO", 3), ["brasapro", "brasapro.official", "brasapro_official"]);
  assert.equal(accountMatchesStore({ website: "https://getcosmora.com/?utm_source=ig" }, "getcosmora.com"), true);
  assert.equal(accountMatchesStore({ website: "https://linktr.ee/x", biography: "Shop at getcosmora.com ✨" }, "getcosmora.com"), true);
  assert.equal(accountMatchesStore({ website: "https://cosmora-official.de" }, "getcosmora.com"), false);
  assert.equal(accountMatchesStore({}, "getcosmora.com"), false);
});

test("TikTok oEmbed: hesap ve yazar adı; ad mağazayla eşleşmeli", () => {
  const o = parseTiktokOembed(JSON.stringify({ author_name: "Cosmora Official", author_url: "https://www.tiktok.com/@cosmora", embed_product_id: "cosmora", type: "rich" }));
  assert.deepEqual(o, { author: "Cosmora Official", handle: "cosmora" });
  assert.equal(parseTiktokOembed('{"status_msg":"Something went wrong"}'), null);
  assert.equal(tiktokMatchesStore("Cosmora Official", "getcosmora.com", "Cosmora"), true);
  assert.equal(tiktokMatchesStore("Maria López", "getcosmora.com", "Cosmora"), false);
  assert.equal(tiktokMatchesStore("Brasa Pro", "brasapro.com", null), true);
});
