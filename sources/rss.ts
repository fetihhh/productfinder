import type { RssFeed } from "../config/sources.ts";
import { classifyDomain, registrableDomain } from "../lib/domain.ts";
import { articleBody, extractLinks, metaContent, unwrapRedirect } from "../lib/html.ts";
import { politeFetch } from "../lib/http.ts";
import { productNameFromTitle } from "../lib/productName.ts";
import { parseRss, type FeedItem } from "../lib/rss.ts";
import type { Candidate, SeenItem, SourceAdapter, SourceStats } from "./types.ts";

type LinkSummary = {
  /** marka alan adı → yazıdaki linkleri */
  brands: Map<string, string[]>;
  marketplaces: Map<string, string[]>;
};

/** Yazı gövdesindeki dış linkleri marka ve pazaryeri olarak ayırır. */
export function summarizeLinks(html: string, pageUrl: string, blogDomain: string): LinkSummary {
  const brands = new Map<string, string[]>();
  const marketplaces = new Map<string, string[]>();
  for (const link of extractLinks(html, pageUrl)) {
    const href = unwrapRedirect(link.href);
    const domain = registrableDomain(href);
    if (!domain || domain === blogDomain) continue;
    const verdict = classifyDomain(href);
    const target = verdict.ok ? brands : verdict.kind === "marketplace" ? marketplaces : null;
    if (!target) continue;
    const key = verdict.domain!;
    target.set(key, [...(target.get(key) ?? []), href]);
  }
  return { brands, marketplaces };
}

/** Aynı blogun yazılarının yarısından fazlasında geçen alan adları site geneli (menü, sponsor) sayılır. */
export function sitewideDomains(summaries: LinkSummary[]): Set<string> {
  const result = new Set<string>();
  if (summaries.length < 4) return result;
  const counts = new Map<string, number>();
  for (const s of summaries) {
    for (const d of new Set([...s.brands.keys(), ...s.marketplaces.keys()])) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  for (const [d, c] of counts) if (c >= 3 && c / summaries.length >= 0.3) result.add(d);
  return result;
}

/** En çok link verilen marka alan adını ve tercihen ana sayfa olmayan ürün linkini seçer. */
export function pickBrand(summary: LinkSummary, ignore: Set<string>): { domain: string; url: string } | null {
  let best: { domain: string; urls: string[] } | null = null;
  for (const [domain, urls] of summary.brands) {
    if (ignore.has(domain)) continue;
    if (!best || urls.length > best.urls.length) best = { domain, urls };
  }
  if (!best) return null;
  const productUrl = best.urls.find((u) => new URL(u).pathname.length > 1) ?? best.urls[0];
  return { domain: best.domain, url: productUrl };
}

function firstImage(html: string): string | null {
  const m = html.match(/<img\b[^>]*?\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/i);
  return m ? m[1] : null;
}

export function rssAdapter(feed: RssFeed): SourceAdapter {
  return {
    id: feed.id,
    async fetchCandidates(ctx) {
      const stats: SourceStats = { source: feed.id, items: 0, newItems: 0, candidates: 0, noBrandLink: 0, errors: [] };
      const res = await politeFetch(feed.feedUrl, "application/rss+xml, application/xml;q=0.9, */*;q=0.5");
      if (!res.ok) {
        stats.errors.push(`Besleme alınamadı: ${res.reason}`);
        return { candidates: [], seen: [], stats };
      }
      const blogDomain = registrableDomain(feed.feedUrl)!;
      const items = parseRss(res.text);
      stats.items = items.length;

      const fresh = await ctx.filterNew(feed.id, items.map((i) => i.guid));
      const newItems = items.filter((i) => fresh.has(i.guid));
      stats.newItems = newItems.length;

      const analyzed: { item: FeedItem; summary: LinkSummary; image: string | null }[] = [];
      for (const item of newItems) {
        // Beslemede tam yazı varsa yalnızca onu kullan (sayfadaki kenar çubuğu/sponsor linkleri karışmasın).
        // Yalnızca özet varsa yazı sayfasını aç.
        let summary = summarizeLinks(item.contentHtml, item.link, blogDomain);
        let image = firstImage(item.contentHtml);
        if (!item.hasFullContent && summary.brands.size === 0 && summary.marketplaces.size === 0) {
          const page = await politeFetch(item.link);
          if (!page.ok) {
            stats.errors.push(`${item.link}: ${page.reason}`);
            continue;
          }
          summary = summarizeLinks(articleBody(page.text), item.link, blogDomain);
          image = metaContent(page.text, "og:image") ?? image;
        }
        analyzed.push({ item, summary, image });
      }

      const ignore = sitewideDomains(analyzed.map((a) => a.summary));
      const candidates: Candidate[] = [];
      const seen: SeenItem[] = [];
      for (const { item, summary, image } of analyzed) {
        const brand = pickBrand(summary, ignore);
        if (!brand) {
          stats.noBrandLink++;
          seen.push({ sourceItemId: item.guid, outcome: "no_brand_link" });
          continue;
        }
        seen.push({ sourceItemId: item.guid, outcome: "candidate" });
        const marketplaceLinks = [...summary.marketplaces]
          .filter(([d]) => !ignore.has(d))
          .flatMap(([, urls]) => urls);
        candidates.push({
          source: feed.id,
          sourceItemId: item.guid,
          sourceUrl: item.link,
          title: item.title,
          productName: productNameFromTitle(item.title),
          brandDomain: brand.domain,
          productUrl: brand.url,
          imageUrl: image,
          category: item.categories[0] ?? null,
          postedAt: item.pubDate ?? new Date(),
          engagement: 0,
          comments: item.comments,
          marketplaceLinks,
        });
      }
      stats.candidates = candidates.length;
      return { candidates, seen, stats };
    },
  };
}
