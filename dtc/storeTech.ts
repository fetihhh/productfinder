// Marka künyesi: mağaza ana sayfasının HTML'inden (mağaza kontrolünde zaten okunur) hangi reklam/izleme kodlarının,
// yorum, kapıda ödeme, upsell ve sohbet uygulamalarının, ödeme yöntemlerinin kullanıldığı; iletişim bilgileri; kargo
// süresi ve iade vaadi. İzleme kodu = o kanalda reklam veriyor ya da vermeye hazırlanıyor demektir.

export type StoreTech = {
  /** Reklam / izleme kodları: Meta, TikTok, Google Ads, Snapchat, Pinterest… */
  pixels: string[];
  reviews: string[];
  cod: string[];
  upsell: string[];
  chat: string[];
  payments: string[];
  theme: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  /** Vaat edilen teslimat süresi (gün aralığı); uzun süre (≥ 10 gün) Çin'den gönderim işaretidir. */
  shippingDays: [number, number] | null;
  /** İade / para iadesi garantisi (gün). */
  returnDays: number | null;
  /** Kapıda ödeme metinde geçiyor (uygulama olmadan da). */
  codText: boolean;
  languages: string[];
  socials: string[];
};

type Rule = [string, RegExp];

const PIXELS: Rule[] = [
  ["Meta (Facebook) pikseli", /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init|facebook-pixel|"facebook_pixel_id"|meta-pixel/i],
  ["TikTok pikseli", /analytics\.tiktok\.com|ttq\.load\(|tiktok-pixel|"tiktok_pixel/i],
  ["Google Ads", /['"]AW-\d{6,}|googleadservices\.com|google_conversion/i],
  ["Google Analytics", /['"]G-[A-Z0-9]{6,12}['"]|google-analytics\.com\/analytics|gtag\/js\?id=G-/i],
  ["Snapchat pikseli", /sc-static\.net\/scevent|snaptr\(/i],
  ["Pinterest etiketi", /s\.pinimg\.com\/ct\/core\.js|pintrk\(/i],
  ["Microsoft Ads", /bat\.bing\.com\/bat\.js|uetq/i],
  ["Taboola", /cdn\.taboola\.com|_tfa\.push/i],
  ["Klaviyo (e-posta)", /static\.klaviyo\.com|klaviyo\.js/i],
  ["Hotjar", /static\.hotjar\.com/i],
  ["Microsoft Clarity", /clarity\.ms\/tag/i],
];
const REVIEWS: Rule[] = [
  ["Judge.me", /judge\.me|judgeme/i],
  ["Loox", /loox\.io|loox-rating/i],
  ["Yotpo", /yotpo\.com|yotpo-widget/i],
  ["Okendo", /okendo/i],
  ["Stamped", /stamped\.io/i],
  ["Trustpilot", /widget\.trustpilot\.com|trustpilot/i],
  ["Reviews.io", /reviews\.io|reviewsio/i],
  ["Ali Reviews", /alireviews|ali-reviews/i],
  ["Ryviu", /ryviu/i],
  ["Opinew", /opinew/i],
  ["Rivyo", /rivyo/i],
  ["Kudobuzz", /kudobuzz/i],
];
const COD: Rule[] = [
  ["Releasit COD", /releasit/i],
  ["EasySell COD", /easysell/i],
  ["COD Form", /cod[-_ ]?form|codform/i],
];
const UPSELL: Rule[] = [
  ["Kaching Bundles", /kaching/i],
  ["ReConvert", /reconvert/i],
  ["Vitals", /vitals\.(?:co|app)|vitals-app/i],
  ["Zipify", /zipify/i],
  ["Bundler", /bundler\.app|bundler-target/i],
  ["Wiser", /wiser-|wiser\.app/i],
  ["Selleasy", /selleasy/i],
  ["Sticky Add to Cart", /sticky[-_ ]?add[-_ ]?to[-_ ]?cart|sticky-atc/i],
  ["Countdown / aciliyet sayacı", /countdown[-_ ]?timer|hurrify|essential[-_ ]?countdown/i],
];
const CHAT: Rule[] = [
  ["Tidio", /tidio/i],
  ["Gorgias", /gorgias/i],
  ["Zendesk", /zdassets|zendesk/i],
  ["Crisp", /client\.crisp\.chat/i],
  ["Shopify Inbox", /shopify-chat|inbox\.shopify/i],
];
const PAYMENTS: Rule[] = [
  ["Klarna", /klarna/i],
  ["PayPal", /paypal/i],
  ["Afterpay / Clearpay", /afterpay|clearpay/i],
  ["Shop Pay", /shop[-_ ]?pay|shopify_pay/i],
  ["Apple Pay", /apple[-_ ]?pay/i],
  ["Google Pay", /google[-_ ]?pay/i],
  ["Scalapay", /scalapay/i],
  ["Alma", /getalma|alma-widget/i],
  ["Bizum", /bizum/i],
];

const match = (html: string, rules: Rule[]) => rules.filter(([, re]) => re.test(html)).map(([name]) => name);

const DAYS = "(?:business\\s+|working\\s+)?(?:days|días|dias|jours|tage|werktage|giorni|dagen|dni)";
const SHIP_RANGE = new RegExp(`(\\d{1,2})\\s*(?:-|–|to|a|à|bis|al)\\s*(\\d{1,2})\\s*${DAYS}`, "gi");
const RETURN = new RegExp(
  `(\\d{2,3})\\s*(?:-|\\s)?\\s*${DAYS}?\\s*(?:-|\\s)?(?:money[- ]back|return|returns|retour|retours|remboursement|devoluci[oó]n|reembolso|rückgabe|geld[- ]zurück|reso|rimborso|garantie|garantía|garanzia|guarantee)`,
  "i",
);
const RETURN_BEFORE = new RegExp(
  `(?:money[- ]back|return|retour|remboursement|devoluci[oó]n|reembolso|rückgabe|geld[- ]zurück|reso|rimborso|garantie|garantía|garanzia|guarantee)[^.\\d]{0,30}?(\\d{2,3})\\s*${DAYS}`,
  "i",
);
const COD_TEXT = /contra\s*reembolso|pago\s+contra\s+entrega|paga\s+al\s+recibir|paiement\s+à\s+la\s+livraison|pagamento\s+alla\s+consegna|nachnahme|cash\s+on\s+delivery|betaling\s+bij\s+levering|pagamento\s+na\s+entrega|kapıda\s+ödeme/i;

/** Ana sayfa HTML'inden marka künyesi. */
export function storeTech(html: string): StoreTech {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  let ship: [number, number] | null = null;
  for (const m of text.matchAll(SHIP_RANGE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 1 && b >= a && b <= 60 && (!ship || b > ship[1])) ship = [a, b];
  }
  const ret = text.match(RETURN) ?? text.match(RETURN_BEFORE);
  const retDays = ret ? Number(ret[1]) : null;
  const theme = html.match(/Shopify\.theme\s*=\s*\{[^}]*?"name"\s*:\s*"([^"]{1,60})"/)?.[1] ?? null;
  const email = html.match(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/)?.[1]?.toLowerCase() ?? null;
  const phone = html.match(/href="tel:([+0-9 ()./-]{7,20})"/)?.[1]?.trim() ?? null;
  const whatsapp = html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{8,15})/)?.[1] ?? null;
  const languages = [...new Set([...html.matchAll(/hreflang="([a-z]{2})(?:-[A-Za-z]{2})?"/g)].map((m) => m[1]))].filter((l) => l !== "x").slice(0, 12);
  const socials = (
    [
      ["Facebook", /facebook\.com\/(?!sharer|share|tr\?|plugins|dialog)[A-Za-z0-9.]{3,}/],
      ["Instagram", /instagram\.com\/(?!p\/|reel)[A-Za-z0-9._]{2,}/],
      ["TikTok", /tiktok\.com\/@[A-Za-z0-9._]{2,}/],
      ["YouTube", /youtube\.com\/(?:@|channel\/|c\/)[A-Za-z0-9_-]{2,}/],
      ["Pinterest", /pinterest\.[a-z.]+\/(?!pin\/create)[A-Za-z0-9_]{3,}/],
      ["X (Twitter)", /(?:twitter|x)\.com\/(?!intent|share)[A-Za-z0-9_]{2,}/],
    ] as Rule[]
  )
    .filter(([, re]) => re.test(html))
    .map(([n]) => n);
  return {
    pixels: match(html, PIXELS),
    reviews: match(html, REVIEWS),
    cod: match(html, COD),
    upsell: match(html, UPSELL),
    chat: match(html, CHAT),
    payments: match(html, PAYMENTS),
    theme,
    email,
    phone,
    whatsapp,
    shippingDays: ship,
    returnDays: retDays && retDays >= 7 && retDays <= 365 ? retDays : null,
    codText: COD_TEXT.test(text),
    languages,
    socials,
  };
}
