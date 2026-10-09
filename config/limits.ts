// Ücretsiz katman korumaları. Tavily ücretsiz plan: 1.000 kredi/ay (basic arama = 1 kredi).
// Günlük sınır tek seferlik toplu kontroller için TAVILY_DAILY_LIMIT ile geçici olarak değiştirilebilir; aylık sınır değişmez.
export const TAVILY_DAILY_LIMIT = Number(process.env.TAVILY_DAILY_LIMIT) || 30;
export const TAVILY_MONTHLY_LIMIT = 950; // 50 kredi pay bırakılır

/** Bir çalıştırmada en fazla kaç ürün doğrulanır (site başına ~2-3 istek, 1 istek/sn). */
export const VERIFY_PER_RUN = 60;
/** "verified" ürünler bu kadar gün sonra yeniden kontrol edilir (pazaryerine sonradan düşmüş olabilir). */
export const REVERIFY_AFTER_DAYS = 30;

/**
 * Katı mod: ürün temiz çıksa bile marka herhangi bir pazaryerinde/büyük perakendecide satıyorsa ürün elenir.
 * Marka sonucu brands tablosunda saklanır ve BRAND_RECHECK_DAYS gün boyunca yeniden aranmaz (Tavily kotası).
 */
export const STRICT_BRAND_CHECK = true;
export const BRAND_RECHECK_DAYS = 30;

/** Bir çalıştırmada en fazla kaç ürünün günlük satış ölçümü alınır (ürün başına 2-3 istek, kota harcamaz). */
export const SNAPSHOT_PER_RUN = 150;

/**
 * Tavily kotası dolduğunda, doğrudan pazaryeri araması (Amazon.com zorunlu + AliExpress + Otto) temiz çıkan ürün
 * "kısmi kontrol" rozetiyle doğrulanmış listelenir ve geniş arama yapılana kadar her gün yeniden denenir.
 * false → kota dolunca ürün eskisi gibi "doğrulanmadı" kalır.
 */
export const VERIFY_WITH_DIRECT_ONLY = true;

/**
 * Büyük marka sınırı: markanın sitesi Tranco dünya sıralamasında bu sıradan daha üstteyse (≈ 500 binden fazla
 * ziyaret/ay) ürün "Büyük marka" olarak elenir. Amaç toptancısı bulunup satılabilecek küçük markaların ürünleri.
 */
export const BIG_BRAND_MAX_RANK = 150_000;

/** Toptancı araması: bir çalıştırmada en fazla kaç ürün, sonuçlar kaç günde bir yenilenir. */
export const SUPPLIER_PER_RUN = 40;
export const SUPPLIER_REFRESH_DAYS = 7;

/** "Yeni mağaza" sınırı: ilk ürünü (ya da alan adı kaydı) bu kadar günden yeni olan mağazalar. */
export const NEW_STORE_MAX_AGE_DAYS = 150;

/**
 * Yeni mağaza keşfi (WhoisDS yeni kayıtlı alan adları → DNS ile Shopify tespiti → mağaza kontrolleri).
 * NRD_BOOTSTRAP_PER_RUN: ilk kurulumda son 60 günün listesinden her çalıştırmada taranan alan adı sayısı
 * (liste bitene kadar; ~3 milyon uygun alan adı → yaklaşık 10 gün).
 * STORE_CHECKS_PER_RUN: bir çalıştırmada kontrol edilen mağaza sayısı (mağaza başına 1–4 istek, alan adı başına 1 istek/sn).
 * STORE_PROMOTE_PER_RUN: puanı yüksek açık mağazalardan aday ürün olarak eklenecek en fazla mağaza.
 */
export const DNS_CONCURRENCY = 300;
export const NRD_BOOTSTRAP_PER_RUN = Number(process.env.NRD_BOOTSTRAP_PER_RUN) || 300_000;
export const STORE_CHECKS_PER_RUN = Number(process.env.STORE_CHECKS_PER_RUN) || 3000;
export const STORE_CHECK_CONCURRENCY = 12;
export const STORE_PROMOTE_PER_RUN = 40;
export const STORE_PROMOTE_MIN_SCORE = 55;

/**
 * Reklam sinyali (Meta Reklam Kütüphanesi API'si, ücretsiz; kimliği doğrulanmış bir Facebook hesabının erişim anahtarı gerekir).
 * AD_CHECKS_PER_RUN: bir çalıştırmada aranan alan adı (alan adı başına 1 istek; API'nin saatlik sınırının altında kalır).
 * AD_MIN_STORE_SCORE: yeni mağazalardan yalnızca bu puanın üstündekiler aranır (istek tasarrufu).
 * Reklamı bulunan alan adı 3 günde, bulunmayan 10 günde bir yeniden aranır.
 * AD_COUNTRIES: tüm konulardaki (ticari) reklamlar yalnızca AB/İngiltere'de gösterilenler için arşivlenir.
 */
export const AD_CHECKS_PER_RUN = Number(process.env.AD_CHECKS_PER_RUN) || 150;
export const AD_MIN_STORE_SCORE = 35;
export const AD_RECHECK_DAYS = { found: 3, none: 10 } as const;
export const AD_COUNTRIES = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "IE", "DK", "FI", "PT"];
export const GRAPH_API_VERSION = "v24.0";
