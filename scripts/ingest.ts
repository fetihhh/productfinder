// Günlük iş: kaynaklar + yeni mağaza keşfi → reklam sinyali → aday ürünler → büyük marka elemesi → DTC doğrulama → satış ölçümü
// → toptancı araması → marka yaşı → trend, winner ve yükseliş skorları.
// Çalıştırma: npm run ingest            (toplama + doğrulama; GitHub Actions cron'u bunu çağırır)
//             npm run ingest -- verify  (toplama hariç hepsi)
//             npm run ingest -- recheck (ayrıca tüm "verified" ürünleri tarihe bakmadan yeniden kontrol eder)
//             npm run ingest -- no-stores (yeni mağaza keşfi ve kontrolleri atlanır)
//             npm run ingest -- resupply  (toptancı aramasını tüm doğrulanmış/takip edilen ürünler için hemen yeniler)
//             npm run ingest -- ads       (yalnızca reklam analizi; reklamı bilinen mağazalar yeniden aranır)
//             npm run ingest -- kesif     (Meta Reklam Kütüphanesi'nden yeni reklamcı mağazalar + kontrol + reklam analizi)
//             npm run ingest -- detay     (aday/reklamcı mağazaların ürün ayrıntıları + ana sayfadan marka künyesi)
//             npm run ingest -- instagram (Instagram hesabı bilinmeyen mağazaların ana sayfası + çok tutan gönderiler)
import {
  BIG_BRAND_MAX_RANK,
  SNAPSHOT_PER_RUN,
  STRICT_BRAND_CHECK,
  SUPPLIER_PER_RUN,
  TAVILY_DAILY_LIMIT,
  TAVILY_MONTHLY_LIMIT,
  TRANSLATE_DAILY_LIMIT,
  TRANSLATE_MONTHLY_LIMIT,
  VERIFY_PER_RUN,
} from "../config/limits.ts";
import { directSearch } from "../dtc/directSearch.ts";
import { tavilySearch, type SearchFn } from "../dtc/marketplaceSearch.ts";
import { readSales } from "../dtc/sales.ts";
import { imageHasher, productImageUrls } from "../dtc/imageHash.ts";
import { aliImageId } from "../dtc/storeProbe.ts";
import { findSuppliers, isImageMatch, SUPPLIER_SITES } from "../dtc/suppliers.ts";
import { verifyProduct, type BrandState } from "../dtc/verify.ts";
import { politeFetch, politeFetchBytes } from "../lib/http.ts";
import {
  brandDomains,
  brandsWithoutRank,
  productsToSource,
  rejectBigBrands,
  saveSuppliers,
  filterNewItemIds,
  latestTrafficDay,
  markSeen,
  productsToSnapshot,
  propagateBrandRejections,
  productsToVerify,
  saveCandidate,
  saveSnapshot,
  saveTrafficRanks,
  saveVerification,
  today,
  tryConsumeQuota,
  updateTrendScores,
  updateWinnerScores,
} from "../lib/repo.ts";
import { appendFileSync } from "node:fs";
import { parseTcmb, TCMB_URL } from "../lib/fx.ts";
import { getSummary } from "../lib/summary.ts";
import { updateTiming } from "../lib/timing.ts";
import { sourceLang, translateToEnglish } from "../lib/translate.ts";
import { setJobState } from "../lib/stores.ts";
import { ranksFor, TRANCO_MAX_BYTES, TRANCO_URL, unzipFirst } from "../lib/tranco.ts";
import { enabledAdapters } from "../sources/index.ts";
import { adSignals } from "./ads.ts";
import { discoverFromAds } from "./adDiscovery.ts";
import { rdapLookups } from "./rdap.ts";
import { findSocialHandles, instagramPosts } from "./instagram.ts";
import { brandAges, checkStores, copyClusters, discoverStores, promoteMovers, promoteStores } from "./stores.ts";

