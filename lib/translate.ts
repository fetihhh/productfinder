// Ürün adı çevirisi: İngilizce olmayan mağazaların ürünleri ("Proyector Nocturno para el Hogar") toptancıda İngilizce
// aranır ("Home Night Projector"). MyMemory'nin resmi, ücretsiz API'si (anahtarsız 5.000 karakter/gün); çeviriler
// veritabanında saklanır, aynı ad bir kez çevrilir. Dil, mağazanın ülkesinden tahmin edilir.
import { db } from "./db.ts";
import type { FetchResult } from "./http.ts";
import { clip } from "./text.ts";

type FetchPage = (url: string, accept?: string) => Promise<FetchResult>;

/** Ülke → mağaza dili. İngilizce konuşulan ülkeler ve çok dilli ülkeler (BE, CH) çevrilmez. */
const COUNTRY_LANG: Record<string, string> = {
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", UY: "es", EC: "es",
  FR: "fr", LU: "fr", MC: "fr",
  IT: "it",
  DE: "de", AT: "de",
  PT: "pt", BR: "pt",
  NL: "nl",
  PL: "pl", TR: "tr", SE: "sv", DK: "da", NO: "nb", FI: "fi", RO: "ro", CZ: "cs", GR: "el", HU: "hu",
};

export function sourceLang(country: string | null | undefined): string | null {
  return country ? (COUNTRY_LANG[country.toUpperCase()] ?? null) : null;
}

/** MyMemory yanıtı → çeviri; kota bitti/uyarı/boş yanıtta null. */
export function parseMyMemory(text: string, original: string): string | null {
  try {
    const j = JSON.parse(text) as { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } };
    const t = j.responseData?.translatedText?.trim();
    if (Number(j.responseStatus) !== 200 || j.quotaFinished || !t) return null;
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE/i.test(t)) return null;
    return t.toLowerCase() === original.trim().toLowerCase() ? null : t;
  } catch {
    return null;
  }
}

/**
 * İngilizceye çevirir (önbellekli). consumeQuota çevirmeden önce günlük kotayı düşer; false dönerse çevrilmez.
 * Hata ya da kota bittiğinde null: çağıran özgün adla devam eder.
 */
export async function translateToEnglish(
  text: string,
  lang: string,
  fetchPage: FetchPage,
  consumeQuota: () => Promise<boolean>,
): Promise<string | null> {
  const q = clip(text.trim(), 200);
  if (!q) return null;
  const { data: cached } = await db().from("translations").select("translated").eq("source_lang", lang).eq("text", q).maybeSingle();
  if (cached?.translated) return cached.translated as string;
  if (!(await consumeQuota())) return null;
  const res = await fetchPage(`https://api.mymemory.translated.net/get?${new URLSearchParams({ q, langpair: `${lang}|en` })}`, "application/json");
  if (!res.ok) return null;
  const translated = parseMyMemory(res.text, q);
  if (translated) await db().from("translations").upsert({ source_lang: lang, text: q, translated: clip(translated, 300) }, { onConflict: "source_lang,text" });
  return translated;
}
