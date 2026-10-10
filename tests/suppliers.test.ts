import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractJson,
  findSuppliers,
  isBrandedOrUsed,
  pageWeights,
  parseAlibabaOffers,
  parseAliExpressOffers,
  parseMadeInChinaOffers,
  priceRange,
  similarity,
  supplierQuery,
  SUPPLIER_SITES,
} from "../dtc/suppliers.ts";
import { bigBrandReason, isBigBrand, verifyProduct } from "../dtc/verify.ts";
import type { FetchResult } from "../lib/http.ts";
import { supplierEconomics, supplyPoints } from "../lib/winner.ts";

const ok = (url: string, text: string): FetchResult => ({ ok: true, status: 200, url, contentType: "text/html", text });

const ALI = `{"itemList":{"content":[{"redirectedId":"1","itemType":"productV3","productId":"1005005902925053","image":{"imgUrl":"//ae-pic-a1.aliexpress-media.com/kf/S05.jpg","imgWidth":350},"title":{"displayTitle":"Hybrid Headphone Speaker 2 in 1 Twist Wireless Headphones"},"prices":{"skuId":"1","salePrice":{"priceType":"sale_price","currencyCode":"USD","minPrice":18.5,"formattedPrice":"US $18.50"}},"trade":{"tradeDesc":"1,000+ sold"},"utLogMap":{"real_trade_count":"1240"}},
{"itemType":"productV3","productId":"1005007556064024","title":{"displayTitle":"Case for Neo headphone \\u00e7anta"},"prices":{"salePrice":{"currencyCode":"USD","minPrice":3.2}},"trade":{"tradeDesc":"15 sold"}}]}}`;

const ALIBABA = `<script>window._PAGE_DATA_ = {"breadcrumb":{"items":[{"title":"x"}]},"products":{"items":[{"id":"1601406226385","title":"OEM Hybrid <b>Headphone</b> Speaker Twist 2 in 1","url":"//www.alibaba.com/product-detail/OEM-Hybrid_1601406226385.html?spm=a","image":"//s.alicdn.com/kf/Hb7.jpg_200x200.jpg","price":"$6.80-9.50","moq":"500 pieces","supplier":{"name":"Shenzhen Audio Co., Ltd.","years":"9","country":"CN"}},{"id":"2","title":"Bluetooth Speaker Lamp","url":"//www.alibaba.com/product-detail/2.html","price":"$1,200.00","moq":"1 set","supplier":{"name":"Other"}}]},"tail":"]}"};</script>`;

const MIC = `<div class="prod-image"><img src="space.webp" data-original="https://image.made-in-china.com/43f34j00g/Headphone.webp" alt="x"></div>
<h2 class="product-name" data-prod-tag=""> <a title="2 in 1 Hybrid Headphone Speaker for Gifts" href="https://acme.en.made-in-china.com/product/X/China-Hybrid-Headphone.html" target="_blank"> 2 in 1 <strong>Hybrid</strong> Headphone</a> </h2>
<div class="product-property"><div class="ellipsis attr-item J-faketitle price-new"><span class="attribute"><strong class="price">US$<span>10.00</span>-<span>20.00</span></strong></span> </div>
<div class="ellipsis attr-item J-faketitle moq-new"><span class="attribute"><span>1,000 Pieces</span> </span> <span class="moq-text">(MOQ)</span> </div></div>
<div class="company-info"><div class="company-name ellipsis"> <a href="https://acme.en.made-in-china.com" title="Fuzhou Acme Electric Co., Ltd." target="_blank">Acme</a></div></div>`;

test("supplierQuery: marka, model kodu ve pazarlama ekleri çıkarılır; ürün türü eklenir", () => {
  assert.equal(supplierQuery("TDM. Neo Hybrid Headphone - Speakers", "tdmofficial.com"), "neo hybrid headphone speakers");
  assert.equal(supplierQuery("Portal AFN7 Adventure Camera", "nocsprovisions.com", "Cameras"), "adventure camera");
  assert.equal(supplierQuery("Mibro GS Explorer S Pro", "mibrofit.com", "Smart Watch"), "explorer smart watch");
});

