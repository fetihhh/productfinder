// Reklam sinyali: Meta Reklam Kütüphanesi API'si (graph.facebook.com/ads_archive). Resmi ve ücretsizdir; kimliği
// doğrulanmış (facebook.com/ID) bir Facebook hesabının erişim anahtarıyla çalışır. Tüm konulardaki ticari reklamlar
// yalnızca AB/İngiltere'de gösterilenler için arşivlenir; bu yüzden aramalar AB ülkeleriyle yapılır.
// Anahtar URL'ye değil Authorization başlığına konur ve hiçbir yerde yazdırılmaz. API'nin döndürdüğü
// ad_snapshot_url anahtarı içerdiği için saklanmaz; yerine herkese açık Reklam Kütüphanesi bağlantısı kullanılır.

import { clip } from "../lib/text.ts";

export type ArchivedAd = {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  publisher_platforms?: string[];
  eu_total_reach?: number;
  /** AB reklamları: ülke bazında erişim dökümü (hangi ülkelerde gösterildi). */
  age_country_gender_reach_breakdown?: { country?: string }[];
};

export type AdSample = { id: string; url: string; title: string | null; body: string | null; start: string | null; active: boolean };

export type AdSummary = {
  pageId: string | null;
  pageName: string | null;
  activeAds: number;
  /** En fazla 100 (tek sayfa); 100 = "100 ve üzeri". */
  totalAds: number;
  newAds14d: number;
  firstAdAt: string | null;
  lastAdAt: string | null;
  longestActiveDays: number | null;
  euReach: number | null;
  platforms: string[];
  samples: AdSample[];
};

/** activeOnly: yalnızca yayındaki reklamlar (tek sayfa 100 ile sınırlı olduğu için doğru sayım ve en eski reklam için). */
export type AdQuery = { domain: string; pageId: string | null; activeOnly?: boolean };
export type AdSearchResult = { ok: true; ads: ArchivedAd[] } | { ok: false; fatal: boolean; reason: string };
export type AdSearch = (q: AdQuery) => Promise<AdSearchResult>;

const DAY = 86_400_000;
const FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_creative_bodies",
  "ad_creative_link_captions",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "publisher_platforms",
  "eu_total_reach",
  "age_country_gender_reach_breakdown",
].join(",");

/** Herkese açık Reklam Kütüphanesi sayfası (giriş gerektirmez). */
export const adLibraryAdUrl = (id: string) => `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`;

export function adLibraryPageUrl(pageId: string | null, domain: string): string {
  const base = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&media_type=all";
  return pageId ? `${base}&view_all_page_id=${encodeURIComponent(pageId)}` : `${base}&search_type=keyword_unordered&q=${encodeURIComponent(domain)}`;
}

/** Arama adresi: sayfa biliniyorsa sayfanın tüm reklamları, yoksa alan adı geçen reklamlar (son 150 gün). */
export function adSearchUrl(q: AdQuery, countries: string[], version: string, now = Date.now()): string {
  const params = new URLSearchParams({
    ad_type: "ALL",
    ad_active_status: q.activeOnly ? "ACTIVE" : "ALL",
    ad_reached_countries: JSON.stringify(countries),
    ad_delivery_date_min: new Date(now - 150 * DAY).toISOString().slice(0, 10),
    fields: FIELDS,
    limit: "100",
  });
  if (q.pageId) params.set("search_page_ids", JSON.stringify([q.pageId]));
  else params.set("search_terms", q.domain);
  return `https://graph.facebook.com/${version}/ads_archive?${params}`;
}

type GraphError = { message?: string; code?: number; error_subcode?: number };

/** Graph API hatası: anahtar/yetki/hız sınırı/parametre hataları bu çalıştırmadaki tüm aramaları durdurur. */
export function classifyGraphError(status: number, err: GraphError | undefined): { fatal: boolean; reason: string } {
  const code = err?.code;
  const msg = (err?.message ?? `HTTP ${status}`).slice(0, 200);
  if (code === 190) return { fatal: true, reason: `Erişim anahtarı geçersiz ya da süresi dolmuş: ${msg}` };
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code !== undefined && code >= 80000 && code < 80100)) {
    return { fatal: true, reason: `Hız sınırı: ${msg}` };
  }
  if (code === 10 || code === 200 || err?.error_subcode === 2332002 || err?.error_subcode === 2332004) {
    return { fatal: true, reason: `Yetki yok (kimlik doğrulaması ya da Reklam Kütüphanesi koşulları): ${msg}` };
  }
  if (code === 100) return { fatal: true, reason: `Geçersiz parametre: ${msg}` };
  return { fatal: status === 401 || status === 403, reason: msg };
}