async function collect(): Promise<boolean> {
  let ok = true;
  for (const adapter of enabledAdapters()) {
    console.log(`\n▶ ${adapter.id}`);
    try {
      const { candidates, seen, stats } = await adapter.fetchCandidates({ filterNew: filterNewItemIds });
      let created = 0;
      const failed = new Set<string>();
      for (const c of candidates) {
        try {
          if ((await saveCandidate(c)).created) created++;
          console.log(`  + ${c.productName}  [${c.brandDomain}]${c.marketplaceLinks.length ? "  (pazaryeri linki var)" : ""}`);
        } catch (err) {
          failed.add(c.sourceItemId);
          stats.errors.push(`${c.sourceUrl}: ${(err as Error).message}`);
        }
      }
      await markSeen(adapter.id, seen.filter((s) => !failed.has(s.sourceItemId)));
      console.log(
        `  yazı=${stats.items} yeni=${stats.newItems} aday=${stats.candidates} yeniÜrün=${created} markaLinkiYok=${stats.noBrandLink} hata=${stats.errors.length}`,
      );
      for (const e of stats.errors) console.log(`  ! ${e}`);
    } catch (err) {
      ok = false;
      console.error(`  ✖ ${adapter.id}: ${(err as Error).message}`);
    }
  }
  return ok;
}

/** Tavily aramasını kota sayacının arkasına koyar; anahtar yoksa arama kapalıdır. */
function quotaGuardedSearch(): SearchFn | null {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const search = tavilySearch(key);
  return async (query) => {
    if (!(await tryConsumeQuota("tavily", TAVILY_DAILY_LIMIT, TAVILY_MONTHLY_LIMIT))) {
      return { ok: false, quota: true, reason: "günlük/aylık arama kotası doldu" };
    }
    return search(query);
  };
}

/** Çeviri kotası (MyMemory anahtarsız kullanım sınırının altında kalmak için). */
const translateQuota = () => tryConsumeQuota("mymemory", TRANSLATE_DAILY_LIMIT, TRANSLATE_MONTHLY_LIMIT);

async function verify(): Promise<boolean> {
  const products = await productsToVerify(VERIFY_PER_RUN, process.argv.includes("recheck"));
  console.log(`\n▶ DTC doğrulama: ${products.length} ürün`);
  const deps = { fetchPage: politeFetch, searchMarketplaces: quotaGuardedSearch(), directSearch: directSearch(politeFetch) };
  if (!deps.searchMarketplaces) console.log("  ! TAVILY_API_KEY yok: pazaryeri araması atlanacak");

  const counts: Record<string, number> = {};
  // Aynı çalıştırmada aynı markanın ikinci ürünü için marka araması tekrarlanmasın.
  const brandCache = new Map<string, BrandState>();
  let ok = true;
  for (const p of products) {
    try {
      const brand: BrandState | null =
        brandCache.get(p.brand_domain) ??
        (p.brands
          ? {
              marketplaceStatus: p.brands.marketplace_status,
              marketplaceEvidence: p.brands.marketplace_evidence,
              marketplaceCheckedAt: p.brands.marketplace_checked_at,
              trancoRank: p.brands.tranco_rank,
            }
          : null);
      // Yeni mağaza keşfinden gelen ürünlerin adı markayla başlamaz (marka = mağaza adı).
      const fromStore = p.mentions.length > 0 && p.mentions.every((m) => m.source === "yenimagaza");
      // İngilizce olmayan mağaza ürünü pazaryerlerinde (Amazon.com) İngilizce adıyla aranır.
      const lang = fromStore ? sourceLang(p.brands?.country) : null;
      const english = lang ? await translateToEnglish(p.name, lang, politeFetch, translateQuota) : null;
      const r = await verifyProduct(
        { brandDomain: p.brand_domain, productUrl: p.product_url, productName: english ?? p.name, brand, nameStartsWithBrand: !fromStore },
        deps,
      );
      // Çevrilen ad ekranda gösterilmez: ürünün adı mağazadaki özgün adı kalır.
      if (english && r.name === english) r.name = p.name;
      await saveVerification(p, r);
      if (r.brandCheck) {
        brandCache.set(p.brand_domain, {
          marketplaceStatus: r.brandCheck.status,
          marketplaceEvidence: r.brandCheck.evidence,
          marketplaceCheckedAt: new Date().toISOString(),
          trancoRank: p.brands?.tranco_rank ?? null,
        });
      }
      const key = r.retryable ? `${r.status} (tekrar denenecek)` : r.status;
      counts[key] = (counts[key] ?? 0) + 1;
      console.log(`  ${r.status === "verified" ? "✔" : r.status === "rejected_marketplace" ? "✖" : "?"} ${r.name ?? p.name} [${p.brand_domain}] — ${r.reason}`);
    } catch (err) {
      ok = false;
      console.error(`  ! ${p.brand_domain}: ${(err as Error).message}`);
    }
  }
  console.log(`  özet: ${JSON.stringify(counts)}`);
  return ok;
}