test("supplierQuery: yeni mağaza ürününde ilk sözcük marka sayılmaz; uzun adda ayraç sonrası açıklama atılır", () => {
  const name = "Multifunctional UV-C Sterilizer Box - Portable Aromatherapy & Disinfection Chamber";
  // Eski davranış: "Multifunctional" marka sanılıyor, açıklama sorguyu sonuçsuz bırakıyordu.
  assert.equal(supplierQuery(name, "aerocleantech.store", null, false), "multifunctional sterilizer box");
  assert.equal(supplierQuery("Bluetooth Pet Tracker & Anti-Loss Alarm", "1of1daily.com", null, false), "bluetooth pet tracker anti loss alarm");
  assert.equal(supplierQuery("BLACK OUT", "1fastbreak1.com", null, false), "black out");
  // Alan adının parçası olan sözcükler marka sayılır.
  assert.equal(supplierQuery("Blue Foldable Dog Poop Catcher", "bluepets.store", null, false), "foldable dog poop catcher");
  assert.equal(supplierQuery("Advent Bricks™ Nativity Set", "adventbricks.com", "Calendar", false), "nativity calendar");
  // Kısa adda ayraç sonrası (ürün türü) korunur.
  assert.equal(supplierQuery("TDM. Neo Hybrid Headphone - Speakers", "tdmofficial.com"), "neo hybrid headphone speakers");
});

test("similarity: tekil/çoğul eşleşmesiyle sözcük kapsama oranı", () => {
  assert.equal(similarity("neo hybrid headphone speakers", "Hybrid Headphone Speaker 2 in 1"), 0.75);
  assert.equal(similarity("adventure camera", "Bluetooth speaker"), 0);
});

test("extractJson ve priceRange", () => {
  assert.deepEqual(extractJson('x = {"a":{"items":[{"t":"]}"},{"t":2}]}}', '"items":'), [{ t: "]}" }, { t: 2 }]);
  assert.deepEqual(priceRange("$1.08-1.58"), [1.08, 1.58]);
  assert.deepEqual(priceRange("US$1,200.00"), [1200, 1200]);
  assert.deepEqual(priceRange("Negotiable"), [null, null]);
});

test("Toptancı sayfaları ayrıştırılır (AliExpress, Alibaba, Made-in-China)", () => {
  const ali = parseAliExpressOffers(ALI);
  assert.equal(ali.length, 2);
  assert.deepEqual(
    { title: ali[0].title, price: ali[0].priceMin, cur: ali[0].currency, sold: ali[0].sold, img: ali[0].imageUrl },
    { title: "Hybrid Headphone Speaker 2 in 1 Twist Wireless Headphones", price: 18.5, cur: "USD", sold: 1240, img: "https://ae-pic-a1.aliexpress-media.com/kf/S05.jpg" },
  );
  assert.equal(ali[1].sold, 15);

  const alibaba = parseAlibabaOffers(ALIBABA);
  assert.equal(alibaba.length, 2);
  assert.deepEqual(alibaba[0], {
    source: "alibaba",
    url: "https://www.alibaba.com/product-detail/OEM-Hybrid_1601406226385.html",
    title: "OEM Hybrid Headphone Speaker Twist 2 in 1",
    imageUrl: "https://s.alicdn.com/kf/Hb7.jpg_200x200.jpg",
    priceMin: 6.8,
    priceMax: 9.5,
    currency: "USD",
    moq: "500 pieces",
    sold: null,
    supplierName: "Shenzhen Audio Co., Ltd.",
  });
  assert.equal(alibaba[1].priceMin, 1200);

  const mic = parseMadeInChinaOffers(MIC);
  assert.deepEqual(mic[0], {
    source: "madeinchina",
    url: "https://acme.en.made-in-china.com/product/X/China-Hybrid-Headphone.html",
    title: "2 in 1 Hybrid Headphone Speaker for Gifts",
    imageUrl: "https://image.made-in-china.com/43f34j00g/Headphone.webp",
    priceMin: 10,
    priceMax: 20,
    currency: "USD",
    moq: "1,000 Pieces",
    sold: null,
    supplierName: "Fuzhou Acme Electric Co., Ltd.",
  });
});