export function adLibraryClient(
  token: string,
  opts: { countries: string[]; version: string; fetchImpl?: typeof fetch },
): AdSearch {
  const doFetch = opts.fetchImpl ?? fetch;
  return async (q) => {
    let res: Response;
    try {
      res = await doFetch(adSearchUrl(q, opts.countries, opts.version), {
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    } catch (err) {
      return { ok: false, fatal: false, reason: `Ağ hatası: ${(err as Error).message}` };
    }
    let body: { data?: ArchivedAd[]; error?: GraphError };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { ok: false, fatal: false, reason: `HTTP ${res.status}: JSON değil` };
    }
    if (!res.ok || body.error) return { ok: false, ...classifyGraphError(res.status, body.error) };
    return { ok: true, ads: Array.isArray(body.data) ? body.data : [] };
  };
}

/** Anahtarın geçerliliği ve son kullanma tarihi (0 = süresiz). Anahtar yalnızca istek içinde kullanılır. */
export async function tokenExpiry(
  token: string,
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ valid: boolean; expiresAt: string | null } | null> {
  try {
    const url = `https://graph.facebook.com/${version}/debug_token?${new URLSearchParams({ input_token: token })}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { data?: { is_valid?: boolean; expires_at?: number } };
    if (!body.data) return null;
    const exp = body.data.expires_at ?? 0;
    return { valid: body.data.is_valid === true, expiresAt: exp > 0 ? new Date(exp * 1000).toISOString() : null };
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Reklam bu mağazaya mı ait? Sayfa kimliğiyle arandıysa hepsi; alan adıyla arandıysa reklam metninde/bağlantı
 * başlığında alan adı geçmeli ya da reklamı veren sayfanın adı mağaza adıyla aynı olmalı.
 */
export function adMatches(ad: ArchivedAd, domain: string, shopName: string | null, pageId: string | null): boolean {
  if (pageId) return ad.page_id === pageId;
  const d = domain.toLowerCase().replace(/^www\./, "");
  const texts = [
    ...(ad.ad_creative_link_captions ?? []),
    ...(ad.ad_creative_link_descriptions ?? []),
    ...(ad.ad_creative_link_titles ?? []),
    ...(ad.ad_creative_bodies ?? []),
  ].map((t) => t.toLowerCase());
  if (texts.some((t) => t.includes(d))) return true;
  const shop = shopName ? norm(shopName) : "";
  return shop.length >= 4 && norm(ad.page_name ?? "") === shop;
}

const clipOrNull = (s: string | undefined, n: number) => (s ? clip(s, n) : null);

const isActive = (ad: ArchivedAd, now: number) => !ad.ad_delivery_stop_time || Date.parse(ad.ad_delivery_stop_time) > now;

export function summarizeAds(ads: ArchivedAd[], now = Date.now()): AdSummary {
  const byId = new Map<string, ArchivedAd>();
  for (const a of ads) if (!byId.has(a.id)) byId.set(a.id, a);
  const unique = [...byId.values()];
  const starts = unique.map((a) => a.ad_delivery_start_time).filter((s): s is string => Boolean(s)).sort();
  const active = unique.filter((a) => isActive(a, now));
  const activeStarts = active.map((a) => a.ad_delivery_start_time).filter((s): s is string => Boolean(s)).sort();
  const pages = new Map<string, { name: string | null; n: number }>();
  for (const a of unique) {
    if (!a.page_id) continue;
    const p = pages.get(a.page_id) ?? { name: a.page_name ?? null, n: 0 };
    p.n++;
    pages.set(a.page_id, p);
  }
  const [pageId, page] = [...pages.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? [null, null];
  const reaches = unique.map((a) => a.eu_total_reach).filter((n): n is number => typeof n === "number");
  // Örnekler: önce hâlâ yayında olan en eski reklamlar (uzun süre yayında kalan reklam = kârlı reklam).
  const ordered = [...unique].sort((a, b) => {
    const act = Number(isActive(b, now)) - Number(isActive(a, now));
    return act || (a.ad_delivery_start_time ?? "").localeCompare(b.ad_delivery_start_time ?? "");
  });
  return {
    pageId,
    pageName: page?.name ?? null,
    activeAds: active.length,
    totalAds: unique.length,
    newAds14d: starts.filter((s) => now - Date.parse(s) <= 14 * DAY).length,
    firstAdAt: starts[0] ?? null,
    lastAdAt: starts[starts.length - 1] ?? null,
    longestActiveDays: activeStarts[0] ? Math.max(0, Math.floor((now - Date.parse(activeStarts[0])) / DAY)) : null,
    euReach: reaches.length ? reaches.reduce((s, n) => s + n, 0) : null,
    platforms: [...new Set(unique.flatMap((a) => a.publisher_platforms ?? []))].sort(),
    samples: ordered.slice(0, 3).map((a) => ({
      id: a.id,
      url: adLibraryAdUrl(a.id),
      title: clipOrNull(a.ad_creative_link_titles?.find(Boolean), 120),
      body: clipOrNull(a.ad_creative_bodies?.find(Boolean), 280),
      start: a.ad_delivery_start_time ?? null,
      active: isActive(a, now),
    })),
  };
}
