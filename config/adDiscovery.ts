// Reklam Kütüphanesi'nden mağaza keşfi: AB'de yayındaki reklamlarda aranan ifadeler. Dropshipping reklamlarının sık
// kullandığı teklif, ürün ve niş ifadeleri (AB dilleri). Her çalıştırmada sıradaki AD_DISCOVERY_TERMS_PER_RUN ifade aranır;
// liste iki günde bir baştan döner.

export const AD_DISCOVERY_TERMS: string[] = [
  // İngilizce
  "free shipping today",
  "50% off today",
  "limited stock",
  "perfect gift for her",
  "perfect gift for him",
  "back pain relief",
  "neck pain",
  "every dog owner",
  "every cat owner",
  "kitchen gadget",
  "sleep better tonight",
  "hair growth",
  "posture corrector",
  "night light projector",
  "cordless massager",
  // İspanyolca
  "envío gratis",
  "últimas unidades",
  "regalo perfecto",
  "dolor de espalda",
  "tu perro",
  "paga al recibir",
  // Fransızca
  "livraison gratuite",
  "stock limité",
  "cadeau idéal",
  "mal de dos",
  "votre chien",
  "paiement à la livraison",
  // Almanca
  "kostenloser Versand",
  "nur heute",
  "perfektes Geschenk",
  "Rückenschmerzen",
  "dein Hund",
  // İtalyanca
  "spedizione gratuita",
  "offerta limitata",
  "regalo perfetto",
  "mal di schiena",
  "pagamento alla consegna",
  // Felemenkçe
  "gratis verzending",
  "perfect cadeau",
  "rugpijn",
  "op = op",
  // Portekizce
  "portes grátis",
  "envio grátis",
  "presente perfeito",
  "dor nas costas",
  // Lehçe
  "darmowa dostawa",
  "idealny prezent",
  "ból pleców",
  // İsveççe / Danca
  "fri frakt",
  "gratis fragt",
  // Nişler (İngilizce): evcil hayvan, ev, mutfak, güzellik, sağlık, bebek, araba, fitness, gadget
  "dog owners love",
  "cat lovers",
  "pet hair",
  "home must have",
  "cleaning hack",
  "kitchen must have",
  "skincare routine",
  "anti aging",
  "hair loss",
  "pain relief",
  "better sleep",
  "new moms",
  "baby essentials",
  "car accessories",
  "home workout",
  "gadget of the year",
  "viral on tiktok",
  // Nişler (AB dilleri)
  "tu mascota",
  "tu hogar",
  "dolor de rodilla",
  "votre chat",
  "votre maison",
  "douleurs articulaires",
  "deine Katze",
  "dein Zuhause",
  "Nackenschmerzen",
  "la tua casa",
  "il tuo cane",
  "jouw huisdier",
  "o teu cão",
  "twój pies",
];

/** Bir çalıştırmada aranan ifade (ifade başına 1 istek, saniyede 1). */
export const AD_DISCOVERY_TERMS_PER_RUN = Number(process.env.AD_DISCOVERY_TERMS_PER_RUN) || 40;
/** Yalnızca son bu kadar günde yayına giren reklamlar (yeni reklamcılar). */
export const AD_DISCOVERY_DAYS = 45;
