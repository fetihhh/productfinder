// Türkiye için reklam metni taslakları: kazanan reklamların açısı (sorun-çözüm, hediye, önce-sonra, sosyal kanıt, yenilik)
// ve teklifleri (indirim, ücretsiz kargo, paket, garanti) Türkçe şablonlara dökülür. Ücretli yapay zekâ kullanılmaz;
// taslaklar başlangıç noktasıdır, ürünün gerçek faydası ve kendi teklifinizle düzenlenmelidir.
import type { AdOffers, ProductOffer } from "./offers.ts";

/** Reklam metninin dili (basit sık kelime sayımı); emin değilse null. */
export function guessLang(text: string): string | null {
  const words = ` ${text.toLowerCase().replace(/[^\p{L}\s']/gu, " ")} `;
  const sets: Record<string, string[]> = {
    en: ["the", "and", "your", "you", "with", "for", "this", "our", "get", "now"],
    es: ["el", "la", "los", "las", "con", "para", "tu", "que", "por", "envío", "del", "una"],
    fr: ["le", "la", "les", "avec", "pour", "votre", "vous", "des", "une", "est", "livraison", "et"],
    de: ["der", "die", "das", "und", "mit", "für", "dein", "ihr", "ist", "nicht", "jetzt", "versand"],
    it: ["il", "lo", "gli", "con", "per", "tuo", "che", "una", "della", "spedizione", "è", "non"],
    nl: ["de", "het", "een", "met", "voor", "jouw", "je", "niet", "van", "en", "nu", "gratis"],
    pt: ["o", "os", "com", "para", "seu", "sua", "você", "não", "uma", "frete", "do", "da"],
    pl: ["i", "w", "z", "na", "dla", "nie", "jest", "się", "twój", "dostawa", "teraz", "że"],
  };
  let best: [string, number] = ["", 0];
  for (const [lang, list] of Object.entries(sets)) {
    const n = list.reduce((s, w) => s + (words.split(` ${w} `).length - 1), 0);
    if (n > best[1]) best = [lang, n];
  }
  return best[1] >= 2 ? best[0] : null;
}

export type Angle = "problem" | "gift" | "beforeAfter" | "social" | "novelty";

const ANGLES: Record<Angle, RegExp> = {
  problem: /\b(pain|tired|struggle|stop|finally|no more|douleur|fatigu|enfin|fini|dolor|cansad|por fin|adiós|schmerz|müde|endlich|nie wieder|dolore|stanc|finalmente|basta|pijn|moe|eindelijk|dor|chega|ból|koniec)/i,
  gift: /\b(gift|present|cadeau|offrir|regalo|regalar|geschenk|schenken|regalare|kado|cadeaus?|presente|prezent|surprise|sorpresa|überrasch)/i,
  beforeAfter: /\b(before|after|results?|résultats?|avant|après|antes|después|resultados?|vorher|nachher|ergebnis|prima|dopo|risultat|voor en na|resultaat|przed|po|efekt)/i,
  social: /\b(customers?|reviews?|clients?|clientes|kunden|bewertung|recensioni|klanten|klientów|opinie|★|⭐|5 stars?|sold|vendus|vendidos|verkauft|venduti|verkocht|sprzedan|\d{2,}[.,]?\d*\s*(?:k|000)\+?)/i,
  novelty: /\b(viral|tiktok|trend|nouveau|nouveauté|nuevo|novedad|neu|nuovo|novità|nieuw|novo|nowość|innovat|revolution|révolution|revolucion)/i,
};

