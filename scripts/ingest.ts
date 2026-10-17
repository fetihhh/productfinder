// Günlük iş: kaynaklar + yeni mağaza keşfi → reklam sinyali → aday ürünler → büyük marka elemesi → DTC doğrulama → satış ölçümü
// → toptancı araması → marka yaşı → trend, winner ve yükseliş skorları.
// Çalıştırma: npm run ingest            (toplama + doğrulama; GitHub Actions cron'u bunu çağırır)
//             npm run ingest -- verify  (toplama hariç hepsi)
//             npm run ingest -- recheck (ayrıca tüm "verified" ürünleri tarihe bakmadan yeniden kontrol eder)
//             npm run ingest -- no-stores (yeni mağaza keşfi ve kontrolleri atlanır)
//             npm run ingest -- resupply  (toptancı aramasını tüm doğrulanmış/takip edilen ürünler için hemen yeniler)
//             npm run ingest -- ads       (yalnızca reklam analizi; reklamı bilinen mağazalar yeniden aranır)
//             npm run ingest -- buyut     (tek seferlik: arama servisleriyle mağaza keşfi + tam günlük akış)
//             npm run ingest -- kesif     (Meta Reklam Kütüphanesi'nden yeni reklamcı mağazalar + kontrol + reklam analizi)
//             npm run ingest -- detay     (aday/reklamcı mağazaların ürün ayrıntıları + ana sayfadan marka künyesi)
//             npm run ingest -- instagram (Instagram hesabı bilinmeyen mağazaların ana sayfası + çok tutan gönderiler)
import {
  BIG_BRAND_MAX_RANK,
  SNAPSHOT_CONCURRENCY,
  SNAPSHOT_PER_RUN,
  STRICT_BRAND_CHECK,
  SUPPLIER_PER_RUN,
  TAVILY_DAILY_LIMIT,
  TAVILY_MONTHLY_LIMIT,
  TRANSLATE_DAILY_LIMIT,
  TRANSLATE_MONTHLY_LIMIT,
  VERIFY_PER_RUN,
  EXA_DAILY_LIMIT,
  EXA_MONTHLY_LIMIT,
  FIRECRAWL_DAILY_LIMIT,
  FIRECRAWL_MONTHLY_LIMIT,
} from "../config/limits.ts";
import { directSearch } from "../dtc/directSearch.ts";
import { tavilySearch, type SearchFn, exaSearch, firecrawlSearch, searchChain } from "../dtc/marketplaceSearch.ts";
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
import { getJobState, setJobState } from "../lib/stores.ts";
import { ranksFor, TRANCO_MAX_BYTES, TRANCO_URL, unzipFirst } from "../lib/tranco.ts";
import { enabledAdapters } from "../sources/index.ts";
import { adSignals } from "./ads.ts";
import { prioritizeAdWinners } from "../lib/ads.ts";
import { discoverFromAds } from "./adDiscovery.ts";
import { discoverFromSearch } from "./searchDiscovery.ts";
import { rdapLookups } from "./rdap.ts";
import { findSocialHandles, guessSocial, instagramPosts } from "./instagram.ts";
import { turkeyChecks } from "./turkey.ts";
import { productTagPosts } from "./hashtags.ts";
import { googleAdsTr } from "./googleAds.ts";
import { brandAges, checkStores, copyClusters, discoverStores, itemCopies, promoteCopies, promoteMovers, promoteStores, storeChecksThrottled } from "./stores.ts";

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

/**
 * Geniş pazaryeri araması: Tavily, kotası dolunca Exa, o da dolunca Firecrawl (anahtarı tanımlı olanlar). Her servisin
 * ücretsiz miktarının altında kalan kendi sayacı vardır; hiçbir anahtar yoksa arama kapalıdır.
 */
