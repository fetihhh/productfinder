// Türkiye'de reklam verenler: Google Reklam Şeffaflık Merkezi'nin resmi BigQuery veri seti
// (bigquery-public-data.google_ads_transparency_center.creative_stats). Veri seti AB (AEA) ve Türkiye'de gösterilen tüm
// reklamları içerir; Meta'nın ücretsiz API'si Türkiye'deki ticari reklamları vermediği için Türk pazarındaki reklamları
// görmenin resmi yolu budur. Reklamın görseli/metni veri setinde yoktur: reklamveren, reklam sayısı, biçim, konu,
// ilk/son gösterim ve gösterim aralığı vardır. Reklamların kendisi Şeffaflık Merkezi'ndeki reklamveren sayfasında görülür.

/** Tablonun tamamı ~150 GB; sorgu yalnızca gereken sütunları tarar. Bundan fazlasını tarayacak sorgu çalıştırılmaz. */
export const GOOGLE_ADS_MAX_GB = 180;

/**
 * Son `days` günde Türkiye'de gösterilen reklamları reklamveren bazında özetler. En az `minNew` yeni reklamı olan
 * (son 30 günde Türkiye'de ilk kez gösterilen) reklamverenler, yeni reklam sayısına göre.
 */
export function googleAdsTrSql(days = 30, minNew = 3, limit = 3000): string {
  const d = (col: string) => `SAFE_CAST(CAST(${col} AS STRING) AS DATE)`;
  const n = (col: string) => `SAFE_CAST(CAST(${col} AS STRING) AS INT64)`;
  return `
SELECT
  advertiser_id,
  ANY_VALUE(advertiser_disclosed_name) AS name,
  ANY_VALUE(advertiser_legal_name) AS legal_name,
  ANY_VALUE(advertiser_location) AS location,
  ANY_VALUE(CAST(advertiser_verification_status AS STRING)) AS verified,
  COUNT(DISTINCT creative_id) AS creatives,
  COUNT(DISTINCT IF(${d("r.first_shown")} >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), creative_id, NULL)) AS new_30d,
  COUNT(DISTINCT IF(${d("r.last_shown")} >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY), creative_id, NULL)) AS active_7d,
  ARRAY_AGG(DISTINCT CAST(ad_format_type AS STRING) IGNORE NULLS LIMIT 5) AS formats,
  ARRAY_AGG(DISTINCT CAST(topic AS STRING) IGNORE NULLS LIMIT 5) AS topics,
  CAST(MIN(${d("r.first_shown")}) AS STRING) AS first_shown,
  CAST(MAX(${d("r.last_shown")}) AS STRING) AS last_shown,
  SUM(${n("r.times_shown_lower_bound")}) AS impressions_low,
  SUM(${n("r.times_shown_upper_bound")}) AS impressions_high,
  ANY_VALUE(creative_page_url) AS sample_url
FROM \`bigquery-public-data.google_ads_transparency_center.creative_stats\`, UNNEST(region_stats) AS r
WHERE r.region_code = 'TR' AND ${d("r.last_shown")} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${Math.floor(days)} DAY)
GROUP BY advertiser_id
HAVING new_30d >= ${Math.floor(minNew)}
ORDER BY new_30d DESC, active_7d DESC
LIMIT ${Math.floor(limit)}`;
}

export type GoogleAdvertiser = {
  advertiser_id: string;
  name: string | null;
  legal_name: string | null;
  location: string | null;
  verified: string | null;
  creatives: number;
  new_30d: number;
  active_7d: number;
  formats: string[];
  topics: string[];
  first_shown: string | null;
  last_shown: string | null;
  impressions_low: number | null;
  impressions_high: number | null;
  sample_url: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 5) : []);

export function parseAdvertiser(r: Record<string, unknown>): GoogleAdvertiser | null {
  const id = str(r.advertiser_id);
  if (!id || !/^AR\d+$/.test(id)) return null;
  return {
    advertiser_id: id,
    name: str(r.name)?.slice(0, 200) ?? null,
    legal_name: str(r.legal_name)?.slice(0, 200) ?? null,
    location: str(r.location)?.slice(0, 10) ?? null,
    verified: str(r.verified)?.slice(0, 40) ?? null,
    creatives: num(r.creatives) ?? 0,
    new_30d: num(r.new_30d) ?? 0,
    active_7d: num(r.active_7d) ?? 0,
    formats: list(r.formats),
    topics: list(r.topics),
    first_shown: str(r.first_shown),
    last_shown: str(r.last_shown),
    impressions_low: num(r.impressions_low),
    impressions_high: num(r.impressions_high),
    sample_url: str(r.sample_url)?.startsWith("https://adstransparency.google.com/") ? str(r.sample_url) : null,
  };
}

/** Şeffaflık Merkezi'nde reklamverenin Türkiye'de gösterilen reklamları. */
export function advertiserPageUrl(advertiserId: string): string {
  return `https://adstransparency.google.com/advertiser/${encodeURIComponent(advertiserId)}?region=TR`;
}

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
/** Reklamveren ve mağaza adlarındaki şirket türü ve genel kelimeler (eşleştirmede yok sayılır). */
const NOISE = new Set([
  "ltd", "sti", "limited", "sirketi", "sirket", "as", "a", "s", "anonim", "ticaret", "tic", "san", "sanayi", "ve", "dis", "pazarlama",
  "eticaret", "e", "inc", "llc", "gmbh", "co", "company", "corp", "bv", "srl", "sl", "sas", "store", "shop", "official", "online", "magaza",
  "magazasi", "tr", "turkiye", "turkey", "com", "the",
]);

/** "XYZ E-Ticaret Ltd. Şti." → "xyz"; anlamlı kısım 4 karakterden kısaysa eşleştirme yapılmaz. */
export function nameKey(name: string | null): string | null {
  if (!name) return null;
  const s = name
    .replace(/[çğıİöşüâîû]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const words = s.split(/[^a-z0-9]+/).filter((w) => w && !NOISE.has(w));
  const key = words.join("");
  return key.length >= 4 ? key : null;
}

const PREFIX = /^(try|get|shop|buy|my|the|go)(?=[a-z0-9]{4,})/;
const SUFFIX = /(?<=[a-z0-9]{4,})(shop|store|official|tr|online|co)$/;

/** Mağazanın eşleştirme anahtarları: alan adının ilk etiketi (ön/son ekleriyle ve onlarsız) ve mağaza adı. */
export function storeKeys(domain: string, shopName: string | null): string[] {
  const label = domain.toLowerCase().replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");
  const keys = new Set<string>();
  for (const k of [label, label.replace(PREFIX, ""), label.replace(SUFFIX, ""), label.replace(PREFIX, "").replace(SUFFIX, ""), nameKey(shopName)]) {
    if (k && k.length >= 4) keys.add(k);
  }
  return [...keys];
}
