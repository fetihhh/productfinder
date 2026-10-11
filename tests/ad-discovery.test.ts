import { test } from "node:test";
import assert from "node:assert/strict";
import { AD_DISCOVERY_TERMS } from "../config/adDiscovery.ts";
import { captionDomain, discoverySearchUrl, domainsFromAds } from "../dtc/adDiscovery.ts";

test("captionDomain: reklam bağlantı başlığından mağaza alan adı; pazaryeri, sosyal ağ ve barındırma atlanır", () => {
  assert.equal(captionDomain("GETCOSMORA.COM"), "getcosmora.com");
  assert.equal(captionDomain("shop.brasapro.com"), "brasapro.com");
  assert.equal(captionDomain("www.feelmou.com/products/repulsif"), "feelmou.com");
  assert.equal(captionDomain("elvaranaturals.es"), "elvaranaturals.es");
  assert.equal(captionDomain("amazon.de"), null);
  assert.equal(captionDomain("fb.me"), null);
  assert.equal(captionDomain("store.myshopify.com"), null);
  assert.equal(captionDomain("instagram.com"), null);
  assert.equal(captionDomain("Shop now"), null);
  assert.equal(captionDomain(""), null);
});

test("domainsFromAds: alan adı başına reklam sayısı, sayfa ve en eski başlangıç; çok reklamlı önce", () => {
  const d = domainsFromAds([
    { id: "1", page_name: "Cosmora", ad_creative_link_captions: ["GETCOSMORA.COM"], ad_delivery_start_time: "2026-10-01" },
    { id: "2", page_name: "Cosmora Shop", ad_creative_link_captions: ["getcosmora.com"], ad_delivery_start_time: "2026-09-20" },
    { id: "3", page_name: "Brasa", ad_creative_link_captions: ["brasapro.com"] },
    { id: "4", page_name: "Amazon", ad_creative_link_captions: ["amazon.fr"] },
    { id: "5", page_name: "X" },
  ]);
  assert.deepEqual(d, [
    { domain: "getcosmora.com", ads: 2, pages: ["Cosmora", "Cosmora Shop"], firstStart: "2026-09-20" },
    { domain: "brasapro.com", ads: 1, pages: ["Brasa"], firstStart: null },
  ]);
});

test("discoverySearchUrl: yayındaki reklamlar, tam ifade, AB ülkeleri, son N gün; anahtar adreste yok", () => {
  const u = new URL(discoverySearchUrl("envío gratis", ["ES", "FR"], "v24.0", 45, Date.parse("2026-10-11T00:00:00Z")));
  assert.equal(u.pathname, "/v24.0/ads_archive");
  assert.equal(u.searchParams.get("search_terms"), "envío gratis");
  assert.equal(u.searchParams.get("search_type"), "KEYWORD_EXACT_PHRASE");
  assert.equal(u.searchParams.get("ad_active_status"), "ACTIVE");
  assert.equal(u.searchParams.get("ad_reached_countries"), '["ES","FR"]');
  assert.equal(u.searchParams.get("ad_delivery_date_min"), "2026-08-27");
  assert.ok(u.searchParams.get("fields")!.includes("ad_creative_link_captions"));
  assert.equal(u.searchParams.get("access_token"), null);
  assert.equal(new Set(AD_DISCOVERY_TERMS).size, AD_DISCOVERY_TERMS.length);
});
