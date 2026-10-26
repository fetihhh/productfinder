import { test } from "node:test";
import assert from "node:assert/strict";
import { adItemRow, assignAdsToProducts, collapseAdItems, fillAdText, viewAdItems, type AdItem } from "../dtc/adItems.ts";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

test("adItemRow: metin, platform, erişim, ülke ve kitle özeti", () => {
  const r = adItemRow(
    {
      id: "1",
      page_name: "Cosmora",
      ad_delivery_start_time: ago(10),
      ad_creative_bodies: ["Un regalo que no olvidarán"],
      ad_creative_link_titles: ["Cosmora Galaxy"],
      publisher_platforms: ["facebook", "instagram"],
      eu_total_reach: 5000,
      age_country_gender_reach_breakdown: [{ country: "ES", age_gender_breakdowns: [{ age_range: "25-34", female: 30, male: 70 }, { age_range: "35-44", female: 10, male: 10 }] }],
    },
    "getcosmora.com",
  );
  assert.equal(r.title, "Cosmora Galaxy");
  assert.equal(r.body, "Un regalo que no olvidarán");
  assert.deepEqual(r.countries, ["ES"]);
  assert.equal(r.female_share, 0.333);
  assert.equal(r.top_age, "25-34");
  assert.equal(r.eu_reach, 5000);
  assert.ok(r.creative_key);
});

test("viewAdItems: yayında + uzun süre + kopya önce; durmuş reklamın süresi durduğu güne kadar", () => {
  const base = { domain: "x", page_id: null, page_name: null, title: null, description: null, platforms: [], countries: [], female_share: null, top_age: null };
  const v = viewAdItems(
    [
      { ...base, id: "old-stopped", start_at: ago(60), stop_at: ago(50), body: "a", eu_reach: 100, creative_key: "a" },
      { ...base, id: "long-active", start_at: ago(35), stop_at: null, body: "b", eu_reach: 1000, creative_key: "b" },
      { ...base, id: "copy1", start_at: ago(5), stop_at: null, body: "c", eu_reach: 10, creative_key: "c" },
      { ...base, id: "copy2", start_at: ago(4), stop_at: null, body: "c", eu_reach: 10, creative_key: "c" },
    ],
    NOW,
  );
  assert.deepEqual(v.map((i) => i.id), ["long-active", "copy1", "copy2", "old-stopped"]);
  const stopped = v.find((i) => i.id === "old-stopped")!;
  assert.equal(stopped.active, false);
  assert.equal(stopped.days, 10);
  assert.deepEqual([v[1].copies, v[1].activeCopies], [2, 2]);
});

test("assignAdsToProducts: reklam metni ürün adıyla eşleşir; eşleşmeyen öne çıkan ürüne yazılır", () => {
  const products = [
    { h: "galaxy-projector", t: "Cosmora Galaxy Projector Night Light" },
    { h: "moon-lamp", t: "Moon Lamp" },
  ];
  const m = assignAdsToProducts(
    [
      { id: "1", title: "Galaxy Projector", body: "Turn your room into a galaxy with this night light projector", description: null },
      { id: "2", title: null, body: "Our moon lamp glows like the real moon", description: null },
      { id: "3", title: "Un regalo que no olvidarán", body: "¿Buscas un regalo?", description: null },
    ],
    products,
    "galaxy-projector",
  );
  assert.deepEqual([...m.entries()], [
    ["1", "galaxy-projector"],
    ["2", "moon-lamp"],
    ["3", "galaxy-projector"],
  ]);
  assert.equal(assignAdsToProducts([{ id: "x", title: "nothing", body: null, description: null }], products, null).get("x"), null);
});

test("collapseAdItems: aynı kreatifin reklamları tek satır, kopya sayıları korunur", () => {
  const now = Date.parse("2026-10-26T00:00:00Z");
  const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const base: AdItem = { id: "", domain: "x.com", page_id: null, page_name: null, start_at: null, stop_at: null, title: null, body: "metin", description: null, platforms: [], eu_reach: null, countries: [], female_share: null, top_age: null, creative_key: "k" };
  const rows = collapseAdItems(
    [
      { ...base, id: "a", start_at: ago(40), stop_at: ago(20), eu_reach: 100, platforms: ["facebook"], countries: ["DE"] },
      { ...base, id: "b", start_at: ago(10), stop_at: null, eu_reach: 50, platforms: ["instagram"], countries: ["FR"] },
      { ...base, id: "c", start_at: ago(5), stop_at: null, eu_reach: null },
      { ...base, id: "d", creative_key: "z", start_at: ago(3), stop_at: ago(1) },
    ],
    now,
  );
  assert.equal(rows.length, 2);
  const k = rows.find((r) => r.creative_key === "k")!;
  assert.equal(k.id, "b"); // yayında olanlardan en uzun süredir yayında olan
  assert.equal(k.copies, 3);
  assert.equal(k.active_copies, 2);
  assert.equal(k.start_at, ago(40));
  assert.equal(k.stop_at, null);
  assert.equal(k.eu_reach, 150);
  assert.deepEqual(k.platforms.sort(), ["facebook", "instagram"]);
  // Görünümde kopya sayısı toplanan satırdan gelir.
  const v = viewAdItems(rows, now).find((r) => r.id === "b")!;
  assert.equal(v.copies, 3);
  assert.equal(v.activeCopies, 2);
});

test("fillAdText: eski satırlarda boşaltılmış metin aynı kreatiften geri gelir", () => {
  const rows = [
    { id: "1", creative_key: "k", body: "Uzun reklam metni" },
    { id: "2", creative_key: "k", body: null },
    { id: "3", creative_key: null, body: null },
  ];
  assert.deepEqual(fillAdText(rows).map((r) => r.body), ["Uzun reklam metni", "Uzun reklam metni", null]);
});
