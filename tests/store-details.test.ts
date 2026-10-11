import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptionBullets, mergeDetail, productDetail, weightLabel } from "../dtc/productDetail.ts";
import { nicheOfStore } from "../dtc/niche.ts";
import { storeTech } from "../dtc/storeTech.ts";

test("storeTech: izleme kodları, uygulamalar, ödeme, iletişim, kargo ve iade vaadi", () => {
  const html = `<html><head>
    <script>Shopify.theme = {"name":"Dawn","id":1,"theme_store_id":887};</script>
    <script src="https://connect.facebook.net/en_US/fbevents.js"></script><script>fbq('init', '123');</script>
    <script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234XYZ"></script><script>gtag('config','AW-1234567890');</script>
    <script src="https://cdn.judge.me/widget.js"></script><script src="https://cdn.releasit.com/cod.js"></script>
    <script src="https://cdn.kaching.app/bundles.js"></script><link rel="alternate" hreflang="es-ES" href="/es"><link rel="alternate" hreflang="fr" href="/fr">
    </head><body>
    <p>Envío en 7-15 días hábiles. Garantía de devolución de 30 días.</p><p>Pago contra reembolso disponible</p>
    <img alt="klarna"><img alt="paypal">
    <a href="mailto:Hola@Brand.es">Contacto</a><a href="https://wa.me/34600111222">WhatsApp</a>
    <a href="https://instagram.com/brand">IG</a><a href="https://www.tiktok.com/@brand">TT</a><a href="https://www.facebook.com/sharer.php?u=x">share</a>
    </body></html>`;
  const t = storeTech(html);
  assert.deepEqual(t.pixels, ["Meta (Facebook) pikseli", "TikTok pikseli", "Google Ads", "Google Analytics"]);
  assert.deepEqual(t.reviews, ["Judge.me"]);
  assert.deepEqual(t.cod, ["Releasit COD"]);
  assert.deepEqual(t.upsell, ["Kaching Bundles"]);
  assert.deepEqual(t.payments, ["Klarna", "PayPal"]);
  assert.equal(t.theme, "Dawn");
  assert.equal(t.email, "hola@brand.es");
  assert.equal(t.whatsapp, "34600111222");
  assert.deepEqual(t.shippingDays, [7, 15]);
  assert.equal(t.returnDays, 30);
  assert.equal(t.codText, true);
  assert.deepEqual(t.languages, ["es", "fr"]);
  assert.deepEqual(t.socials, ["Instagram", "TikTok"]);
});

test("productDetail ve mergeDetail: seçenekler, varyantlar, ağırlık; tükenen ve yeniden gelen varyant", () => {
  const d = productDetail({
    options: [{ name: "Color", values: ["Black", "Pink"] }],
    variants: [
      { title: "Black", price: "29.99", compare_at_price: "59.99", available: true, grams: 350 },
      { title: "Pink", price: "29.99", compare_at_price: null, available: true, grams: 350 },
    ],
    images: [{ src: "a.jpg" }, { src: "b.jpg" }],
    body_html: "<ul><li>Relieves neck pain in 10 minutes</li><li>USB rechargeable battery</li></ul>",
  });
  assert.deepEqual(d.options, [{ name: "Color", values: ["Black", "Pink"] }]);
  assert.deepEqual(d.bullets, ["Relieves neck pain in 10 minutes", "USB rechargeable battery"]);
  assert.equal(d.variants[0].grams, 350);
  const day1 = mergeDetail(null, d, "2026-10-10");
  const soldPink = { ...d, variants: d.variants.map((v) => (v.title === "Pink" ? { ...v, available: false } : v)) };
  const day2 = mergeDetail(day1, soldPink, "2026-10-11");
  assert.deepEqual(day2.soldOut, { Pink: "2026-10-11" });
  assert.equal(day2.first, "2026-10-10");
  const day3 = mergeDetail(day2, d, "2026-10-12");
  assert.deepEqual(day3.restocked, { Pink: "2026-10-12" });
  assert.equal(weightLabel(350), "350 g");
  assert.equal(weightLabel(1500), "1,5 kg");
  assert.deepEqual(productDetail({ options: [{ name: "Title", values: ["Default Title"] }] }).options, []);
  assert.deepEqual(descriptionBullets(null), { bullets: [], text: "" });
});

test("nicheOfStore: öne çıkan ürün belirsizse mağazanın ürünlerinin oyu (en az 2 ve %40)", () => {
  assert.equal(nicheOfStore({ title: "Obsidian", productType: null }, [{ title: "Dog Bed" }, { title: "Cat Toy" }, { title: "Obsidian" }]), "pet");
  assert.equal(nicheOfStore({ title: "Obsidian", productType: null }, [{ title: "Dog Bed" }, { title: "Lamp" }]), "other");
  assert.equal(nicheOfStore({ title: "Neck Massager", productType: null }, [{ title: "Dog Bed" }, { title: "Cat Toy" }]), "health");
});
