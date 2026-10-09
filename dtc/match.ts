// Ürün adı eşleştirme yardımcıları (pazaryeri araması ve Shopify kataloğu için ortak).
import { normalizeName } from "../lib/productName.ts";

const STOP = new Set(["the", "and", "with", "for", "new", "by", "of", "in", "a", "an", "kit", "set", "edition"]);

export function tokens(s: string): string[] {
  return normalizeName(s).split(" ").filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Marka belirteçleri: alan adının uzantısız adı + ürün adının ilk kelimesi (genelde marka). */
export function brandTokens(brandDomain: string, productName: string): string[] {
  const label = normalizeName(brandDomain.split(".")[0]).replace(/\s+/g, "");
  const first = tokens(productName)[0];
  return [...new Set([label, first].filter((t): t is string => Boolean(t && t.length >= 3)))];
}

/** Ürün adından marka belirteçleri çıkarılmış "model" belirteçleri. */
export function modelTokens(brandDomain: string, productName: string): string[] {
  const brands = brandTokens(brandDomain, productName);
  return tokens(productName).filter((t) => !brands.includes(t));
}

/** Model belirteçlerinin metinde geçme oranı (0..1). */
export function modelCoverage(model: string[], text: string): number {
  if (model.length === 0) return 0;
  const padded = ` ${normalizeName(text)} `;
  return model.filter((t) => padded.includes(` ${t} `)).length / model.length;
}