/** Tranco top-1M listesinden markaların günlük trafik sırası (liste günde bir güncellenir). */
async function traffic(): Promise<boolean> {
  console.log("\n▶ Trafik sırası (Tranco)");
  const latest = await latestTrafficDay();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  // Liste tazeyse yalnızca o listede sırası kaydedilmemiş (yeni) markalar için yeniden indirilir.
  if (latest && latest >= yesterday && (await brandsWithoutRank(latest)).length === 0) {
    console.log(`  son liste zaten kayıtlı (${latest})`);
    return true;
  }
  const res = await politeFetchBytes(TRANCO_URL, TRANCO_MAX_BYTES);
  if (!res.ok) {
    console.error(`  ✖ Tranco indirilemedi: ${res.reason}`);
    return false;
  }
  try {
    const entry = unzipFirst(res.bytes);
    const domains = await brandDomains();
    const ranks = ranksFor(entry.data.toString("utf8"), domains);
    const day = entry.date ?? today();
    await saveTrafficRanks(day, domains, ranks);
    console.log(`  liste ${day}: ${domains.length} markanın ${ranks.size} tanesi ilk 1 milyonda`);
    return true;
  } catch (err) {
    console.error(`  ✖ ${(err as Error).message}`);
    return false;
  }
}

/** Doğrulanmış/takip edilen ürünlerin günlük fiyat-yorum-stok ölçümü. */
async function snapshots(): Promise<boolean> {
  const products = await productsToSnapshot(SNAPSHOT_PER_RUN);
  console.log(`\n▶ Satış ölçümü: ${products.length} ürün`);
  let ok = true;
  for (const p of products) {
    try {
      const r = await readSales(p.product_url, politeFetch);
      if (!r.ok) {
        console.log(`  ? ${p.name} — ${r.reason}`);
        continue;
      }
      await saveSnapshot(p.id, r.sales);
      console.log(`  • ${p.name} — yorum ${r.sales.reviewCount ?? "?"}, fiyat ${r.sales.price ?? "?"} ${r.sales.currency ?? ""}`);
    } catch (err) {
      ok = false;
      console.error(`  ! ${p.name}: ${(err as Error).message}`);
    }
  }
  return ok;
}

/** Doğrulanmış/takip edilen ürünler için toptancı adayları (AliExpress, Alibaba, Made-in-China). */
async function suppliers(): Promise<boolean> {
  const products = await productsToSource(SUPPLIER_PER_RUN, process.argv.includes("resupply"));
  console.log(`\n▶ Toptancı araması: ${products.length} ürün (metin + görsel eşleştirme)`);
  const hashImage = imageHasher((url) => politeFetchBytes(url, 5_000_000, "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5"));
  let ok = true;
  for (const p of products) {
    try {
      // İngilizce olmayan mağazanın ürün adı toptancıda İngilizce aranır.
      const lang = sourceLang(p.country);
      const english = lang ? await translateToEnglish(p.name, lang, politeFetch, translateQuota) : null;
      const images = await productImageUrls(p.image_url, p.product_url, politeFetch);
      const imageHashes = (await Promise.all(images.map(hashImage))).filter((h): h is bigint => h !== null);
      const r = await findSuppliers(
        {
          name: english ?? p.name,
          brandDomain: p.brand_domain,
          // Shopify ürün türü de mağazanın dilindedir ("belleza", "luces"): çevrilmiş sorguya eklenmez.
          productType: english ? null : p.product_type,
          imageHashes,
          nameStartsWithBrand: !p.from_store,
          aliImageIds: images.map(aliImageId).filter((id): id is string => id !== null),
        },
        politeFetch,
        SUPPLIER_SITES,
        hashImage,
      );
      await saveSuppliers(p, r);
      const best = r.offers[0];
      const byImage = r.offers.filter(isImageMatch).length;
      console.log(
        `  • ${p.name} — "${r.query}": ${r.offers.length} eşleşme` +
          (byImage ? ` (📷 ${byImage} görselle)` : imageHashes.length ? "" : " (ürün görseli okunamadı)") +
          (best ? `, en iyi ${best.source} ${best.priceMin ?? "?"} ${best.currency ?? ""} (%${Math.round(best.similarity * 100)})` : "") +
          (r.failed.length ? ` · okunamadı: ${r.failed.join(", ")}` : ""),
      );
    } catch (err) {
      ok = false;
      console.error(`  ! ${p.name}: ${(err as Error).message}`);
    }
  }
  return ok;
}

