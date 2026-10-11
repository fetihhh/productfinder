// Reklam Kütüphanesi'nden mağaza keşfi: AB'de yayındaki reklamlarda bir ifade aranır, reklamların bağlantı başlığında
// görünen site adresi ("GETCOSMORA.COM") ayıklanır. Böylece yeni kayıtlı alan adı listesinde olmayan ama zaten reklam
// veren mağazalar bulunur. Pazaryerleri, sosyal ağlar ve barındırma alan adları atlanır.
import { classifyDomain } from "../lib/domain.ts";
import type { ArchivedAd } from "./adLibrary.ts";

const DAY = 86_400_000;

/** Bağlantı başlığında sık geçen ama mağaza olmayan alan adları. */
const SKIP = new Set([
  "facebook.com",
  "fb.com",
  "fb.me",
  "messenger.com",
  "whatsapp.com",
  "wa.me",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "google.com",
  "apple.com",
  "bit.ly",
  "linktr.ee",
  "shopify.com",
  "wix.com",
  "canva.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
]);

export function discoverySearchUrl(term: string, countries: string[], version: string, days: number, now = Date.now()): string {
  const params = new URLSearchParams({
    ad_type: "ALL",
    ad_active_status: "ACTIVE",
    ad_reached_countries: JSON.stringify(countries),
    ad_delivery_date_min: new Date(now - days * DAY).toISOString().slice(0, 10),
    search_terms: term,
    search_type: "KEYWORD_EXACT_PHRASE",
    fields: "id,page_id,page_name,ad_creative_link_captions,ad_delivery_start_time",
    limit: "100",
  });
  return `https://graph.facebook.com/${version}/ads_archive?${params}`;
}

/** Bağlantı başlığından mağaza alan adı: "GETCOSMORA.COM", "shop.brand.de", "www.x.fr/products/y" → kayıtlı alan adı. */
export function captionDomain(caption: string): string | null {
  const m = caption
    .trim()
    .toLowerCase()
    .match(/(?:^|[\s/])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?=$|[\s/?#:])/);
  if (!m) return null;
  const v = classifyDomain(m[1]);
  if (!v.ok || SKIP.has(v.domain)) return null;
  return v.domain;
}

export type DiscoveredStore = { domain: string; ads: number; pages: string[]; firstStart: string | null };

/** Reklamlardan alan adları: reklam sayısı, sayfalar ve en eski başlangıç (çok reklamı olan önce). */
export function domainsFromAds(ads: ArchivedAd[]): DiscoveredStore[] {
  const by = new Map<string, { ads: number; pages: Set<string>; firstStart: string | null }>();
  for (const a of ads) {
    const d = (a.ad_creative_link_captions ?? []).map(captionDomain).find(Boolean);
    if (!d) continue;
    const e = by.get(d) ?? { ads: 0, pages: new Set<string>(), firstStart: null };
    e.ads++;
    if (a.page_name) e.pages.add(a.page_name);
    if (a.ad_delivery_start_time && (!e.firstStart || a.ad_delivery_start_time < e.firstStart)) e.firstStart = a.ad_delivery_start_time;
    by.set(d, e);
  }
  return [...by.entries()]
    .map(([domain, e]) => ({ domain, ads: e.ads, pages: [...e.pages].slice(0, 3), firstStart: e.firstStart }))
    .sort((a, b) => b.ads - a.ads);
}
