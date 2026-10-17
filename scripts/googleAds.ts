// Türkiye'de reklam verenler (Google Reklam Şeffaflık Merkezi, resmi BigQuery veri seti). Haftada bir çalışır: BigQuery
// deneme alanının ücretsiz kotası ayda 1 TB sorgu; sorgu önce kuru çalıştırılır (ücretsiz), taranacak veri sınırı
// aşıyorsa ya da bu ayki toplam 900 GB'ı geçecekse çalıştırılmaz.
import { GOOGLE_ADS_MAX_GB, googleAdsTrSql, parseAdvertiser, type GoogleAdvertiser } from "../dtc/googleAds.ts";
import { bigQuery, bigQueryCredentials } from "../lib/bigquery.ts";
import { saveGoogleAdvertisers } from "../lib/googleAds.ts";
import { getJobState, setJobState } from "../lib/stores.ts";

export type GoogleAdsState = { day: string; month: string; monthGb: number; gb?: number; rows?: number; matched?: number; status: string; reason?: string };

const MONTH_MAX_GB = 900;
const EVERY_DAYS = 6;
const GB = 1024 ** 3;

export async function googleAdsTr(): Promise<boolean> {
  if (!bigQueryCredentials()) {
    console.log("\n▶ Google reklamları (Türkiye): BigQuery anahtarı tanımlı değil, atlandı");
    return true;
  }
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const prev = await getJobState<GoogleAdsState>("google_ads_tr");
  const monthGb = prev?.month === month ? prev.monthGb : 0;
  if (prev?.status === "ok" && Date.parse(today) - Date.parse(prev.day) < EVERY_DAYS * 86_400_000) return true;

  console.log("\n▶ Google reklamları (Türkiye, Reklam Şeffaflık Merkezi)");
  const sql = googleAdsTrSql();
  const save = (s: Omit<GoogleAdsState, "day" | "month" | "monthGb"> & { monthGb?: number }) =>
    setJobState("google_ads_tr", { day: today, month, monthGb, ...s } satisfies GoogleAdsState);
  try {
    const dry = await bigQuery(sql, { dryRun: true });
    const gb = Math.round((dry.bytes / GB) * 10) / 10;
    if (gb > GOOGLE_ADS_MAX_GB || monthGb + gb > MONTH_MAX_GB) {
      console.log(`  ! Sorgu ${gb} GB tarayacak (bu ay ${monthGb} GB): ücretsiz kotayı korumak için çalıştırılmadı`);
      await save({ status: "skipped", gb, reason: "kota" });
      return true;
    }
    const r = await bigQuery(sql);
    const rows = r.rows.map(parseAdvertiser).filter((x): x is GoogleAdvertiser => x !== null);
    const matched = await saveGoogleAdvertisers(rows);
    const used = Math.round((r.bytes / GB) * 10) / 10;
    console.log(`  özet: ${rows.length} reklamveren, ${matched} tanesi bilinen bir mağaza (${used} GB tarandı)`);
    await save({ status: "ok", gb: used, rows: rows.length, matched, monthGb: Math.round((monthGb + used) * 10) / 10 });
    return true;
  } catch (err) {
    const reason = (err as Error).message.slice(0, 300);
    console.error(`  ✖ ${reason}`);
    await save({ status: "error", reason });
    return false;
  }
}