test("findSuppliers: benzerlik eşiği, sıralama, okunamayan site", async () => {
  const pages: Record<string, FetchResult> = {
    "www.aliexpress.com": ok("a", ALI),
    "www.alibaba.com": ok("b", ALIBABA),
    "www.made-in-china.com": { ok: false, url: "m", reason: "HTTP 403", retryable: false },
  };
  const seen: { url: string; extra?: Record<string, string> }[] = [];
  const r = await findSuppliers(
    { name: "TDM. Neo Hybrid Headphone - Speakers", brandDomain: "tdmofficial.com", productType: null },
    async (u, _accept, extra) => (seen.push({ url: u, extra }), pages[new URL(u).hostname]),
  );
  assert.equal(r.query, "neo hybrid headphone speakers");
  assert.deepEqual(r.failed, ["Made-in-China (HTTP 403)"]);
  // "neo" (model adı) hiçbir başlıkta yok → en yüksek ağırlığı alır; diğer üç sözcük eşleşir.
  assert.deepEqual(r.offers.map((o) => [o.source, o.similarity]), [["aliexpress", 0.708], ["alibaba", 0.708]]);
  assert.equal(seen.find((s) => s.url.includes("aliexpress"))?.url, "https://www.aliexpress.com/w/wholesale-neo-hybrid-headphone-speakers.html");
  assert.match(seen.find((s) => s.url.includes("aliexpress"))?.extra?.Cookie ?? "", /c_tp=USD/);
  assert.equal(SUPPLIER_SITES[2].url("neo hybrid headphone"), "https://www.made-in-china.com/products-search/hot-china-products/Neo_Hybrid_Headphone.html");

  // Yeni mağaza ürünü: iki sözcüklük ad ve ürün türü yok → aranmaz (istek gönderilmez).
  const before = seen.length;
  const short = await findSuppliers({ name: "BLACK OUT", brandDomain: "1fastbreak1.com", productType: null, nameStartsWithBrand: false }, async () => {
    seen.push({ url: "x" });
    return pages["www.aliexpress.com"];
  });
  assert.deepEqual([short.offers.length, short.failed, seen.length], [0, ["tarif çok kısa"], before]);
});

test("supplierEconomics ve supplyPoints: en düşük toptan fiyat ve marj", () => {
  const offers = [
    { similarity: 0.75, priceMin: 6.8, currency: "USD" },
    { similarity: 0.5, priceMin: 1, currency: "USD" }, // benzerlik düşük → sayılmaz
    { similarity: 1, priceMin: 500, currency: "TRY" },
  ];
  assert.deepEqual(supplierEconomics(offers, 249, "USD"), { minUsd: 6.8, margin: 36.6 });
  assert.deepEqual(supplierEconomics([], 249, "USD"), { minUsd: null, margin: null });
  assert.equal(supplyPoints(null, null), 0);
  assert.equal(supplyPoints(6.8, 36.6), 20);
  assert.equal(supplyPoints(50, 2.5), 13);
  assert.equal(supplyPoints(80, 1.2), 8);
});

test("Büyük marka: Tranco sırası sınırın üstündeyse ağa çıkmadan elenir", async () => {
  assert.equal(isBigBrand(13_605), true);
  assert.equal(isBigBrand(575_487), false);
  assert.equal(isBigBrand(null), false);
  assert.match(bigBrandReason(13_605), /Büyük marka: site dünya sıralamasında #13\.605/);
  let fetched = 0;
  const r = await verifyProduct(
    {
      brandDomain: "oneplus.com",
      productUrl: "https://www.oneplus.com/x",
      productName: "OnePlus 67W Power Bank",
      brand: { marketplaceStatus: null, marketplaceEvidence: null, marketplaceCheckedAt: null, trancoRank: 13_605 },
    },
    { fetchPage: async (u) => (fetched++, { ok: false, url: u, reason: "x", retryable: false }), searchMarketplaces: null },
  );
  assert.equal(r.status, "rejected_big_brand");
  assert.equal(fetched, 0);
});

test("pageWeights: ayırt edici sözcük ağır basar (mantar cüzdan ≠ sıradan cüzdan)", () => {
  const titles = ["Slim Leather Wallet", "Men Slim Wallet RFID", "Cork Wallet Women", "Card Wallet", "Wallet Money Clip"];
  const w = pageWeights("cork wallet slim", titles);
  assert.ok(w.get("cork")! > w.get("slim")! && w.get("slim")! > w.get("wallet")!);
  assert.ok(similarity("cork wallet slim", "Cork Wallet Women", w) > similarity("cork wallet slim", "Slim Leather Wallet", w));
  assert.ok(similarity("cork wallet slim", "Slim Leather Wallet", w) < 0.7);
  assert.equal(isBrandedOrUsed("DJI Osmo Action 6 Adventure Combo"), true);
  assert.equal(isBrandedOrUsed("Refurbished Action Camera"), true);
  assert.equal(isBrandedOrUsed("Retro 13MP Digital Camera"), false);
});
