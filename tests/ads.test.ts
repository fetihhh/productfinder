import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adLibraryClient,
  adLibraryPageUrl,
  adMatches,
  adPoints,
  adSearchUrl,
  classifyGraphError,
  summarizeAds,
  type ArchivedAd,
} from "../dtc/adLibrary.ts";
import { momentumScore, winnerScore } from "../lib/winner.ts";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const ad = (over: Partial<ArchivedAd>): ArchivedAd => ({ id: "1", page_id: "p1", page_name: "Blue Pets", ...over });

test("adSearchUrl: alan adıyla ya da bilinen sayfa kimliğiyle arar; anahtar URL'de yok", () => {
  const byDomain = new URL(adSearchUrl({ domain: "bluepets.store", pageId: null }, ["DE", "FR"], "v24.0", NOW));
  assert.equal(byDomain.pathname, "/v24.0/ads_archive");
  assert.equal(byDomain.searchParams.get("search_terms"), "bluepets.store");
  assert.equal(byDomain.searchParams.get("ad_reached_countries"), '["DE","FR"]');
  assert.equal(byDomain.searchParams.get("ad_type"), "ALL");
  assert.equal(byDomain.searchParams.get("ad_delivery_date_min"), "2026-05-12");
  assert.equal(byDomain.searchParams.has("access_token"), false);

  const byPage = new URL(adSearchUrl({ domain: "bluepets.store", pageId: "123" }, ["DE"], "v24.0", NOW));
  assert.equal(byPage.searchParams.get("search_page_ids"), '["123"]');
  assert.equal(byPage.searchParams.has("search_terms"), false);
  assert.match(adLibraryPageUrl("123", "x.com"), /view_all_page_id=123/);
  assert.match(adLibraryPageUrl(null, "bluepets.store"), /q=bluepets\.store/);
});

test("adMatches: bağlantı başlığında alan adı ya da sayfa adı = mağaza adı", () => {
  assert.ok(adMatches(ad({ ad_creative_link_captions: ["BLUEPETS.STORE"] }), "bluepets.store", null, null));
  assert.ok(adMatches(ad({ ad_creative_bodies: ["Shop now at www.bluepets.store!"] }), "www.bluepets.store", null, null));
  assert.ok(adMatches(ad({ page_name: "Blue-Pets" }), "bluepets.store", "Blue Pets", null));
  // Aynı kelimeleri içeren başka bir mağazanın reklamı eşleşmez.
  assert.ok(!adMatches(ad({ page_name: "Pet Store Blue", ad_creative_link_captions: ["petstoreblue.com"] }), "bluepets.store", "Blue Pets", null));
  // Kısa mağaza adı (≤ 3 harf) sayfa adıyla eşleştirilmez.
  assert.ok(!adMatches(ad({ page_name: "Joy" }), "joy.shop", "Joy", null));
  // Sayfa kimliğiyle arandıysa yalnızca o sayfanın reklamları.
  assert.ok(adMatches(ad({ page_id: "p1" }), "x.com", null, "p1"));
  assert.ok(!adMatches(ad({ page_id: "p2" }), "x.com", null, "p1"));
});

