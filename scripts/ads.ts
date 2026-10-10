// Günlük işin "reklam sinyali" adımı: doğrulanmış markaların ve puanı yüksek yeni mağazaların Meta reklamları.
import { AD_CHECKS_PER_RUN, AD_COUNTRIES, AD_MIN_STORE_SCORE, GRAPH_API_VERSION } from "../config/limits.ts";
import { analyzeAds, STAGE_LABELS } from "../dtc/adAnalysis.ts";
import { adLibraryClient, adMatches, summarizeAds, tokenExpiry } from "../dtc/adLibrary.ts";
import { adStoreContext, adTargets, knownAdvertisers, saveAdSignal, translateTopCreatives } from "../lib/ads.ts";
import { politeFetch } from "../lib/http.ts";
import { tryConsumeQuota } from "../lib/repo.ts";
import { translateText } from "../lib/translate.ts";
import { registrableDomain } from "../lib/domain.ts";
import type { MetaAdsState } from "../lib/newStores.ts";
import { saveCandidate } from "../lib/repo.ts";
import { setJobState } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Reklam metni çevirisi (MyMemory, anahtarsız ~5.000 karakter/gün): günde en fazla 8 metin (≈ 3.600 karakter).
const AD_TRANSLATE_DAILY = 8;
const trQuota = () => tryConsumeQuota("mymemory_ads", AD_TRANSLATE_DAILY, AD_TRANSLATE_DAILY * 31);
const toTurkish = (text: string, from: string) => translateText(text, from, "tr", politeFetch, trQuota);

/** reanalyze: reklamı bilinen mağazalar zamanını beklemeden yeniden aranır (analiz kuralları değişince). */
export async function adSignals(reanalyze = false): Promise<boolean> {
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

  const known = reanalyze ? await knownAdvertisers(AD_CHECKS_PER_RUN) : [];
  const due = await adTargets(AD_CHECKS_PER_RUN, AD_MIN_STORE_SCORE);
  const targets = [...known, ...due.filter((d) => !known.some((k) => k.domain === d.domain))].slice(0, AD_CHECKS_PER_RUN);
  console.log(`  ${targets.length} alan adı aranacak${expiry?.expiresAt ? ` · anahtarın süresi ${expiry.expiresAt.slice(0, 10)} tarihinde doluyor` : ""}`);
  const search = adLibraryClient(token, { countries: AD_COUNTRIES, version: GRAPH_API_VERSION });
  let checked = 0;
  let found = 0;
  let errors = 0;
  let promoted = 0;
  let stopped: string | null = null;
  for (const t of targets) {
    if (checked > 0) await sleep(1000); // tek alan adı (graph.facebook.com): saniyede en fazla 1 istek
    // Her zaman alan adıyla aranır: dropshipping mağazaları reklamlarını çoğu zaman birden çok Facebook sayfasından yayınlar;
    // tek sayfayla aramak diğer sayfalardaki reklamları kaçırır. Sayfa kimliği yalnızca Reklam Kütüphanesi bağlantısı içindir.
    const q = { domain: t.domain, pageId: null };
    const r = await search(q);
    if (!r.ok) {
      if (r.fatal) {
        stopped = r.reason;
        break;
      }
      errors++;
      if (errors <= 5) console.log(`  ? ${t.domain}: ${r.reason}`);
      continue;
    }
    const matched = r.ads.filter((a) => adMatches(a, t.domain, t.shopName, null));
    // Reklam bulunduysa yayındakiler ayrıca istenir: tek sayfa 100 reklamla sınırlı, yayındaki eski reklamlar dışarıda kalabilir.
    let active: typeof matched | null = null;
    if (matched.length > 0) {
      await sleep(1000);
      const a = await search({ ...q, activeOnly: true });
      if (a.ok) active = a.ads.filter((x) => adMatches(x, t.domain, t.shopName, null));
    }
    const merged = [...matched, ...(active ?? []).filter((x) => !matched.some((m) => m.id === x.id))];
    const summary = summarizeAds(merged);
    const ctx = matched.length > 0 ? await adStoreContext(t.domain) : null;
    const analysis = analyzeAds(matched, active, Date.now(), ctx?.products ?? []);
    await saveAdSignal(t, summary, analysis);
    checked++;
    // Kazanan reklamların metni Türkçeye (Türkiye reklamı için taslak); yalnızca kanıtlanmış/ölçeklenen/test reklamcılar.
    if (analysis.stage !== "none" && analysis.stage !== "stopped") {
      try {
        await translateTopCreatives(t.domain, analysis.creatives, toTurkish);
      } catch (err) {
        console.error(`  ! ${t.domain} çeviri: ${(err as Error).message}`);
      }
    }
    if (analysis.audience && summary.totalAds > 0) {
      const a = analysis.audience;
      const known = a.female + a.male;
      console.log(
        `     ${t.domain} kitle: %${known ? Math.round((a.female / known) * 100) : "?"} kadın · çekirdek yaş ${a.core ? `${a.core.min}–${a.core.max ?? "65+"}` : "?"} · ${a.platforms.map((p) => `${p.name} %${Math.round(p.share * 100)}`).join(", ")}`,
      );
    }
    if (summary.totalAds > 0) {
      found++;
      console.log(
        `  📣 ${t.domain} — ${STAGE_LABELS[analysis.stage]} · skor ${analysis.score} · ${summary.activeAds} yayında / ${summary.totalAds} reklam` +
          (summary.longestActiveDays !== null ? `, en eskisi ${summary.longestActiveDays} gün` : "") +
          (analysis.products[0] ? ` · reklamı verilen: ${analysis.products[0].title} (${analysis.products[0].ads})` : ""),
      );
      // Reklamı verilen ürün öne çıkan ürün değilse o da aday olur (asıl satılan ürün çoğu zaman budur).
      const top = analysis.products[0];
      if (ctx && top && top.ads >= 2 && top.handle !== ctx.hero_handle) {
        const p = ctx.products.find((x) => x.h === top.handle);
        try {
          const saved = await saveCandidate({
            source: "yenimagaza",
            sourceItemId: `${t.domain}/${top.handle}`,
            sourceUrl: `https://${t.domain}/`,
            title: ctx.shop_name ?? t.domain,
            productName: top.title,
            brandDomain: registrableDomain(`https://${t.domain}/`) ?? t.domain,
            productUrl: `https://${t.domain}/products/${top.handle}`,
            imageUrl: p?.img ?? null,
            category: null,
            postedAt: new Date(p?.c ?? ctx.first_product_at ?? Date.now()),
            engagement: top.ads,
            comments: 0,
            marketplaceLinks: [],
            priority: Math.min(100, 60 + analysis.score / 2),
          });
          if (saved.created) promoted++;
        } catch (err) {
          console.error(`  ! ${t.domain}/${top.handle}: ${(err as Error).message}`);
        }
      }
    }
  }
  if (stopped) console.error(`  ✖ Aramalar durduruldu: ${stopped}`);
  console.log(`  özet: ${checked} alan adı arandı, ${found} tanesinde reklam var${promoted ? `, ${promoted} reklamı verilen ürün aday oldu` : ""}${errors ? `, ${errors} hata` : ""}`);
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
