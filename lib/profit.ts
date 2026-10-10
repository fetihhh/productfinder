// Kâr hesaplayıcı: kendi sitesinden satan biri için adet başı kâr, reklama harcanabilecek en yüksek tutar
// ve başabaş satış fiyatı. Tüm tutarlar satış para birimindedir (Türkiye senaryolarında TL, yurt dışında USD).
//
// Senaryolar:
//   tr_parcel  Türkiye'deki müşteriye Çin'den tek tek gönderim (dropshipping). Her gönderi gümrükte vergilendirilir
//              (2026'dan beri 30 € muafiyeti yok; AB dışı gönderilerde yaygın oran %60 — kesin oran için gümrük müşaviri).
//   tr_bulk    Toplu ithalat (stok) + Türkiye içinde kargo. Gümrük oranı ürünün GTİP koduna göre değişir;
//              ithalatta ödenen KDV satıştaki KDV'den düşüldüğü için ayrıca maliyet sayılmaz.
//   abroad     Yurt dışındaki müşteriye Çin'den doğrudan gönderim (USD ile satış).

export type ProfitMode = "tr_parcel" | "tr_bulk" | "abroad";

export type ProfitInput = {
  mode: ProfitMode;
  /** Müşterinin ödediği fiyat (KDV dahilse vatIncluded = true). */
  salePrice: number;
  /** 1 USD = rate satış para birimi (USD satışta 1). */
  rate: number;
  unitCostUsd: number;
  shippingUsd: number;
  /** Gümrük vergisi oranı (0,6 = %60), ürün + kargo bedeli üzerinden. */
  dutyPct: number;
  /** Gönderi başına beyanname/hizmet bedeli (satış para birimi). */
  perParcelFee: number;
  /** Türkiye içi kargo (yalnızca toplu ithalatta). */
  domesticShipping: number;
  /** Ödeme altyapısı komisyonu (0,035 = %3,5). */
  paymentPct: number;
  /** İade / hasar / kayıp payı, net satış üzerinden. */
  returnPct: number;
  /** Satış başına reklam maliyeti (CPA). */
  adCost: number;
  vatIncluded: boolean;
  vatPct: number;
};

export type ProfitLine = { label: string; amount: number };

export type ProfitResult = {
  lines: ProfitLine[];
  netRevenue: number;
  /** Reklam hariç tüm maliyetler. */
  costsBeforeAds: number;
  profit: number;
  marginPct: number;
  /** Başabaş: satış başına reklama en fazla bu kadar harcanabilir. */
  maxAdCost: number;
  /** Başabaş ROAS (satış / reklam). null → bu fiyatla reklamsız da zarar. */
  breakevenRoas: number | null;
  /** Girilen reklam maliyetiyle zarar etmemek için en düşük satış fiyatı. null → hesaplanamaz. */
  breakevenPrice: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateProfit(i: ProfitInput): ProfitResult {
  const vatRate = i.vatIncluded ? i.vatPct : 0;
  const product = i.unitCostUsd * i.rate;
  const shipping = i.shippingUsd * i.rate;
  const duty = i.dutyPct * (product + shipping) + (i.mode === "tr_parcel" ? i.perParcelFee : 0);
  const domestic = i.mode === "tr_bulk" ? i.domesticShipping : 0;
  // Fiyata bağlı olmayan maliyetler.
  const fixed = product + shipping + duty + domestic;

  const vat = i.salePrice - i.salePrice / (1 + vatRate);
  const netRevenue = i.salePrice - vat;
  const payment = i.paymentPct * i.salePrice;
  const returns = i.returnPct * netRevenue;
  const costsBeforeAds = fixed + payment + returns;
  const maxAdCost = netRevenue - costsBeforeAds;
  const profit = maxAdCost - i.adCost;

  // Fiyata bağlı pay: net = P / (1 + KDV), komisyon = p·P, iade = r·net → kalan = P·k.
  const k = 1 / (1 + vatRate) - i.paymentPct - i.returnPct / (1 + vatRate);

  const lines: ProfitLine[] = [
    { label: "Satış fiyatı", amount: i.salePrice },
    ...(vat > 0 ? [{ label: `KDV (%${Math.round(vatRate * 100)})`, amount: -vat }] : []),
    { label: "Ürün (toptan)", amount: -product },
    { label: i.mode === "tr_bulk" ? "Navlun (adet başı)" : "Kargo (Çin → müşteri)", amount: -shipping },
    ...(duty > 0 ? [{ label: "Gümrük vergisi ve gönderi bedeli", amount: -duty }] : []),
    ...(domestic > 0 ? [{ label: "Türkiye içi kargo", amount: -domestic }] : []),
    { label: "Ödeme komisyonu", amount: -payment },
    { label: "İade / hasar payı", amount: -returns },
    { label: "Reklam (satış başına)", amount: -i.adCost },
  ];

  return {
    lines: lines.map((l) => ({ ...l, amount: round2(l.amount) })),
    netRevenue: round2(netRevenue),
    costsBeforeAds: round2(costsBeforeAds),
    profit: round2(profit),
    marginPct: i.salePrice > 0 ? Math.round((profit / i.salePrice) * 1000) / 10 : 0,
    maxAdCost: round2(maxAdCost),
    breakevenRoas: maxAdCost > 0 ? Math.round((i.salePrice / maxAdCost) * 100) / 100 : null,
    breakevenPrice: k > 0 ? round2((fixed + i.adCost) / k) : null,
  };
}

/** Senaryo varsayılanları: hepsi değiştirilebilir tahminlerdir. */
export const PROFIT_DEFAULTS: Record<ProfitMode, Pick<ProfitInput, "shippingUsd" | "dutyPct" | "perParcelFee" | "domesticShipping" | "vatIncluded">> = {
  tr_parcel: { shippingUsd: 4, dutyPct: 0.6, perParcelFee: 0, domesticShipping: 0, vatIncluded: true },
  tr_bulk: { shippingUsd: 1, dutyPct: 0.3, perParcelFee: 0, domesticShipping: 100, vatIncluded: true },
  abroad: { shippingUsd: 5, dutyPct: 0, perParcelFee: 0, domesticShipping: 0, vatIncluded: false },
};

export const PAYMENT_PCT = 0.035;
export const RETURN_PCT = 0.05;
/** Satış başına reklam maliyeti varsayılanı: satış fiyatının %25'i (gerçek değer ancak test reklamıyla öğrenilir). */
export const AD_SHARE = 0.25;

/** Önerilen başlangıç satış fiyatı: rakibin fiyatı, satış para birimine çevrilip 10'a yuvarlanır. */
export function suggestedPrice(competitorUsd: number | null, rate: number): number {
  if (competitorUsd === null || !(competitorUsd > 0)) return 0;
  const p = competitorUsd * rate;
  return rate === 1 ? Math.round(p * 100) / 100 : Math.max(10, Math.round(p / 10) * 10);
}