test("summarizeAds: yayındaki reklamlar, en eski reklamın yaşı, yeni reklamlar ve örnekler", () => {
  const ads: ArchivedAd[] = [
    ad({ id: "a", ad_delivery_start_time: daysAgo(40), eu_total_reach: 12000, publisher_platforms: ["facebook", "instagram"], ad_creative_link_titles: ["Dog Poop Catcher"] }),
    ad({ id: "b", ad_delivery_start_time: daysAgo(5), eu_total_reach: 3000, publisher_platforms: ["instagram"] }),
    ad({ id: "c", ad_delivery_start_time: daysAgo(60), ad_delivery_stop_time: daysAgo(50), page_id: "p2", page_name: "Other" }),
    ad({ id: "a", ad_delivery_start_time: daysAgo(40) }), // tekrar
  ];
  const s = summarizeAds(ads, NOW);
  assert.equal(s.activeAds, 2);
  assert.equal(s.totalAds, 3);
  assert.equal(s.newAds14d, 1);
  assert.equal(s.longestActiveDays, 40);
  assert.equal(s.firstAdAt, daysAgo(60));
  assert.equal(s.euReach, 15000);
  assert.deepEqual(s.platforms, ["facebook", "instagram"]);
  assert.equal(s.pageId, "p1");
  assert.equal(s.pageName, "Blue Pets");
  assert.deepEqual(s.samples.map((x) => [x.id, x.active]), [["a", true], ["b", true], ["c", false]]);
  assert.equal(s.samples[0].title, "Dog Poop Catcher");
  assert.equal(s.samples[0].url, "https://www.facebook.com/ads/library/?id=a");

  const empty = summarizeAds([], NOW);
  assert.deepEqual([empty.activeAds, empty.totalAds, empty.longestActiveDays, empty.euReach, empty.pageId], [0, 0, null, null, null]);
});

test("adPoints: reklam sayısı + en eski yayındaki reklamın yaşı, en fazla 25", () => {
  assert.equal(adPoints({ activeAds: 0, totalAds: 0, longestActiveDays: null }), 0);
  assert.equal(adPoints({ activeAds: 0, totalAds: 4, longestActiveDays: null }), 3);
  assert.equal(adPoints({ activeAds: 1, totalAds: 1, longestActiveDays: 3 }), 8);
  assert.equal(adPoints({ activeAds: 3, totalAds: 5, longestActiveDays: 20 }), 17);
  assert.equal(adPoints({ activeAds: 12, totalAds: 30, longestActiveDays: 45 }), 25);
});

test("classifyGraphError: anahtar, hız sınırı ve yetki hataları aramaları durdurur", () => {
  assert.deepEqual(classifyGraphError(400, { code: 190, message: "Session has expired" }).fatal, true);
  assert.match(classifyGraphError(400, { code: 613, message: "Calls limited" }).reason, /^Hız sınırı/);
  assert.match(classifyGraphError(400, { code: 10, error_subcode: 2332002, message: "x" }).reason, /^Yetki yok/);
  assert.deepEqual(classifyGraphError(500, { code: 2, message: "Temporary" }), { fatal: false, reason: "Temporary" });
});

test("adLibraryClient: anahtar Authorization başlığında, hata kodları sınıflanır", async () => {
  const seen: { url: string; auth: string | null }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    seen.push({ url, auth: new Headers(init.headers).get("authorization") });
    if (url.includes("broken")) return new Response(JSON.stringify({ error: { code: 190, message: "expired" } }), { status: 400 });
    return new Response(JSON.stringify({ data: [{ id: "9", page_id: "p" }] }), { status: 200 });
  }) as typeof fetch;
  const search = adLibraryClient("SECRET-TOKEN", { countries: ["DE"], version: "v24.0", fetchImpl: fake });
  const ok = await search({ domain: "shop.com", pageId: null });
  assert.deepEqual(ok, { ok: true, ads: [{ id: "9", page_id: "p" }] });
  const bad = await search({ domain: "broken.com", pageId: null });
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.fatal, true);
  assert.equal(seen[0].auth, "Bearer SECRET-TOKEN");
  assert.ok(seen.every((s) => !s.url.includes("SECRET-TOKEN")));
});

test("reklam winner ve yükseliş skorlarına eklenir, toplam en fazla 100", () => {
  const base = { reviewCount: null, rating: null, price: null, currency: null, trendScore: 0, ranks: [], snapshots: [] };
  assert.equal(winnerScore({ ...base, adPoints: 25 }).breakdown.parts.reklam, 15);
  assert.equal(winnerScore({ ...base, adPoints: 10 }).score, 6);
  const m = momentumScore(50, 15, 1.2, 2, 3);
  assert.equal(m.parts.reklam, 25);
  assert.equal(m.score, 100);
  assert.equal(momentumScore(null, null, null, 0, 1).score, 8.3);
});
