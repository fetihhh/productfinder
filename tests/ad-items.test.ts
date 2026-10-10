import { test } from "node:test";
import assert from "node:assert/strict";
import { adItemRow, viewAdItems } from "../dtc/adItems.ts";

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
