// Tek seferlik "büyüt" adımı: arama servisleriyle (Tavily, Exa, Firecrawl) ürün + satın alma niyeti aramaları, sonuçlardaki
// sitelerden DNS'te Shopify/ikas/Ticimax olanlar yeni mağaza olarak eklenir (kaynak "arama"). Her servis kendi bütçesiyle
// (ücretsiz kotanın ~%30'u) ve aylık %70 sınırıyla çalışır; ücretli kullanıma geçilmez.
import { EXA_MONTHLY_LIMIT, FIRECRAWL_MONTHLY_LIMIT, TAVILY_MONTHLY_LIMIT, DNS_CONCURRENCY } from "../config/limits.ts";
import { exaSearch, firecrawlSearch, tavilySearch, type SearchFn } from "../dtc/marketplaceSearch.ts";
import { candidateDomains, discoveryQueries } from "../dtc/searchDiscovery.ts";
import { db } from "../lib/db.ts";
import { findStoreDomains } from "../lib/nrd.ts";
import { tryConsumeQuota } from "../lib/repo.ts";
import { insertStores } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Provider = { name: string; quota: string; search: SearchFn; budget: number; monthly: number };

/** Ücretsiz kotaların ~%30'u: Tavily 300 (1.000'in), Exa 420 (~1.400'ün), Firecrawl 150 (~500'ün). */
export const GROW_BUDGET = { tavily: 300, exa: 420, firecrawl: 150 };

export async function discoverFromSearch(): Promise<void> {
  console.log("\n▶ Arama ile mağaza keşfi (Tavily + Exa + Firecrawl; ücretsiz kotaların ~%30'u)");
  const providers: Provider[] = [];
  if (process.env.TAVILY_API_KEY) providers.push({ name: "Tavily", quota: "tavily", search: tavilySearch(process.env.TAVILY_API_KEY, []), budget: GROW_BUDGET.tavily, monthly: TAVILY_MONTHLY_LIMIT });
  if (process.env.EXA_API_KEY) providers.push({ name: "Exa", quota: "exa", search: exaSearch(process.env.EXA_API_KEY, []), budget: GROW_BUDGET.exa, monthly: EXA_MONTHLY_LIMIT });
  if (process.env.FIRECRAWL_API_KEY) providers.push({ name: "Firecrawl", quota: "firecrawl", search: firecrawlSearch(process.env.FIRECRAWL_API_KEY, []), budget: GROW_BUDGET.firecrawl, monthly: FIRECRAWL_MONTHLY_LIMIT });
  if (providers.length === 0) {
    console.log("  ! arama anahtarı yok: atlandı");
    return;
  }
  const queries = discoveryQueries();
  const urls: string[] = [];
  // Servisler paralel, her biri kendi içinde saniyede en fazla 1 istek.
  const stats = await Promise.all(
    providers.map(async (p) => {
      let used = 0;
      let failed = 0;
      for (const q of queries.slice(0, p.budget)) {
        // Günlük sınır bu tek seferlik iş için bütçe kadar; aylık %70 sınırı geçerli.
        if (!(await tryConsumeQuota(p.quota, p.budget + 100, p.monthly))) break;
        used++;
        const r = await p.search(q);
        if (r.ok) urls.push(...r.results.map((x) => x.url));
        else {
          failed++;
          if (r.quota) break;
        }
        await sleep(1100);
      }
      return `${p.name} ${used} arama${failed ? ` (${failed} hata)` : ""}`;
    }),
  );
  const candidates = candidateDomains(urls);
  // Bilinen mağazalar atılır.
  const known = new Set<string>();
  for (let i = 0; i < candidates.length; i += 300) {
    const { data } = await db().from("stores").select("domain").in("domain", candidates.slice(i, i + 300));
    for (const r of data ?? []) known.add(r.domain as string);
  }
  const fresh = candidates.filter((d) => !known.has(d));
  const found = await findStoreDomains(fresh, DNS_CONCURRENCY);
  let added = 0;
  for (const p of ["shopify", "ikas", "ticimax"] as const) {
    const ds = found.filter((f) => f.platform === p).map((f) => f.domain);
    if (ds.length) added += await insertStores(ds, "arama", null, p);
  }
  const by = (p: string) => found.filter((f) => f.platform === p).length;
  console.log(`  ${stats.join(" · ")}`);
  console.log(`  özet: ${urls.length} sonuç → ${candidates.length} site (${fresh.length} yeni) → ${by("shopify")} Shopify, ${by("ikas")} ikas, ${by("ticimax")} Ticimax; ${added} mağaza eklendi`);
}
