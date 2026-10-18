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
  // Gösterim sınırları çok büyük olabilir (üst sınır açık uçlu): toplam taşmasın diye satır başına 10¹² ile sınırlanıp ondalıklı toplanır.
  const n = (col: string) => `LEAST(SAFE_CAST(CAST(${col} AS STRING) AS FLOAT64), 1e12)`;
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
/** bigint sütunu için tam sayı (JavaScript'in güvenli tam sayı sınırında kesilir). */
const big = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.round(v), Number.MAX_SAFE_INTEGER) : null);
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
    impressions_low: big(r.impressions_low),
    impressions_high: big(r.impressions_high),
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

/**
 * Reklamveren türü: winner aramak için yalnızca "kucuk" (ürün satan küçük/orta e-ticaret) işe yarar. Liste aksi halde
 * pazaryerleri, zincir mağazalar, holdingler ve müşterileri adına reklam veren medya ajanslarıyla dolar.
 * - ajans: adında reklam/medya/ajans/dijital/iletişim/danışmanlık geçenler ve bilinen medya ajansı grupları
 * - buyuk: 30 günde 500+ reklam, 50 milyon+ gösterim ya da holding, banka, zincir mağaza, kamu kurumu vb.
 * - diger: hiçbir konusu ürün kategorisi olmayanlar (turizm, finans, eğitim, eğlence, restoran…)
 */
export type AdvertiserKind = "kucuk" | "buyuk" | "ajans" | "diger";

export const BIG_CREATIVES = 500;
export const BIG_IMPRESSIONS = 50_000_000;

const AGENCY =
  /\b(reklam\w*|medya|media|ajans\w*|agency|iletisim|tanitim|danismanlik|dijital|digital|interaktif|interactive|yayincilik|organizasyon|advertising|groupm|mindshare|vivaki|phd|ingage|liberdatum|innocean|publicis|havas|dentsu|omnicom|wavemaker|starcom|zenith|mediacom|carat|mimeda)\b/;
const BIG =
  /\b(holding|bankasi|bank|sigorta|telekom\w*|vakfi|belediye\w*|universite\w*|kurumu|bakanligi|gayrimenkul|yatirim|havayollari|otomotiv|finans\w*|faktoring|leasing|hastane\w*|enerji|magazacilik|magazalari|perakende|alisveris merkezi|elektronik ticaret|bilisim hizmetleri)\b/;
/** Reklam sayısı eşiğin altında kalan bilinen büyük markalar (çok uluslu üreticiler, zincirler, pazaryerleri). */
const BIG_BRANDS =
  /\b(colgate|palmolive|castrol|nestle|l.?oreal|unilever|procter|gamble|henkel|danone|reckitt|beiersdorf|nivea|coca cola|pepsi|ulker|eti gida|torku|pinar|sutas|arcelik|beko|vestel|bosch|siemens|philips|samsung|apple|huawei|xiaomi|oppo|lenovo|teknosa|vatan bilgisayar|migros|a101|bim birlesik|sok marketler|carrefour|trendyol|dsm grup|hepsiburada|d market|amazon|ciceksepeti|getir|yemeksepeti|koton|defacto|lc waikiki|boyner|ipekyol|vakko|mavi giyim|penti|flo magaza|derimod|beymen|karaca|english home|madame coco|watsons|gratis|rossmann|decathlon|ikea|koctas|bauhaus|sodexo|ford|toyota|renault|fiat|hyundai|tofas|opet|shell|turkcell|vodafone)\b/;
/** Ürün satmayan sektörler (adından). */
const SERVICE =
  /\b(restoran\w*|restaurant|pizza|burger|kebap|lokanta|durum\w*|tavuk dunyasi|cafe|otel\w*|hotel|seyahat|tatil\w*|filmcilik|sinema|ogretim|egitim|kolej\w*|okul\w*|kurs\w*|klinik\w*|hastane\w*|tip merkezi|saglik hizmetleri|noropsikiyatri|insaat|taahhut|emlak|lojistik|kargo|nakliyat|avukat\w*|hukuk)\b/;
const PRODUCT_TOPICS = new Set([
  "Apparel", "Apparel & Accessories", "Beauty & Personal Care", "Health & Beauty", "Health", "Home & Garden", "Home Improvement",
  "Computers & Consumer Electronics", "Electronics", "Hobbies, Games & Leisure", "Sports & Fitness", "Sports & Outdoors", "Shopping",
  "Furniture", "Baby & Kids", "Toys & Games", "Pets & Animals", "Animals & Pet Supplies", "Occasions & Gifts", "Luggage & Bags",
  "Travel, Luggage & Bags", "Household Supplies", "Hardware", "Arts, Crafts & Party Supplies", "Food, Beverages & Tobacco",
  "Food & Groceries", "Grocery", "Commercial", "Automotive",
]);

const plain = (s: string) => s.replace(/[çğıİöşüâîû]/g, (c) => TR_MAP[c] ?? c).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function advertiserKind(a: Pick<GoogleAdvertiser, "name" | "legal_name" | "creatives" | "impressions_low" | "topics">): AdvertiserKind {
  const name = plain(`${a.name ?? ""} ${a.legal_name ?? ""}`);
  if (AGENCY.test(name)) return "ajans";
  if (a.creatives >= BIG_CREATIVES || (a.impressions_low ?? 0) >= BIG_IMPRESSIONS || BIG.test(name) || BIG_BRANDS.test(name)) return "buyuk";
  if (SERVICE.test(name)) return "diger";
  // Adında "turizm" geçen gıda/tekstil şirketleri çoktur: yalnızca konusu da turizmse ürün satmıyor sayılır.
  if (/\bturizm\b/.test(name) && a.topics.includes("Travel & Tourism")) return "diger";
  if (a.topics.length && !a.topics.some((t) => PRODUCT_TOPICS.has(t))) return "diger";
  return "kucuk";
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