/** Kazanan reklam metinlerinde hangi açıların kullanıldığı (en sık önce). */
export function anglesOf(texts: string[]): Angle[] {
  const counts = (Object.keys(ANGLES) as Angle[]).map((k) => [k, texts.filter((t) => ANGLES[k].test(t)).length] as const);
  return counts.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

export const ANGLE_LABELS: Record<Angle, string> = {
  problem: "Sorun → çözüm",
  gift: "Hediye",
  beforeAfter: "Önce / sonra",
  social: "Sosyal kanıt",
  novelty: "Yenilik / viral",
};

export type CopyDraft = { angle: Angle | "offer"; label: string; hook: string; primary: string; headline: string };

export type DraftInput = {
  product: string;
  angles: Angle[];
  adOffers: Partial<AdOffers> | null;
  storeOffer: ProductOffer | null;
};

/** Teklif satırları: rakiplerin reklamında ve ürün sayfasında görülen teklifler (yoksa Türkiye'de güven veren varsayılanlar). */
export function offerLines(o: Pick<DraftInput, "adOffers" | "storeOffer">): string[] {
  const lines: string[] = [];
  const discount = o.adOffers?.discounts?.[0] ?? o.storeOffer?.discountPct ?? null;
  if (discount) lines.push(`%${discount} indirim`);
  if ((o.adOffers?.freeShipping ?? 0) > 0 || o.storeOffer?.freeShipping) lines.push("Ücretsiz kargo");
  if ((o.adOffers?.bundle ?? 0) > 0 || o.storeOffer?.bundle) lines.push("2 al, 1'i bizden");
  const g = o.storeOffer?.guaranteeDays ?? ((o.adOffers?.guarantee ?? 0) > 0 ? 30 : null);
  if (g) lines.push(`${g} gün koşulsuz iade`);
  if (lines.length < 2) lines.push("Kapıda ödeme imkânı", "Hızlı kargo");
  return lines.slice(0, 4);
}

/** 4–5 Türkçe taslak: kazanan reklamların açıları önce, sonra teklif odaklı taslak. */
export function turkishDrafts(input: DraftInput): CopyDraft[] {
  const p = input.product.trim() || "[ürün adı]";
  const offers = offerLines(input);
  const bullets = offers.map((o) => `✅ ${o}`).join("\n");
  const top = offers[0];
  const build: Record<Angle, () => CopyDraft> = {
    problem: () => ({
      angle: "problem",
      label: ANGLE_LABELS.problem,
      hook: "Hâlâ [sorun] ile mi uğraşıyorsunuz? 😩",
      primary: `Hâlâ [sorun] ile mi uğraşıyorsunuz? 😩\n\n${p} ile [fayda] artık dakikalar içinde.\n\n${bullets}\n\n👉 Stoklar sınırlı, hemen sipariş verin.`,
      headline: `${p}: [sorun]'a son`,
    }),
    gift: () => ({
      angle: "gift",
      label: ANGLE_LABELS.gift,
      hook: "Unutulmayacak bir hediye arıyorsanız 🎁",
      primary: `Sevdiklerinize unutamayacakları bir hediye 🎁\n\n${p}, hem şık hem kullanışlı. Paketinden çıktığı an fark edilecek.\n\n${bullets}\n\n👉 Özel günlerden önce sipariş verin.`,
      headline: `Mükemmel hediye: ${p}`,
    }),
    beforeAfter: () => ({
      angle: "beforeAfter",
      label: ANGLE_LABELS.beforeAfter,
      hook: "Öncesi 😕 → Sonrası 😍",
      primary: `Öncesi 😕 → Sonrası 😍\n\n${p} ile farkı ilk kullanımda görün.\n\n${bullets}\n\n👉 Kendiniz deneyin.`,
      headline: `${p}: farkı ilk günden görün`,
    }),
    social: () => ({
      angle: "social",
      label: ANGLE_LABELS.social,
      hook: "Avrupa'da çok konuşulan ürün artık Türkiye'de 🇹🇷",
      primary: `Avrupa'da çok konuşulan ${p} artık Türkiye'de 🇹🇷\n\nNeden bu kadar sevildiğini kendiniz görün.\n\n${bullets}\n\n👉 Şimdi sipariş verin.`,
      headline: `${p} artık Türkiye'de`,
    }),
    novelty: () => ({
      angle: "novelty",
      label: ANGLE_LABELS.novelty,
      hook: "Sosyal medyada herkesin konuştuğu ürün 👀",
      primary: `Sosyal medyada herkesin konuştuğu ${p} 👀\n\nBir kez deneyen vazgeçemiyor.\n\n${bullets}\n\n👉 Tükenmeden alın.`,
      headline: `Herkesin konuştuğu ${p}`,
    }),
  };
  const order: Angle[] = [...input.angles, ...(["problem", "gift", "social", "beforeAfter", "novelty"] as Angle[]).filter((a) => !input.angles.includes(a))];
  const drafts = order.slice(0, 4).map((a) => build[a]());
  drafts.push({
    angle: "offer",
    label: "Teklif odaklı",
    hook: `${top} 🔥`,
    primary: `🔥 ${p}\n\n${bullets}\n\nSınırlı süre. 👉 Hemen sipariş verin.`,
    headline: `${top}: ${p}`,
  });
  return drafts;
}
