// Döviz kurları: TCMB'nin resmi günlük kur dosyası (https://www.tcmb.gov.tr/kurlar/today.xml, ücretsiz, robots izinli).
// Günlük iş kurları job_state'e yazar; arayüz (kâr hesaplayıcı) oradan okur.
import { db } from "./db.ts";

export const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

/** 1 birim yabancı para = rates[kod] TL (döviz satış kuru). */
export type FxRates = { date: string; rates: Record<string, number> };

export function parseTcmb(xml: string): FxRates | null {
  const date = xml.match(/<Tarih_Date[^>]*\bDate="(\d{2})\/(\d{2})\/(\d{4})"/);
  const rates: Record<string, number> = {};
  for (const m of xml.matchAll(/<Currency\b[^>]*\bKod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g)) {
    const unit = Number(m[2].match(/<Unit>\s*(\d+)\s*<\/Unit>/)?.[1] ?? 1);
    const selling = Number(m[2].match(/<ForexSelling>\s*([\d.]+)\s*<\/ForexSelling>/)?.[1]);
    if (selling > 0 && unit > 0) rates[m[1]] = Math.round((selling / unit) * 10000) / 10000;
  }
  if (!date || !rates.USD) return null;
  return { date: `${date[3]}-${date[1]}-${date[2]}`, rates };
}

/** Satış para birimine (TL) çevirmek için: 1 birim `currency` kaç TL. */
export function tryRate(fx: FxRates | null, currency: string | null): number | null {
  if (!fx) return null;
  const c = (currency ?? "USD").toUpperCase();
  return c === "TRY" ? 1 : (fx.rates[c] ?? null);
}

export async function getFx(): Promise<FxRates | null> {
  const { data, error } = await db().from("job_state").select("value").eq("key", "fx").maybeSingle();
  if (error) return null;
  return (data?.value as FxRates | undefined) ?? null;
}
