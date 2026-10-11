// Günlük işin "Türkiye" adımı: doğrulanmış ve takip edilen ürünler Türk pazaryerlerinde aranır (Tavily; günde en fazla
// TR_CHECKS_PER_DAY arama, Tavily'nin aylık ortak kotasından düşer).
import { TAVILY_DAILY_LIMIT, TAVILY_MONTHLY_LIMIT } from "../config/limits.ts";
import { tavilySearch } from "../dtc/marketplaceSearch.ts";
import { TR_DOMAINS, trListings, trQuery } from "../dtc/turkey.ts";
import { tryConsumeQuota } from "../lib/repo.ts";
import { productsForTrCheck, saveTrListings } from "../lib/turkey.ts";

export const TR_CHECKS_PER_DAY = Number(process.env.TR_CHECKS_PER_DAY) || 12;

const brandWords = (domain: string) => {
  const label = domain.split(".")[0].toLowerCase();
  return [label, label.replace(/^(get|try|shop|the|my)/, ""), label.replace(/(shop|store|official)$/, "")].filter((w) => w.length >= 3);
};

export async function turkeyChecks(limit = TR_CHECKS_PER_DAY): Promise<void> {
  const key = process.env.TAVILY_API_KEY;
  console.log("\n▶ Türkiye'de satılıyor mu (Türk pazaryerleri, Tavily)");
  if (!key) {
    console.log("  ! TAVILY_API_KEY yok: atlandı");
    return;
  }
  const search = tavilySearch(key, TR_DOMAINS);
  const targets = await productsForTrCheck(limit);
  let found = 0;
  let checked = 0;
  for (const p of targets) {
    // Ayrı günlük sınır (doğrulamanın kotasını yemesin) + Tavily'nin ortak günlük/aylık kotası.
    if (!(await tryConsumeQuota("tavily_tr", limit, limit * 31)) || !(await tryConsumeQuota("tavily", TAVILY_DAILY_LIMIT, TAVILY_MONTHLY_LIMIT))) {
      console.log("  ! Kota doldu: kalanlar yarına");
      break;
    }
    const r = await search(trQuery(p.name, brandWords(p.brand_domain)));
    if (!r.ok) {
      console.log(`  ? ${p.name}: ${r.reason}`);
      if (r.quota) break;
      continue;
    }
    const listings = trListings(r.results);
    await saveTrListings(p.id, listings);
    checked++;
    if (listings.length) found++;
    console.log(`  ${listings.length ? "🇹🇷" : "·"} ${p.name.slice(0, 60)} — ${listings.length ? `${listings.length} benzer ilan (${[...new Set(listings.map((l) => l.site))].join(", ")})` : "Türkiye'de bulunamadı"}`);
  }
  console.log(`  özet: ${checked} ürün arandı, ${found} tanesinin Türkiye'de benzer ilanı var`);
}