function quotaGuardedSearch(): SearchFn | null {
  const providers: Parameters<typeof searchChain>[0] = [];
  if (process.env.TAVILY_API_KEY) {
    providers.push({ name: "Tavily", search: tavilySearch(process.env.TAVILY_API_KEY), gate: () => tryConsumeQuota("tavily", TAVILY_DAILY_LIMIT, TAVILY_MONTHLY_LIMIT) });
  }
  if (process.env.EXA_API_KEY) {
    providers.push({ name: "Exa", search: exaSearch(process.env.EXA_API_KEY), gate: () => tryConsumeQuota("exa", EXA_DAILY_LIMIT, EXA_MONTHLY_LIMIT) });
  }
  if (process.env.FIRECRAWL_API_KEY) {
    providers.push({
      name: "Firecrawl",
      search: firecrawlSearch(process.env.FIRECRAWL_API_KEY),
      gate: () => tryConsumeQuota("firecrawl", FIRECRAWL_DAILY_LIMIT, FIRECRAWL_MONTHLY_LIMIT),
    });
  }
  return searchChain(providers);
}

/** Çeviri kotası (MyMemory anahtarsız kullanım sınırının altında kalmak için). */
const translateQuota = () => tryConsumeQuota("mymemory", TRANSLATE_DAILY_LIMIT, TRANSLATE_MONTHLY_LIMIT);

