// Metin yardımcıları.

/**
 * Karakterleri bölmeden kısaltır: .slice() emojiyi (UTF-16 vekil çifti) ortasından kesebilir ve kalan yarım karakter
 * Postgres jsonb'de "invalid json" hatası verir. Kaynaktaki bozuk vekil karakterler de U+FFFD ile değiştirilir.
 */
export function clip(s: string, max: number): string {
  const clean = s.toWellFormed();
  return clean.length <= max ? clean : Array.from(clean).slice(0, max).join("");
}
