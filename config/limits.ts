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