/** TCMB günlük kurları (kâr hesaplayıcı için). */
async function exchangeRates(): Promise<boolean> {
  const res = await politeFetch(TCMB_URL, "application/xml,text/xml");
  const fx = res.ok ? parseTcmb(res.text) : null;
  if (!fx) {
    console.error(`\n▶ Döviz kurları: okunamadı (${res.ok ? "biçim tanınmadı" : res.reason})`);
    return false;
  }
  await setJobState("fx", fx);
  console.log(`\n▶ Döviz kurları (TCMB ${fx.date}): 1 USD = ${fx.rates.USD} TL, 1 EUR = ${fx.rates.EUR ?? "?"} TL`);
  return true;
}

/** GitHub Actions'ta çalışırken iş özeti sayfasına günün sonuçlarını yazar (Actions → çalıştırma → Summary). */
async function writeJobSummary(seconds: number): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try {
    const s = await getSummary();
    const site = process.env.APP_URL ?? "https://productfinder-phi.vercel.app";
    const lines = [
      `## Product Finder — ${today()}`,
      "",
      `| Son 24 saatte bulunan mağaza | Son 7 günde açılan | Açık yeni mağaza | Son 24 saatte aday ürün | Süre |`,
      `|---|---|---|---|---|`,
      `| ${s.counts.storesFound24h} | ${s.counts.storesOpened7d} | ${s.counts.liveNew} | ${s.counts.candidates24h} | ${Math.round(seconds / 60)} dk |`,
      "",
      "### En yüksek winner skorlu ürünler",
      ...s.winners.slice(0, 5).map((p) => `- **${Math.round(Number(p.winner_score))}** · [${p.name.replace(/[[\]|]/g, " ")}](${site}/p/${p.id}) · ${p.brand_domain}${p.margin_ratio !== null ? ` · marj ≈ ${p.margin_ratio}×` : ""}`),
      "",
      "### En çok satış hareketi olan yeni mağazalar",
      ...(s.movers.length ? s.movers.slice(0, 5).map((m) => `- 📉 ${m.stock_drops} · [${m.shop_name ?? m.domain}](${site}/m/${m.domain}) · ${m.moving_products} ürün`) : ["- Henüz yok"]),
      "",
      `[Özet sayfası](${site}/ozet)`,
      "",
    ];
    appendFileSync(file, lines.join("\n"));
  } catch (err) {
    console.error(`  ! iş özeti yazılamadı: ${(err as Error).message}`);
  }
}

/** Zamanlama etiketi: erken / zirvede / doymuş / sönüyor (rakip mağazalar + reklamlar + stok hareketi). */
async function timing(): Promise<void> {
  try {
    const r = await updateTiming();
    console.log(`\n▶ Zamanlama: ${r.stores} mağaza, ${r.products} ürün güncellendi`);
  } catch (err) {
    console.error(`\n▶ Zamanlama hesaplanamadı: ${(err as Error).message}`);
  }
}

