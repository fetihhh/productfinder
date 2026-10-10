// Teklif analizi: mağazanın ürün sayfasındaki ve reklam metinlerindeki satış teklifleri (indirim, ücretsiz kargo,
// garanti, paket/çoklu alım, aciliyet). Aynı ürünü satan rakipleri karşılaştırmak ve kendi teklifini belirlemek için.
// Çok dilli (EN/ES/FR/DE/IT/PT) basit kalıplar; kesin değil, yön gösterir.

export type ProductOffer = {
  /** İndirim öncesi fiyata göre indirim (%). */
  discountPct: number | null;
  freeShipping: boolean;
  /** Para iadesi / memnuniyet garantisi (gün). */
  guaranteeDays: number | null;
  /** Paket / çoklu alım teklifi (varyant adlarında "2 Pack", "Buy 2" ya da açıklamada "2+1"). */
  bundle: boolean;
};

const FREE_SHIPPING =
  /free\s+(?:worldwide\s+|express\s+|standard\s+)?shipping|ships?\s+free|envío\s+gratis|envio\s+gr[aá]tis|livraison\s+(?:offerte|gratuite)|kostenloser\s+versand|versandkostenfrei|spedizione\s+gratuita/i;
const GUARANTEE =
  /(\d{2,3})[\s-]*(?:day|días|dias|jours|tage|giorni)s?[\s-]*(?:money[\s-]*back|satisfaction|risk[\s-]*free|garant[ií]a|garantie|garanzia|guarantee|de\s+garant[ií]a|satisfait)/i;
const GUARANTEE_REV = /(?:guarantee|garant[ií]a|garantie|garanzia)[^.\d]{0,30}(\d{2,3})\s*(?:day|días|dias|jours|tage|giorni)/i;
const BUNDLE =
  /\b(?:buy\s*\d+\s*(?:get|\+)|\d\s*\+\s*\d\s*(?:free|gratis|offert)|\dx\d\b|[2-9]\s*(?:pack|pcs|pieces|unidades|uds|pièces|stück|pezzi)\b|bundle|lot\s+de\s+\d|set\s+of\s+\d|2\s*(?:por|pour|für|per)\s*1)/i;

/** Ürün açıklaması (HTML), varyant adları ve fiyatlardan teklif. */
export function productOffer(bodyHtml: string | null, variantTitles: string[], price: number | null, compareAt: number | null): ProductOffer {
  const text = (bodyHtml ?? "").replace(/<[^>]+>/g, " ");
  const g = text.match(GUARANTEE) ?? text.match(GUARANTEE_REV);
  const days = g ? Number(g[1]) : null;
  return {
    discountPct: price !== null && compareAt !== null && compareAt > price ? Math.round((1 - price / compareAt) * 100) : null,
    freeShipping: FREE_SHIPPING.test(text),
    guaranteeDays: days !== null && days >= 7 && days <= 365 ? days : null,
    bundle: variantTitles.some((v) => BUNDLE.test(v)) || BUNDLE.test(text),
  };
}

export type AdOffers = {
  total: number;
  /** Reklamlarda geçen indirim oranları (%), en sık geçenler önce. */
  discounts: number[];
  freeShipping: number;
  bundle: number;
  urgency: number;
  guarantee: number;
};

const PERCENT = /(?:-|−)?\s?(\d{2})\s?%\s*(?:off|de\s+descuento|dto|de\s+réduction|rabatt|sconto|desconto)?/gi;
const URGENCY = /limited|today\s+only|last\s+(?:chance|units|day)|ends\s+(?:today|soon|tonight)|selling\s+fast|almost\s+gone|últimas?\s+unidades|sólo\s+hoy|solo\s+hoy|stock\s+limitado|dernières?\s+pièces|aujourd'hui\s+seulement|nur\s+heute|solo\s+oggi|ultimi\s+pezzi/i;

/** Reklam metinlerinde öne çıkan teklifler. */
export function adOffers(texts: string[]): AdOffers {
  const counts = new Map<number, number>();
  let freeShipping = 0;
  let bundle = 0;
  let urgency = 0;
  let guarantee = 0;
  for (const t of texts) {
    const seen = new Set<number>();
    for (const m of t.matchAll(PERCENT)) {
      const n = Number(m[1]);
      if (n >= 10 && n <= 90 && !seen.has(n)) {
        seen.add(n);
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    if (FREE_SHIPPING.test(t)) freeShipping++;
    if (BUNDLE.test(t)) bundle++;
    if (URGENCY.test(t)) urgency++;
    if (GUARANTEE.test(t) || GUARANTEE_REV.test(t)) guarantee++;
  }
  const discounts = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]).slice(0, 3).map(([n]) => n);
  return { total: texts.length, discounts, freeShipping, bundle, urgency, guarantee };
}
