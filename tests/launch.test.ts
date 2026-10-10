import { test } from "node:test";
import assert from "node:assert/strict";
import { anglesOf, guessLang, offerLines, shortProductName, turkishDrafts } from "../dtc/adCopy.ts";
import { audienceOf, turkeyTargeting } from "../dtc/audience.ts";
import type { ArchivedAd } from "../dtc/adLibrary.ts";

const ad = (id: string, rows: [string, number, number][], country = "FR", platforms = ["facebook", "instagram"]): ArchivedAd => ({
  id,
  publisher_platforms: platforms,
  age_country_gender_reach_breakdown: [{ country, age_gender_breakdowns: rows.map(([age_range, female, male]) => ({ age_range, female, male, unknown: 0 })) }],
});

test("audienceOf: cinsiyet payı, yaş dağılımı, %70 çekirdek yaş, platform ve ülke", () => {
  const a = audienceOf([
    ad("1", [["18-24", 50, 10], ["25-34", 300, 60], ["35-44", 250, 50], ["45-54", 100, 20], ["55-64", 30, 10], ["65+", 10, 10]]),
    ad("2", [["25-34", 100, 20], ["35-44", 80, 20]], "ES", ["instagram"]),
  ])!;
  assert.equal(a.total, 1120);
  assert.equal(a.female, 920);
  assert.deepEqual(a.ages.map((x) => x.range), ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]);
  assert.deepEqual(a.core && [a.core.min, a.core.max], [25, 44]); // 25–34 + 35–44 = %79
  assert.deepEqual(a.platforms, [
    { name: "instagram", share: 1 },
    { name: "facebook", share: 0.5 },
  ]);
  assert.equal(a.countries[0].code, "FR");
  assert.equal(audienceOf([{ id: "x" }]), null);

  const t = turkeyTargeting(a);
  assert.equal(t.gender, "Kadın");
  assert.deepEqual([t.ageMin, t.ageMax], [25, 44]);
  assert.deepEqual(t.placements, ["Instagram Reels", "Instagram Akış ve Hikâyeler", "Facebook Akış", "Facebook Reels"]);
});

test("turkeyTargeting: karışık kitlede cinsiyet daraltılmaz; 65+ üst sınırsız", () => {
  const t = turkeyTargeting(audienceOf([ad("1", [["55-64", 50, 45], ["65+", 60, 50]])])!);
  assert.equal(t.gender, "Tümü");
  assert.deepEqual([t.ageMin, t.ageMax], [55, null]);
  // 3+ platformda birden: rakip otomatik yerleşim kullanıyor.
  const auto = turkeyTargeting(audienceOf([ad("1", [["25-34", 10, 10]], "FR", ["facebook", "instagram", "audience_network", "threads"])])!);
  assert.deepEqual(auto.placements, ["Advantage+ yerleşimler (rakip de otomatik yerleşim kullanıyor)"]);
});

test("guessLang ve anglesOf: çok dilli reklam metinleri", () => {
  assert.equal(guessLang("¿Buscas un regalo que sea un poco más especial? Envío gratis para todos los pedidos"), "es");
  assert.equal(guessLang("Op zoek naar een cadeau dat net iets specialer voelt? Gratis verzending voor jou"), "nl");
  assert.equal(guessLang("Get yours now with free shipping and our 30-day guarantee"), "en");
  assert.equal(guessLang("🔥🔥"), null);
  assert.deepEqual(anglesOf(["Un regalo que no olvidarán", "Le cadeau parfait", "Finally, no more back pain"]), ["gift", "problem"]);
});

test("turkishDrafts: rakibin açıları önce, teklif satırları reklamlardan; teklif yoksa güven veren varsayılanlar", () => {
  assert.deepEqual(offerLines({ adOffers: { discounts: [40], freeShipping: 3, bundle: 0, guarantee: 0 }, storeOffer: null }), ["%40 indirim", "Ücretsiz kargo"]);
  assert.deepEqual(offerLines({ adOffers: null, storeOffer: null }), ["Kapıda ödeme imkânı", "Hızlı kargo"]);
  const d = turkishDrafts({ product: "Galaxy Projector", angles: ["gift"], adOffers: { discounts: [33], freeShipping: 1, guarantee: 23 }, storeOffer: null });
  assert.deepEqual(d.map((x) => x.angle), ["gift", "problem", "social", "beforeAfter", "offer"]);
  assert.match(d[0].primary, /Galaxy Projector/);
  assert.match(d[0].primary, /✅ %33 indirim\n✅ Ücretsiz kargo\n✅ 30 gün koşulsuz iade/);
  assert.equal(d[4].headline, "%33 indirim: Galaxy Projector");
  assert.equal(shortProductName("Cosmora Galaxy Projector — Multi-Slide Star Night Light"), "Cosmora Galaxy Projector");
  assert.equal(shortProductName("BRASAPRO - LIMPIADOR DE PARRILLA"), "BRASAPRO LIMPIADOR DE PARRILLA");
  assert.equal(shortProductName("CYCLAIR PRO® | Lunettes de vélo photochromiques"), "CYCLAIR PRO");
  assert.equal(shortProductName("Posture Corrector Pro Max Ultra Edition"), "Posture Corrector Pro Max");
});
