// Günlük işin "reklam sinyali" adımı: doğrulanmış markaların ve puanı yüksek yeni mağazaların Meta reklamları.
import { AD_CHECKS_PER_RUN, AD_COUNTRIES, AD_MIN_STORE_SCORE, GRAPH_API_VERSION } from "../config/limits.ts";
import { adLibraryClient, adMatches, adPoints, summarizeAds, tokenExpiry } from "../dtc/adLibrary.ts";
import { adTargets, saveAdSignal } from "../lib/ads.ts";
import type { MetaAdsState } from "../lib/newStores.ts";
import { setJobState } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function adSignals(): Promise<boolean> {
  console.log("\n▶ Reklam sinyali (Meta Reklam Kütüphanesi)");
  const at = new Date().toISOString();
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.log("  ! META_ACCESS_TOKEN yok: reklam araması atlandı (kurulum: README → Reklam sinyali)");
    await setJobState("meta_ads", { status: "no_token", at } satisfies MetaAdsState);
    return true;
  }
  const expiry = await tokenExpiry(token, GRAPH_API_VERSION);
  if (expiry && !expiry.valid) {
    console.error("  ✖ Meta erişim anahtarı geçersiz ya da süresi dolmuş; README → Reklam sinyali → anahtarı yenileme");
    await setJobState("meta_ads", { status: "invalid", reason: "Anahtar geçersiz ya da süresi dolmuş", expiresAt: expiry.expiresAt, at } satisfies MetaAdsState);
    return false;
  }

  const targets = await adTargets(AD_CHECKS_PER_RUN, AD_MIN_STORE_SCORE);
  console.log(`  ${targets.length} alan adı aranacak${expiry?.expiresAt ? ` · anahtarın süresi ${expiry.expiresAt.slice(0, 10)} tarihinde doluyor` : ""}`);
  const search = adLibraryClient(token, { countries: AD_COUNTRIES, version: GRAPH_API_VERSION });
  let checked = 0;
  let found = 0;
  let errors = 0;
  let stopped: string | null = null;
  for (const t of targets) {
    if (checked > 0) await sleep(1000); // tek alan adı (graph.facebook.com): saniyede en fazla 1 istek
    const r = await search(t);
    if (!r.ok) {
      if (r.fatal) {
        stopped = r.reason;
        break;
      }
      errors++;
      if (errors <= 5) console.log(`  ? ${t.domain}: ${r.reason}`);
      continue;
    }
    const summary = summarizeAds(r.ads.filter((a) => adMatches(a, t.domain, t.shopName, t.pageId)));
    const points = adPoints(summary);
    await saveAdSignal(t, summary, points);
    checked++;
    if (summary.totalAds > 0) {
      found++;
      console.log(
        `  📣 ${t.domain} — ${summary.activeAds} yayında / ${summary.totalAds} reklam` +
          (summary.longestActiveDays !== null ? `, en eskisi ${summary.longestActiveDays} gündür yayında` : "") +
          `, puan ${points}`,
      );
    }
  }
  if (stopped) console.error(`  ✖ Aramalar durduruldu: ${stopped}`);
  console.log(`  özet: ${checked} alan adı arandı, ${found} tanesinde reklam var${errors ? `, ${errors} hata` : ""}`);
  await setJobState("meta_ads", {
    status: stopped ? "stopped" : "ok",
    reason: stopped ?? undefined,
    checked,
    found,
    expiresAt: expiry?.expiresAt ?? null,
    at,
  } satisfies MetaAdsState);
  // Hız sınırı geçicidir (ertesi gün devam eder); anahtar/yetki/parametre hatası düzeltilmelidir.
  return !stopped || stopped.startsWith("Hız sınırı");
}
