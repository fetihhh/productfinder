// Arama ile mağaza keşfi: ürün + satın alma niyeti ifadeleriyle (AB dilleri ve Türkçe) web araması yapılır, sonuçlardaki
// siteler toplanır. Pazaryerleri, sosyal ağlar ve barındırma alan adları atılır; geriye kalanlar ancak DNS'te Shopify,
// ikas ya da Ticimax olduğu doğrulanırsa mağaza olarak eklenir (scripts/searchDiscovery.ts).
import { classifyDomain } from "../lib/domain.ts";

/** Dropshipping'de sık satılan ürünler (İngilizce; AB dillerindeki niyet ifadeleriyle birleştirilir). */
export const SEARCH_PRODUCTS = [
  "posture corrector", "neck massager", "back stretcher", "knee brace", "foot massager", "scalp massager", "red light therapy",
  "galaxy projector", "sunset lamp", "smart bird feeder", "cordless spin scrubber", "portable blender", "electric lunch box",
  "pet hair remover", "dog paw cleaner", "cat water fountain", "slow feeder dog bowl", "dog anxiety bed", "cat scratcher",
  "hair growth serum", "ice roller face", "gua sha", "teeth whitening kit", "heated eyelash curler", "lymphatic drainage",
  "magnetic phone mount", "mini projector", "wireless charging station", "car vacuum cleaner", "car seat gap filler",
  "baby white noise machine", "toddler busy board", "kids drawing tablet", "posture pillow", "cervical pillow",
  "anti snoring device", "sleep mask bluetooth", "heated blanket", "waterproof hiking shoes", "compression socks",
  "resistance bands set", "ab roller wheel", "massage gun", "plantar fasciitis insoles", "vegetable chopper",
  "knife sharpener", "oil sprayer bottle", "electric grill cleaner", "herb scissors", "milk frother",
];

/** Satın alma niyeti (dil başına). */
export const SEARCH_INTENTS: Record<string, string> = {
  en: "buy online free shipping",
  es: "comprar envío gratis",
  fr: "acheter livraison gratuite",
  de: "kaufen kostenloser Versand",
  it: "acquista spedizione gratuita",
};

/** Türkiye pazarı: Türkçe ürün adları + niyet (Türk mağazaları; ikas/Ticimax/Shopify). */
export const SEARCH_PRODUCTS_TR = [
  "duruş düzeltici korse", "boyun masaj aleti", "ayak masaj aleti", "galaksi projektör gece lambası", "gün batımı lambası",
  "şarjlı temizlik fırçası", "taşınabilir blender", "evcil hayvan tüy toplayıcı", "kedi su pınarı", "köpek yavaş mama kabı",
  "saç çıkarıcı serum", "yüz buz rulosu", "diş beyazlatma seti", "manyetik telefon tutucu", "mini projeksiyon cihazı",
  "kablosuz şarj istasyonu", "araç süpürgesi", "bebek beyaz gürültü cihazı", "ortopedik boyun yastığı", "horlama önleyici",
  "bluetooth uyku bandı", "elektrikli battaniye", "direnç bandı seti", "masaj tabancası", "ortopedik tabanlık",
  "sebze doğrayıcı", "bıçak bileyici", "yağ sprey şişesi", "süt köpürtücü", "ızgara temizleme fırçası",
];
export const SEARCH_INTENTS_TR = ["satın al ücretsiz kargo", "kapıda ödeme", "online mağaza"];

/** Aranacak ifadeler: her ürün için sırayla bir dilin niyetiyle (çeşitlilik), Türkçe ürünler üç niyetle. */
export function discoveryQueries(): string[] {
  const langs = Object.keys(SEARCH_INTENTS);
  const out: string[] = [];
  SEARCH_PRODUCTS.forEach((p, i) => {
    out.push(`${p} ${SEARCH_INTENTS[langs[i % langs.length]]}`);
    out.push(`${p} ${SEARCH_INTENTS[langs[(i + 2) % langs.length]]}`);
    out.push(`${p} ${SEARCH_INTENTS[langs[(i + 4) % langs.length]]}`);
  });
  for (const p of SEARCH_PRODUCTS_TR) for (const intent of SEARCH_INTENTS_TR) out.push(`${p} ${intent}`);
  return [...new Set(out)];
}

/** Arama sonucunda mağaza olmayan, bilinen büyük siteler (pazaryeri listesinde olmayanlar). */
const BIG_SITES = new Set([
  "wikipedia.org", "youtube.com", "reddit.com", "pinterest.com", "quora.com", "medium.com", "nytimes.com", "forbes.com",
  "healthline.com", "webmd.com", "mayoclinic.org", "nih.gov", "apple.com", "google.com", "microsoft.com", "samsung.com",
  "ikea.com", "decathlon.com", "decathlon.fr", "decathlon.es", "lidl.de", "lidl.fr", "aldi.de", "mediamarkt.de",
  "trendyol.com", "hepsiburada.com", "n11.com", "ciceksepeti.com", "akakce.com", "cimri.com", "pazarama.com",
  "eksisozluk.com", "sikayetvar.com", "donanimhaber.com", "shopify.com", "wix.com", "tiktok.com", "instagram.com", "facebook.com",
]);

/** Sonuç adreslerinden aday mağaza alan adları (pazaryeri, sosyal ağ, barındırma ve büyük siteler atılır). */
export function candidateDomains(urls: string[]): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    let host: string;
    try {
      host = new URL(u).hostname;
    } catch {
      continue;
    }
    const v = classifyDomain(host);
    if (!v.ok || BIG_SITES.has(v.domain)) continue;
    // Haber/blog/forum alt alan adları ve devlet/eğitim siteleri mağaza değildir.
    if (/\.(gov|edu|ac)(\.[a-z]{2})?$/.test(v.domain)) continue;
    out.add(v.domain);
  }
  return [...out];
}
