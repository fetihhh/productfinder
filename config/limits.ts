// Ücretsiz katman korumaları. Tavily ücretsiz plan: 1.000 kredi/ay (basic arama = 1 kredi).
// Günlük sınır tek seferlik toplu kontroller için TAVILY_DAILY_LIMIT ile geçici olarak değiştirilebilir; aylık sınır değişmez.
export const TAVILY_DAILY_LIMIT = Number(process.env.TAVILY_DAILY_LIMIT) || 30;
export const TAVILY_MONTHLY_LIMIT = 950; // 50 kredi pay bırakılır

/** Bir çalıştırmada en fazla kaç ürün doğrulanır (site başına ~2-3 istek, 1 istek/sn). */
export const VERIFY_PER_RUN = 60;
/** "verified" ürünler bu kadar gün sonra yeniden kontrol edilir (pazaryerine sonradan düşmüş olabilir). */
export const REVERIFY_AFTER_DAYS = 30;
