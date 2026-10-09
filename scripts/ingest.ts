// Günlük iş: kaynaklar → aday ürünler → DTC doğrulama → trend skoru.
// Çalıştırma: npm run ingest            (toplama + doğrulama; GitHub Actions cron'u bunu çağırır)
//             npm run ingest -- verify  (yalnızca doğrulama)
import { STRICT_BRAND_CHECK, TAVILY_DAILY_LIMIT, TAVILY_MONTHLY_LIMIT, VERIFY_PER_RUN } from "../config/limits.ts";
import { tavilySearch, type SearchFn } from "../dtc/marketplaceSearch.ts";
import { verifyProduct, type BrandState } from "../dtc/verify.ts";
import { politeFetch } from "../lib/http.ts";
import {
  filterNewItemIds,
  markSeen,
  propagateBrandRejections,
  productsToVerify,
  saveCandidate,
  saveVerification,
  tryConsumeQuota,
  updateTrendScores,
} from "../lib/repo.ts";
import { enabledAdapters } from "../sources/index.ts";

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

async function verify(): Promise<boolean> {
  const products = await productsToVerify(VERIFY_PER_RUN);
  console.log(`\n▶ DTC doğrulama: ${products.length} ürün`);
  const deps = { fetchPage: politeFetch, searchMarketplaces: quotaGuardedSearch() };
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
            }
          : null);
      const r = await verifyProduct({ brandDomain: p.brand_domain, productUrl: p.product_url, productName: p.name, brand }, deps);
      await saveVerification(p, r);
      if (r.brandCheck) {
        brandCache.set(p.brand_domain, {
          marketplaceStatus: r.brandCheck.status,
          marketplaceEvidence: r.brandCheck.evidence,
          marketplaceCheckedAt: new Date().toISOString(),
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

async function main() {
  const started = Date.now();
  const onlyVerify = process.argv.includes("verify");
  const collected = onlyVerify ? true : await collect();
  const verified = await verify();
  if (STRICT_BRAND_CHECK) {
    const n = await propagateBrandRejections();
    if (n) console.log(`\n▶ Katı mod: pazaryerinde satan markaların ${n} ürünü daha elendi`);
  }
  const scores = await updateTrendScores();
  console.log(`\n▶ Trend skoru: ${scores.total} ürün, ${scores.updated} değişti`);
  console.log(`\nBitti: ${((Date.now() - started) / 1000).toFixed(1)} sn`);
  if (!collected || !verified) process.exitCode = 1;
}

await main();
