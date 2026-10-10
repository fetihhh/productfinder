import { test } from "node:test";
import assert from "node:assert/strict";
import { advertisedProducts, analyzeAds, creativeKey } from "../dtc/adAnalysis.ts";
import type { ArchivedAd } from "../dtc/adLibrary.ts";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
let seq = 0;
const ad = (over: Partial<ArchivedAd>): ArchivedAd => ({ id: String(++seq), page_id: "p", ad_creative_bodies: ["Un regalo que no olvidarán 🌌"], ...over });

test("creativeKey: rakam, emoji ve boşluk farkları aynı reklam sayılır", () => {
  assert.equal(creativeKey(ad({ ad_creative_bodies: ["Only $19 today!! 🔥"] })), creativeKey(ad({ ad_creative_bodies: ["only $29   today 🔥"] })));
  assert.notEqual(creativeKey(ad({ ad_creative_bodies: ["Galaxy projector"] })), creativeKey(ad({ ad_creative_bodies: ["Star light"] })));
});

test("analyzeAds: uzun süredir yayında, kopyalanan ve ölçeklenen reklamlar → kanıtlanmış winner", () => {
  const ads = [
    ...Array.from({ length: 6 }, (_, i) => ad({ ad_delivery_start_time: daysAgo(35 - i), eu_total_reach: 20_000, age_country_gender_reach_breakdown: [{ country: "ES" }, { country: "PT" }] })),
    ...Array.from({ length: 12 }, (_, i) => ad({ ad_delivery_start_time: daysAgo(i), ad_creative_bodies: [`Variante ${"abcdefghijkl"[i].repeat(3)}`], eu_total_reach: 5_000, age_country_gender_reach_breakdown: [{ country: "FR" }, { country: "NL" }, { country: "BE" }] })),
    ad({ ad_delivery_start_time: daysAgo(60), ad_delivery_stop_time: daysAgo(40), ad_creative_bodies: ["Old test"] }),
  ];
  const a = analyzeAds(ads, null, NOW);
  assert.deepEqual(a.parts, { sureklilik: 35, olceklenme: 14, kopya: 15, erisim: 11, genisleme: 7 });
  assert.equal(a.score, 82);
  assert.equal(a.stage, "proven");
  assert.equal(a.active7d, 11); // 6 eski + yeni reklamlardan 7–11 gün öncekiler
  assert.equal(a.creatives[0].active, 6);
  assert.deepEqual(a.countries, ["BE", "ES", "FR", "NL", "PT"]);
  // 180.000 erişim × 1,6 × 5–12 € CPM
  assert.deepEqual(a.spend, { low: 1440, high: 3456 });
});

test("analyzeAds: aşamalar — test, ölçeklenme, durmuş, yok", () => {
  assert.equal(analyzeAds([ad({ ad_delivery_start_time: daysAgo(1) })], null, NOW).stage, "testing");
  const scaling = Array.from({ length: 16 }, (_, i) => ad({ ad_delivery_start_time: daysAgo(i % 5), ad_creative_bodies: [`v${i} kit`] }));
  assert.equal(analyzeAds(scaling, null, NOW).stage, "scaling");
  const stopped = analyzeAds([ad({ ad_delivery_start_time: daysAgo(50), ad_delivery_stop_time: daysAgo(45), eu_total_reach: 500_000 })], null, NOW);
  assert.equal(stopped.stage, "stopped");
  assert.ok(stopped.score <= 15);
  assert.equal(analyzeAds([], null, NOW).stage, "none");
});

test("analyzeAds: yayındaki reklamlar ayrıca verildiyse en eski reklam ondan hesaplanır (100 sınırı)", () => {
  const recent = Array.from({ length: 3 }, (_, i) => ad({ ad_delivery_start_time: daysAgo(i) }));
  const oldActive = [ad({ id: "old", ad_delivery_start_time: daysAgo(40) })];
  assert.equal(analyzeAds(recent, null, NOW).parts.sureklilik, 0);
  assert.equal(analyzeAds(recent, oldActive, NOW).parts.sureklilik, 35);
});

test("advertisedProducts: reklam metni mağazanın hangi ürününü anlatıyor", () => {
  const products = [
    { h: "galaxy-projector", t: "Cosmora Galaxy Projector — Multi-Slide Star Night Light" },
    { h: "gift-card", t: "Gift Card" },
  ];
  const ads = [
    ad({ ad_creative_link_titles: ["Galaxy Projector – Star Night Light"] }),
    ad({ ad_creative_bodies: ["Turn your room into a galaxy: projector with multi slide star night light"] }),
    ad({ ad_creative_bodies: ["Unrelated shipping notice"] }),
  ];
  assert.deepEqual(advertisedProducts(ads, products), [{ handle: "galaxy-projector", title: products[0].t, ads: 2 }]);
});
