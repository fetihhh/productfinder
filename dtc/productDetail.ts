// Ürün ayrıntıları (Shopify products.json, mağaza kontrolünde zaten okunur): seçenekler (renk/beden), varyantlar (fiyat,
// stok, ağırlık), fotoğraflar ve açıklamadaki maddeler. Kontroller arasında stoğu biten varyant "tükendi" olarak işaretlenir:
// en çok satan renk/beden çoğu zaman ilk tükenendir.
import { clip } from "../lib/text.ts";

type Json = Record<string, unknown>;

export type DetailVariant = { title: string; price: number | null; compareAt: number | null; available: boolean; grams: number | null };

export type ProductDetail = {
  options: { name: string; values: string[] }[];
  variants: DetailVariant[];
  images: string[];
  bullets: string[];
  text: string;
  /** Varyant adı → ilk tükendiği gün (kontroller arasında stokta → tükendi). */
  soldOut?: Record<string, string>;
  /** Varyant adı → yeniden stoğa girdiği gün. */
  restocked?: Record<string, string>;
  /** Ayrıntının ilk ve son kaydedildiği gün. */
  first?: string;
  last?: string;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Açıklamadan maddeler: liste öğeleri; yoksa paragraf/satır başları (en fazla 10, kısa ve anlamlı olanlar). */
export function descriptionBullets(html: string | null): { bullets: string[]; text: string } {
  if (!html) return { bullets: [], text: "" };
  const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const lis = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => clean(m[1]));
  const blocks = html
    .replace(/<\/(p|div|h[1-6])>|<br\s*\/?>/gi, "\n")
    .split("\n")
    .map(clean);
  const pick = (xs: string[]) => [...new Set(xs.filter((x) => x.length >= 8 && x.length <= 220))].slice(0, 10);
  const bullets = pick(lis.length >= 2 ? lis : blocks.filter((b) => /^[✓✔✅•★⭐🔥💡👉\-–]|^[A-ZÀ-Ü][^.!?]{6,90}[:：]/u.test(b) || b.length <= 120));
  return { bullets: bullets.map((b) => clip(b, 220)), text: clip(blocks.filter(Boolean).join("\n"), 1500) };
}

/** Shopify ürün nesnesinden ayrıntı. */
export function productDetail(p: Json): ProductDetail {
  const options = (Array.isArray(p.options) ? (p.options as Json[]) : [])
    .map((o) => ({
      name: typeof o.name === "string" ? clip(o.name, 40) : "",
      values: (Array.isArray(o.values) ? (o.values as unknown[]) : []).filter((v): v is string => typeof v === "string").slice(0, 20).map((v) => clip(v, 40)),
    }))
    .filter((o) => o.name && !(o.name === "Title" && o.values.length === 1 && o.values[0] === "Default Title"));
  const variants = (Array.isArray(p.variants) ? (p.variants as Json[]) : []).slice(0, 40).map((v) => {
    const price = num(v.price);
    const cmp = num(v.compare_at_price);
    return {
      title: typeof v.title === "string" ? clip(v.title, 80) : "",
      price,
      compareAt: cmp !== null && price !== null && cmp > price ? cmp : null,
      available: v.available === true,
      grams: num(v.grams),
    };
  });
  const images = (Array.isArray(p.images) ? (p.images as Json[]) : [])
    .map((im) => (typeof im.src === "string" ? im.src : null))
    .filter((s): s is string => Boolean(s))
    .slice(0, 10);
  const { bullets, text } = descriptionBullets(typeof p.body_html === "string" ? p.body_html : null);
  return { options, variants, images, bullets, text };
}

/** Önceki kayıtla birleştirir: stokta → tükendi olan varyantların günü tutulur, yeniden stoğa girenler ayrıca işaretlenir. */
export function mergeDetail(prev: ProductDetail | null | undefined, cur: ProductDetail, today: string): ProductDetail {
  const soldOut: Record<string, string> = { ...(prev?.soldOut ?? {}) };
  const restocked: Record<string, string> = { ...(prev?.restocked ?? {}) };
  const before = new Map((prev?.variants ?? []).map((v) => [v.title, v.available]));
  for (const v of cur.variants) {
    const was = before.get(v.title);
    if (was === true && !v.available) soldOut[v.title] = today;
    if (was === false && v.available && soldOut[v.title]) restocked[v.title] = today;
  }
  return { ...cur, soldOut, restocked, first: prev?.first ?? today, last: today };
}

/** Gram → okunur ağırlık. */
export const weightLabel = (g: number | null) => (g === null ? null : g >= 1000 ? `${(g / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kg` : `${Math.round(g)} g`);
