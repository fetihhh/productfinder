import { test } from "node:test";
import assert from "node:assert/strict";
import { nicheOf } from "../dtc/niche.ts";
import { adOffers, productOffer } from "../dtc/offers.ts";
import { timingFor, type TimingMember } from "../dtc/timing.ts";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const m = (over: Partial<TimingMember> = {}): TimingMember => ({ firstProductAt: daysAgo(20), activeAds: 0, totalAds: 0, newAds14d: 0, adStage: "none", stockDrops: 0, ...over });

test("nicheOf: çok dilli anahtar kelimeler, sıra önemli (köpek şampuanı evcil hayvandır)", () => {
  assert.equal(nicheOf("Dog Shampoo for Sensitive Skin"), "pet");
  assert.equal(nicheOf("Rascador Arco con Bola Giratoria para Gatos"), "pet");
  assert.equal(nicheOf("Bálsamo de Sebo y Miel"), "beauty");
  assert.equal(nicheOf("Massaggiatore Cervicale 4D per Collo e Spalle"), "health");
  assert.equal(nicheOf("BRASAPRO - LIMPIADOR DE PARRILLA"), "kitchen");
  assert.equal(nicheOf("Cosmora Galaxy Projector — Multi-Slide Star Night Light"), "home");
  assert.equal(nicheOf("Sac à dos cabine Cabinéo"), "fashion"); // sırt çantası; "dos" (sırt) sağlık sayılmaz
  assert.equal(nicheOf("City Nights Idle Tee"), "fashion");
  assert.equal(nicheOf("Obsidian"), "other");
  assert.equal(nicheOf("Gadget", "Pet Supplies"), "pet");
});

test("productOffer: indirim, ücretsiz kargo, garanti ve paket (çok dilli)", () => {
  assert.deepEqual(productOffer("<p>Envío gratis a toda España. 30 días de garantía.</p>", ["1 unidad", "2 unidades"], 29.99, 59.99), {
    discountPct: 50,
    freeShipping: true,
    guaranteeDays: 30,
    bundle: true,
  });
  assert.deepEqual(productOffer("<p>Free worldwide shipping · 60-day money-back guarantee</p>", ["Default Title"], 39, null), {
    discountPct: null,
    freeShipping: true,
    guaranteeDays: 60,
    bundle: false,
  });
  assert.equal(productOffer("Livraison offerte. Garantie satisfait 90 jours", [], 10, 9).guaranteeDays, 90);
  assert.equal(productOffer(null, ["Buy 2 Get 1 Free"], null, null).bundle, true);
  assert.equal(productOffer("Achetez-en 1", ["Noir / M"], null, null).bundle, false);
});

test("adOffers: reklam metinlerinde en sık indirim, kargo, paket ve aciliyet", () => {
  const o = adOffers([
    "🔥 -50% solo hoy! Envío gratis",
    "50% OFF + free shipping",
    "2x1 en todos los packs · últimas unidades",
    "Save 40% today only",
  ]);
  assert.deepEqual(o.discounts, [50, 40]);
  assert.equal(o.freeShipping, 2);
  assert.equal(o.bundle, 1);
  assert.equal(o.urgency, 3);
  assert.equal(o.total, 4);
});

test("timingFor: erken, zirvede, doymuş, sönüyor, kanıt yok", () => {
  assert.equal(timingFor([m({ activeAds: 3, totalAds: 5, adStage: "scaling" })], NOW).timing, "early");
  assert.equal(timingFor([m({ stockDrops: 2 }), m()], NOW).timing, "early");
  assert.equal(timingFor([m(), m(), m(), m({ activeAds: 1, totalAds: 1 })], NOW).timing, "peak");
  assert.equal(timingFor([m({ firstProductAt: daysAgo(45), activeAds: 6, totalAds: 20, adStage: "proven" }), m()], NOW).timing, "peak");
  assert.equal(timingFor(Array.from({ length: 8 }, () => m()), NOW).timing, "saturated");
  assert.equal(timingFor(Array.from({ length: 5 }, () => m({ activeAds: 2, totalAds: 2 })), NOW).timing, "saturated");
  assert.equal(timingFor([m({ totalAds: 12, adStage: "stopped" })], NOW).timing, "fading");
  assert.equal(timingFor([m()], NOW).timing, "unproven");
  assert.equal(timingFor([m({ firstProductAt: daysAgo(100), activeAds: 2, totalAds: 4, adStage: "testing" })], NOW).timing, "peak");
  assert.match(timingFor([m({ activeAds: 1, totalAds: 1 })], NOW).reason, /^1 mağaza · 1 reklamcı · 20 gündür satılıyor/);
});