async function verify(): Promise<boolean> {
  const bumped = await prioritizeAdWinners();
  if (bumped) console.log(`
▶ Reklamı tutan ${bumped} ürün doğrulama sırasının başına alındı`);
  const products = await productsToVerify(VERIFY_PER_RUN, process.argv.includes("recheck"));
  console.log(`\n▶ DTC doğrulama: ${products.length} ürün`);
  const deps = { fetchPage: politeFetch, searchMarketplaces: quotaGuardedSearch(), directSearch: directSearch(politeFetch) };
  if (!deps.searchMarketplaces) console.log("  ! Arama API anahtarı yok (TAVILY_API_KEY / EXA_API_KEY / FIRECRAWL_API_KEY): geniş pazaryeri araması atlanacak");

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
  const t0 = Date.now();
  let failures = 0;
  let next = 0;
  const totals = { olculen: 0, okunamadi: 0, tukenen: 0, yenidenGelen: 0, satilanAdet: 0, fiyatDegisen: 0 };
  // Farklı mağazalar aynı anda ölçülür; aynı alan adına istekler yine saniyede en fazla 1 (politeFetch).
  const worker = async () => {
    while (next < products.length) {
      const p = products[next++];
      try {
        const r = await readSales(p.product_url, politeFetch);
        if (!r.ok) {
          totals.okunamadi++;
          console.log(`  ? ${p.name} — ${r.reason}`);
          continue;
        }
        const ev = await saveSnapshot(p, r.sales);
        totals.olculen++;
        totals.tukenen += ev.soldOut;
        totals.yenidenGelen += ev.restocked;
        totals.satilanAdet += ev.unitsSold;
        if (ev.priceChanged) totals.fiyatDegisen++;
        const moves = [
          ev.soldOut ? `${ev.soldOut} varyant tükendi` : "",
          ev.unitsSold ? `${ev.unitsSold} adet satıldı` : "",
          ev.priceChanged ? `fiyat ${p.price ?? "?"} → ${r.sales.price ?? "?"}` : "",
        ].filter(Boolean);
        console.log(`  • ${p.name} — stok ${r.sales.variantsAvailable ?? "?"}/${r.sales.variantsTotal ?? "?"}, yorum ${r.sales.reviewCount ?? "?"}, fiyat ${r.sales.price ?? "?"} ${r.sales.currency ?? ""}${moves.length ? ` · ${moves.join(", ")}` : ""}`);
      } catch (err) {
        failures++;
        console.error(`  ! ${p.name}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: SNAPSHOT_CONCURRENCY }, worker));
  console.log(`  özet: ${JSON.stringify(totals)} (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
  return failures < Math.max(5, products.length * 0.2);
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
    // Depo herkese açık: iş özeti GitHub'da herkese görünür, bu yüzden yalnızca sayılar yazılır (ürün, mağaza, adres yok).
    const lines = [
      `## Product Finder — ${today()}`,
      "",
      `| Son 24 saatte bulunan mağaza | Son 7 günde açılan | Açık yeni mağaza | Son 24 saatte aday ürün | Süre |`,
      `|---|---|---|---|---|`,
      `| ${s.counts.storesFound24h} | ${s.counts.storesOpened7d} | ${s.counts.liveNew} | ${s.counts.candidates24h} | ${Math.round(seconds / 60)} dk |`,
      "",
      `Winner skoru ≥ 40 ürün: ${s.winners.filter((p) => Number(p.winner_score) >= 40).length} · satış hareketi olan yeni mağaza: ${s.movers.length}`,
      "",
      "Ayrıntılar sitede (giriş gerekir) ve Supabase'deki iş kaydında (`job_logs`).",
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

// Geçici bir ağ/veritabanı hatası (fetch failed, zaman aşımı, Supabase 5xx) tek bir adımı düşürür, tüm çalıştırmayı değil:
// adım atlanır, sonraki adımlar sürer, çalıştırma sonunda hatalı sayılır. Eskiden tek hata çalıştırmayı birkaç dakikada
// bitiriyor ve zincir de kırılıyordu (saatlerce tarama yapılmıyordu).
let stepFailed = false;
async function step<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    stepFailed = true;
    console.error(`\n▶ ${name} yarıda kaldı, sonraki adımlarla devam ediliyor`);
    console.error(`  neden: ${(err as Error).message}`);
    return fallback;
  }
}
process.on("unhandledRejection", (err) => {
  stepFailed = true;
  console.error("\n▶ Yakalanmamış hata (çalıştırma sürüyor)");
  console.error(`  neden: ${(err as Error)?.message ?? String(err)}`);
});

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
    await guessSocial(60);
    await rdapLookups(200);
    await turkeyChecks();
    await writeJobSummary((Date.now() - started) / 1000);
    if (!checked) process.exitCode = 1;
    return;
  }
  // Arama servisi testi: her anahtarlı servisle bir deneme araması (kota sayacından düşer); anahtarlar yazdırılmaz.
  if (process.argv.includes("arama")) {
    const q = "galaxy projector night light";
    const tests: [string, string | undefined, () => SearchFn][] = [
      ["Tavily", process.env.TAVILY_API_KEY, () => tavilySearch(process.env.TAVILY_API_KEY!)],
      ["Exa", process.env.EXA_API_KEY, () => exaSearch(process.env.EXA_API_KEY!)],
      ["Firecrawl", process.env.FIRECRAWL_API_KEY, () => firecrawlSearch(process.env.FIRECRAWL_API_KEY!)],
    ];
    console.log(`
▶ Arama servisleri testi ("${q}")`);
    for (const [name, key, make] of tests) {
      if (!key) {
        console.log(`  · ${name}: anahtar yok`);
        continue;
      }
      await tryConsumeQuota(name.toLowerCase(), 1000, 100000);
      const r = await make()(q);
      console.log(r.ok ? `  ✔ ${name}: ${r.results.length} sonuç (${[...new Set(r.results.map((x) => new URL(x.url).hostname))].slice(0, 4).join(", ")})` : `  ✖ ${name}: ${r.reason}`);
    }
    return;
  }
  // Yalnızca Instagram: hesabı bilinmeyen mağazaların ana sayfası + çok tutan gönderiler (~5 dk).
  if (process.argv.includes("instagram")) {
    await findSocialHandles();
    await guessSocial();
    await instagramPosts();
    await productTagPosts();
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
  // Tek seferlik büyütme: önce arama servisleriyle mağaza keşfi (ücretsiz kotaların ~%30'u), sonra tam günlük akış.
  if (process.argv.includes("buyut")) {
    try {
      await discoverFromSearch();
    } catch (err) {
      console.error(`
▶ Arama ile keşif yapılamadı: ${(err as Error).message}`);
    }
  }
  const onlyVerify = process.argv.includes("verify") || process.argv.includes("recheck");
  // Gün içi devam çalıştırması: toplama dışında her şey (yeni alan adı taraması kaldığı yerden sürer, bekleyen mağazalar
  // kontrol edilir, yenilenen kotalarla reklam/Instagram/doğrulama devam eder). Kotalar sayaçlarla korunur.
  // Günün tam işi (05:17 zamanlaması) GitHub tarafından atlandıysa 05:00 UTC'den sonraki ilk devam çalıştırması tam iş yapar.
  const lastFull = await getJobState<string>("last_full_day");
  const fullDue = !onlyVerify && lastFull !== today() && new Date().getUTCHours() >= 5;
  const resume = process.argv.includes("devam") && !fullDue;
  if (process.argv.includes("devam") && fullDue) console.log("\n▶ Bugünün tam işi henüz yapılmadı: bu çalıştırma tam iş olarak sürüyor");
  // Devam çalıştırmaları zincirleme (bir biter, sonraki başlar; günde ~18): hız sınırlı dış servisler (Meta, Instagram, RDAP) günde birkaç kezle sınırlanır,
  // geri kalanlar (DNS taraması, mağaza kontrolü, doğrulama) her çalıştırmada sürer. Tam iş her zaman hepsini yapar.
  const allowed = async (step: string, perDay: number): Promise<boolean> => {
    if (!resume) return true;
    const ok = await tryConsumeQuota(`devam_${step}`, perDay, perDay * 31).catch(() => false);
    if (!ok) console.log(`\n▶ ${step}: bugünkü devam sınırı (${perDay}) doldu, sonraki çalıştırmalarda`);
    return ok;
  };
  const collected = onlyVerify || resume ? true : await step("Toplama", collect, false);
  // Yeni mağazalar: keşif (yeni kayıtlı alan adları) → kontrol → puanı yüksek olanların öne çıkan ürünü aday olur.
  const skipStores = process.argv.includes("no-stores");
  const discovered = onlyVerify || skipStores ? true : await step("Yeni mağaza keşfi", discoverStores, false);
  // Reklam Kütüphanesi'nden keşif: zaten reklam veren mağazalar (aynı çalıştırmada kontrol edilir).
  if (!onlyVerify && !skipStores && (await allowed("reklamdan_kesif", 4))) {
    try {
      await discoverFromAds();
    } catch (err) {
      console.error(`\n▶ Reklamdan keşif yapılamadı: ${(err as Error).message}`);
    }
  }
  const checked = skipStores ? true : await step("Mağaza kontrolü", checkStores, false);
  if (!skipStores && (await allowed("rdap", 3))) {
    try {
      await rdapLookups();
    } catch (err) {
      console.error(`
▶ Alan adı kaydı sorgulanamadı: ${(err as Error).message}`);
    }
  }
  // Aynı ürünü satan mağazalar (kopya puanı aday seçiminden önce toplam puana eklenir).
  const copied = skipStores ? true : await step("Kopyalanan ürünler", copyClusters, false);
  // Ürün bazında: mağazaların ilk 8 ürünü (öne çıkan ürünle sınırlı kalmadan) aynı fotoğrafa göre kümelenir.
  const itemCopied = skipStores ? true : await step("Ürün bazında kopya", itemCopies, false);
  // Reklam sinyali aday seçiminden önce: reklam veren mağazaların toplam puanı yükselir.
  const advertised = (await allowed("reklam_sinyali", 5)) ? await step("Reklam sinyali", adSignals, false) : true;
  // Türkiye'de reklam verenler (Google Reklam Şeffaflık Merkezi, BigQuery): haftada bir, ücretsiz kotayla sınırlı.
  const googled = await step("Google reklamları (Türkiye)", googleAdsTr, false);
  // Instagram her çalıştırmada (2 saatte bir): çalıştırma başına ~130 hesap okuma + 60 tahmin sorgusu = ~190 çağrı, Meta'nın
  // saatlik ~200 çağrı sınırının altında. Hız sınırına takılınca adım kendiliğinden durur, kalanlar sonraki çalıştırmaya kalır.
  if (await allowed("instagram", 18)) {
    try {
      await guessSocial(30, 60);
    } catch (err) {
      console.error(`\n▶ Hesap tahmini yapılamadı: ${(err as Error).message}`);
    }
    await step("Instagram", instagramPosts, undefined);
  }
  try {
    await productTagPosts();
  } catch (err) {
    console.error(`\n▶ Ürün etiketleri aranamadı: ${(err as Error).message}`);
  }
  const promotedHero = skipStores ? true : await step("Yeni mağazalardan aday", promoteStores, false);
  // Öne çıkan ürün dışında, mağazada stoğu tekrar tekrar azalan (asıl satan) ürünler.
  const promotedMovers = skipStores ? true : await step("Satış hareketinden aday", promoteMovers, false);
  // Birden çok bağımsız mağazanın aynı anda sattığı ürünler.
  const promotedCopies = skipStores ? true : await step("Kopyası çok olan ürünlerden aday", promoteCopies, false);
  const promoted = promotedHero && promotedMovers && promotedCopies;
  // Trafik sırası doğrulamadan önce: büyük markalar ağa çıkmadan ve Tavily kredisi harcanmadan elenir.
  const ranked = await step("Trafik sırası", traffic, false);
  const big = await step("Büyük marka eleme", rejectBigBrands, 0);
  if (big) console.log(`\n▶ Büyük marka: ${big} ürün elendi (sıra ≤ #${BIG_BRAND_MAX_RANK.toLocaleString("tr-TR")})`);
  const verified = await step("DTC doğrulama", verify, false);
  if (STRICT_BRAND_CHECK) {
    const n = await step("Katı mod", propagateBrandRejections, 0);
    if (n) console.log(`\n▶ Katı mod: pazaryerinde satan markaların ${n} ürünü daha elendi`);
  }
  const measured = await step("Satış ölçümü", snapshots, false);
  const fx = await step("Döviz kurları", exchangeRates, false);
  try {
    await turkeyChecks();
  } catch (err) {
    console.error(`\n▶ Türkiye araması yapılamadı: ${(err as Error).message}`);
  }
  const sourced = await step("Toptancı araması", suppliers, false);
  const aged = await step("Marka yaşı", brandAges, false);
  // İlk turda Shopify kısıtladıysa: aradan geçen ~45 dakikada kısıtlama çoğu zaman kalkar; kalan mağazalar yeniden denenir.
  if (!skipStores && storeChecksThrottled()) {
    console.log("\n▶ Mağaza kontrolü ikinci tur (ilk turda Shopify kısıtladı)");
    await step("Mağaza kontrolü ikinci tur", checkStores, false);
    await step("Yeni mağazalardan aday", promoteStores, false);
  }
  const scores = await step("Trend skoru", updateTrendScores, null);
  if (scores) console.log(`\n▶ Trend skoru: ${scores.total} ürün, ${scores.updated} değişti`);
  await step("Zamanlama", timing, undefined);
  const winners = await step("Winner skoru", updateWinnerScores, null);
  if (winners !== null) console.log(`▶ Winner skoru: ${winners} ürün`);
  if (!resume && !onlyVerify) await setJobState("last_full_day", today());
  console.log(`\nBitti: ${((Date.now() - started) / 1000).toFixed(1)} sn`);
  await step("İş özeti", () => writeJobSummary((Date.now() - started) / 1000), undefined);
  if (stepFailed || ![collected, discovered, checked, copied, itemCopied, advertised, googled, promoted, verified, ranked, measured, fx, sourced, aged].every(Boolean)) process.exitCode = 1;
}

await main();
