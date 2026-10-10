import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateProfit, suggestedPrice, type ProfitInput } from "../lib/profit.ts";
import { parseTcmb, tryRate } from "../lib/fx.ts";

const base: ProfitInput = {
  mode: "tr_parcel",
  salePrice: 1200,
  rate: 40,
  unitCostUsd: 5,
  shippingUsd: 4,
  dutyPct: 0.6,
  perParcelFee: 0,
  domesticShipping: 100,
  paymentPct: 0.035,
  returnPct: 0.05,
  adCost: 300,
  vatIncluded: true,
  vatPct: 0.2,
};

test("calculateProfit: Çin'den tek tek gönderim (KDV, gümrük, komisyon, iade, reklam)", () => {
  const r = calculateProfit(base);
  assert.equal(r.netRevenue, 1000);
  // ürün 200 + kargo 160 + gümrük %60 × 360 = 216 + komisyon 42 + iade 50
  assert.equal(r.costsBeforeAds, 668);
  assert.equal(r.maxAdCost, 332);
  assert.equal(r.profit, 32);
  assert.equal(r.marginPct, 2.7);
  assert.equal(r.breakevenRoas, 3.61);
  assert.equal(r.breakevenPrice, 1157.71);
  // Başabaş fiyatında kâr sıfırdır.
  assert.ok(Math.abs(calculateProfit({ ...base, salePrice: r.breakevenPrice! }).profit) < 0.05);
  assert.deepEqual(
    r.lines.map((l) => l.label),
    ["Satış fiyatı", "KDV (%20)", "Ürün (toptan)", "Kargo (Çin → müşteri)", "Gümrük vergisi ve gönderi bedeli", "Ödeme komisyonu", "İade / hasar payı", "Reklam (satış başına)"],
  );
});

test("calculateProfit: toplu ithalatta yurt içi kargo, yurt dışında KDV ve gümrük yok", () => {
  const bulk = calculateProfit({ ...base, mode: "tr_bulk", shippingUsd: 1, dutyPct: 0.3 });
  // ürün 200 + navlun 40 + gümrük 72 + yurt içi kargo 100 + komisyon 42 + iade 50
  assert.equal(bulk.costsBeforeAds, 504);
  assert.equal(bulk.profit, 196);

  const abroad = calculateProfit({ ...base, mode: "abroad", salePrice: 30, rate: 1, shippingUsd: 5, dutyPct: 0, vatIncluded: false, adCost: 8 });
  // ürün 5 + kargo 5 + komisyon 1,05 + iade 1,5
  assert.equal(abroad.costsBeforeAds, 12.55);
  assert.equal(abroad.profit, 9.45);
  assert.equal(abroad.lines.some((l) => l.label.startsWith("KDV")), false);
});

test("calculateProfit: reklamsız da zarar ediliyorsa ROAS yok", () => {
  const r = calculateProfit({ ...base, salePrice: 300 });
  assert.ok(r.maxAdCost < 0);
  assert.equal(r.breakevenRoas, null);
});

test("suggestedPrice: rakibin fiyatı TL'ye çevrilip 10'a yuvarlanır", () => {
  assert.equal(suggestedPrice(33.16, 41.5), 1380);
  assert.equal(suggestedPrice(29.99, 1), 29.99);
  assert.equal(suggestedPrice(null, 41.5), 0);
});

test("parseTcmb: döviz satış kuru, birim (100 JPY) ve tarih", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="09.10.2026" Date="10/09/2026" Bulten_No="2026/190">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><Isim>ABD DOLARI</Isim><ForexBuying>49.1274</ForexBuying><ForexSelling>49.2160</ForexSelling></Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexBuying>55.11</ForexBuying><ForexSelling>55.2105</ForexSelling></Currency>
  <Currency CrossOrder="9" Kod="JPY" CurrencyCode="JPY"><Unit>100</Unit><ForexBuying>32.1</ForexBuying><ForexSelling>32.5</ForexSelling></Currency>
  <Currency CrossOrder="18" Kod="XDR" CurrencyCode="XDR"><Unit>1</Unit><ForexBuying>66.1</ForexBuying><ForexSelling></ForexSelling></Currency>
</Tarih_Date>`;
  const fx = parseTcmb(xml)!;
  assert.equal(fx.date, "2026-10-09");
  assert.deepEqual(fx.rates, { USD: 49.216, EUR: 55.2105, JPY: 0.325 });
  assert.equal(tryRate(fx, "TRY"), 1);
  assert.equal(tryRate(fx, "eur"), 55.2105);
  assert.equal(tryRate(fx, "XDR"), null);
  assert.equal(parseTcmb("<html>bakım</html>"), null);
});
