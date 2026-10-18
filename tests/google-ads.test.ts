import assert from "node:assert/strict";
import { test } from "node:test";
import { advertiserKind, advertiserPageUrl, googleAdsTrSql, nameKey, parseAdvertiser, storeKeys } from "../dtc/googleAds.ts";
import { itemKey, itemKeyFromUrl } from "../lib/storeItems.ts";

test("googleAdsTrSql: yalnızca Türkiye, son 30 gün, sınırlı", () => {
  const sql = googleAdsTrSql(30, 3, 3000);
  assert.match(sql, /google_ads_transparency_center\.creative_stats/);
  assert.match(sql, /r\.region_code = 'TR'/);
  assert.match(sql, /HAVING new_30d >= 3/);
  assert.match(sql, /LIMIT 3000$/);
  // Gösterim toplamı INT64 taşmasın (BigQuery: "Error in SUM aggregation: integer overflow").
  assert.doesNotMatch(sql, /AS INT64/);
  assert.match(sql, /LEAST\(SAFE_CAST\(CAST\(r\.times_shown_upper_bound AS STRING\) AS FLOAT64\), 1e12\)/);
});

test("parseAdvertiser: geçersiz kimlik ve Şeffaflık Merkezi dışı adres elenir", () => {
  assert.equal(parseAdvertiser({ advertiser_id: "x1" }), null);
  const a = parseAdvertiser({
    advertiser_id: "AR123",
    name: " Lunovia ",
    creatives: 12,
    new_30d: 5,
    active_7d: 4,
    formats: ["VIDEO", "", null],
    topics: null,
    impressions_high: 20000,
    sample_url: "https://evil.example/x",
  })!;
  assert.equal(a.name, "Lunovia");
  assert.deepEqual(a.formats, ["VIDEO"]);
  assert.deepEqual(a.topics, []);
  assert.equal(a.sample_url, null);
  assert.equal(advertiserPageUrl("AR123"), "https://adstransparency.google.com/advertiser/AR123?region=TR");
});

test("nameKey ve storeKeys: şirket türü ve genel kelimeler yok sayılır", () => {
  assert.equal(nameKey("Lunovia E-Ticaret Ltd. Şti."), "lunovia");
  assert.equal(nameKey("ÇİÇEK DÜNYASI A.Ş."), "cicekdunyasi");
  assert.equal(nameKey("ABC Ltd"), null); // 4 karakterden kısa
  assert.deepEqual(storeKeys("try-lunovia.com", null).includes("lunovia"), true);
  assert.deepEqual(storeKeys("www.parlakdost.com", "Parlak Dost Store").includes("parlakdost"), true);
  assert.ok(!storeKeys("abc.com", null).length);
});

test("itemKeyFromUrl: ürün adresi → store_items anahtarı", () => {
  assert.equal(itemKeyFromUrl("https://Shop.Example.com/products/led-lamp?variant=1"), itemKey("shop.example.com", "led-lamp"));
  assert.equal(itemKeyFromUrl("https://x.com/products/%C3%A7anta"), "x.com/çanta");
  assert.equal(itemKeyFromUrl("https://x.com/collections/all"), null);
  assert.equal(itemKeyFromUrl(null), null);
});

test("advertiserKind: ajans, büyük şirket ve ürün satmayanlar ayrılır", () => {
  const a = (name: string, creatives = 40, topics = ["Apparel"], impressions_low: number | null = 100_000) =>
    advertiserKind({ name, legal_name: null, creatives, impressions_low, topics });
  assert.equal(a("NE-SAÇ TEKSTİL SANAYİ VE TİCARET LİMİTED ŞİRKETİ"), "kucuk");
  assert.equal(a("DH REKLAM DANIŞMANLIK MEDYA PAZARLAMA TİCARET LİMİTED"), "ajans");
  assert.equal(a("GROUPM MEDYA HİZMETLERİ TİC. LTD.ŞTİ."), "ajans");
  assert.equal(a("Küçük Butik Ltd", 600), "buyuk"); // 30 günde 500+ reklam
  assert.equal(a("Küçük Butik Ltd", 40, ["Apparel"], 80_000_000), "buyuk");
  assert.equal(a("EREN HOLDİNG ANONİMŞİRKETİ"), "buyuk");
  assert.equal(a("L'OREAL TÜRKİYE KOZMETİK SAN.VE TİC.A.Ş.", 150, ["Beauty & Personal Care"]), "buyuk");
  assert.equal(a("FLO Mağazacılık ve Pazarlama A.Ş."), "buyuk");
  assert.equal(a("TERRA PİZZA GIDA SANAYİ VE TİCARET ANONİM ŞİRKETİ", 300, ["Food & Groceries"]), "diger");
  assert.equal(a("Gazella Turizm", 100, ["Travel & Tourism", "Hobbies, Games & Leisure"]), "diger");
  assert.equal(a("MAKRİ GIDA TURİZM SANAYİ", 100, ["Food & Groceries"]), "kucuk"); // adında turizm var ama gıda satıyor
  assert.equal(a("Yıldız Danış Ltd", 40, ["Finance", "Real Estate"]), "diger");
});