async function main() {
  const started = Date.now();
  // Yalnızca reklam analizi: reklamı bilinen mağazalar yeniden aranır, skorlar güncellenir (~5 dk).
  // Yalnızca reklamdan keşif: yeni reklamcı mağazalar bulunur, kontrol edilir, reklamları analiz edilir (~10 dk).
  if (process.argv.includes("kesif")) {
    await discoverFromAds();
    const checked = await checkStores("reklam");
    await rdapLookups();
    const ok = await adSignals();
    const promoted = await promoteStores();
    await timing();
    console.log(`▶ Winner skoru: ${await updateWinnerScores()} ürün`);
    await writeJobSummary((Date.now() - started) / 1000);
    if (![checked, ok, promoted].every(Boolean)) process.exitCode = 1;
    return;
  }
  // Ürün ayrıntıları ve marka künyesi: aday/reklamcı mağazalar hemen kontrol edilir, ana sayfa bilgileri doldurulur (~10 dk).
  if (process.argv.includes("detay")) {
    const checked = await checkStores("detay");
    await findSocialHandles(300, 35);
    await rdapLookups(200);
    await writeJobSummary((Date.now() - started) / 1000);
    if (!checked) process.exitCode = 1;
    return;
  }
  // Yalnızca Instagram: hesabı bilinmeyen mağazaların ana sayfası + çok tutan gönderiler (~5 dk).
  if (process.argv.includes("instagram")) {
    await findSocialHandles();
    await instagramPosts();
    await writeJobSummary((Date.now() - started) / 1000);
    return;
  }
  if (process.argv.includes("ads")) {
    const ok = await adSignals(true);
    await instagramPosts();
    await timing();
    console.log(`▶ Winner skoru: ${await updateWinnerScores()} ürün`);
    await writeJobSummary((Date.now() - started) / 1000);
    if (!ok) process.exitCode = 1;
    return;
  }
  const onlyVerify = process.argv.includes("verify") || process.argv.includes("recheck");
  const collected = onlyVerify ? true : await collect();
  // Yeni mağazalar: keşif (yeni kayıtlı alan adları) → kontrol → puanı yüksek olanların öne çıkan ürünü aday olur.
  const skipStores = process.argv.includes("no-stores");
  const discovered = onlyVerify || skipStores ? true : await discoverStores();
  // Reklam Kütüphanesi'nden keşif: zaten reklam veren mağazalar (aynı çalıştırmada kontrol edilir).
  if (!onlyVerify && !skipStores) {
    try {
      await discoverFromAds();
    } catch (err) {
      console.error(`\n▶ Reklamdan keşif yapılamadı: ${(err as Error).message}`);
    }
  }
  const checked = skipStores ? true : await checkStores();
  if (!skipStores) {
    try {
      await rdapLookups();
    } catch (err) {
      console.error(`
▶ Alan adı kaydı sorgulanamadı: ${(err as Error).message}`);
    }
  }
  // Aynı ürünü satan mağazalar (kopya puanı aday seçiminden önce toplam puana eklenir).
  const copied = skipStores ? true : await copyClusters();
  // Reklam sinyali aday seçiminden önce: reklam veren mağazaların toplam puanı yükselir.
  const advertised = await adSignals();
  await instagramPosts();
  const promotedHero = skipStores ? true : await promoteStores();
  // Öne çıkan ürün dışında, mağazada stoğu tekrar tekrar azalan (asıl satan) ürünler.
  const promotedMovers = skipStores ? true : await promoteMovers();
  const promoted = promotedHero && promotedMovers;
  // Trafik sırası doğrulamadan önce: büyük markalar ağa çıkmadan ve Tavily kredisi harcanmadan elenir.
  const ranked = await traffic();
  const big = await rejectBigBrands();
  if (big) console.log(`\n▶ Büyük marka: ${big} ürün elendi (sıra ≤ #${BIG_BRAND_MAX_RANK.toLocaleString("tr-TR")})`);
  const verified = await verify();
  if (STRICT_BRAND_CHECK) {
    const n = await propagateBrandRejections();
    if (n) console.log(`\n▶ Katı mod: pazaryerinde satan markaların ${n} ürünü daha elendi`);
  }
  const measured = await snapshots();
  const fx = await exchangeRates();
  const sourced = await suppliers();
  const aged = await brandAges();
  const scores = await updateTrendScores();
  console.log(`\n▶ Trend skoru: ${scores.total} ürün, ${scores.updated} değişti`);
  await timing();
  console.log(`▶ Winner skoru: ${await updateWinnerScores()} ürün`);
  console.log(`\nBitti: ${((Date.now() - started) / 1000).toFixed(1)} sn`);
  await writeJobSummary((Date.now() - started) / 1000);
  if (![collected, discovered, checked, copied, advertised, promoted, verified, ranked, measured, fx, sourced, aged].every(Boolean)) process.exitCode = 1;
}

await main();
