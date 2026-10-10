"use client";

import { useState } from "react";
import { AD_SHARE, calculateProfit, PAYMENT_PCT, PROFIT_DEFAULTS, RETURN_PCT, suggestedPrice, type ProfitMode } from "@/lib/profit";

const input = "field tabular-nums";

const MODES: { value: ProfitMode; label: string; hint: string }[] = [
  { value: "tr_parcel", label: "Türkiye · Çin'den tek tek gönderim", hint: "Dropshipping: sipariş gelince tedarikçi doğrudan müşteriye yollar. Her paket gümrükte vergilendirilir." },
  { value: "tr_bulk", label: "Türkiye · toplu ithalat (stok)", hint: "Toplu alıp Türkiye'de stok tutarsınız; müşteriye yurt içi kargoyla gönderirsiniz." },
  { value: "abroad", label: "Yurt dışı müşteri (USD)", hint: "ABD/AB müşterisine Çin'den doğrudan gönderim; fiyatlar USD." },
];

function Field({ label, hint, value, onChange, step = "any", suffix }: { label: string; hint?: string; value: number; onChange: (n: number) => void; step?: string; suffix?: string }) {
  return (
    <label className="block text-xs" title={hint}>
      <span className="text-muted">
        {label}
        {suffix ? ` (${suffix})` : ""}
      </span>
      <input type="number" min={0} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} className={input} />
    </label>
  );
}

/** Oran → yüzde kutusu değeri (0,035 → 3,5; kayan nokta artığı olmadan). */
const pct = (x: number) => Math.round(x * 1000) / 10;

function money(n: number, cur: string): string {
  return n.toLocaleString("tr-TR", { style: "currency", currency: cur, maximumFractionDigits: cur === "TRY" ? 0 : 2 });
}

/**
 * Kendi sitesinden satış için adet başı kâr hesabı. Varsayılanlar: rakibin fiyatı (TL'ye çevrilmiş), en ucuz benzer
 * toptan ilan ve senaryo tahminleri; hepsi değiştirilebilir.
 */
export function ProfitCalculator({
  competitorUsd,
  supplierUsd,
  supplierByImage,
  usdTry,
  fxDate,
}: {
  competitorUsd: number | null;
  supplierUsd: number | null;
  /** Toptan fiyat fotoğrafla eşleşen ilandan mı (değilse yalnızca metin benzerliği). */
  supplierByImage: boolean;
  usdTry: number | null;
  fxDate: string | null;
}) {
  const [mode, setMode] = useState<ProfitMode>("tr_parcel");
  const [rate, setRate] = useState(usdTry ?? 0);
  const initialPrice = suggestedPrice(competitorUsd, usdTry ?? 0);
  const [salePrice, setSalePrice] = useState(initialPrice);
  const [unitCostUsd, setUnitCostUsd] = useState(supplierUsd ?? 0);
  const [shippingUsd, setShippingUsd] = useState(PROFIT_DEFAULTS.tr_parcel.shippingUsd);
  const [dutyPct, setDutyPct] = useState(pct(PROFIT_DEFAULTS.tr_parcel.dutyPct));
  const [perParcelFee, setPerParcelFee] = useState(0);
  const [domesticShipping, setDomesticShipping] = useState(PROFIT_DEFAULTS.tr_bulk.domesticShipping);
  const [paymentPct, setPaymentPct] = useState(pct(PAYMENT_PCT));
  const [returnPct, setReturnPct] = useState(pct(RETURN_PCT));
  const [adCost, setAdCost] = useState(Math.round(initialPrice * AD_SHARE));
  const [vatIncluded, setVatIncluded] = useState(true);

  const abroad = mode === "abroad";
  const cur = abroad ? "USD" : "TRY";

  function switchMode(next: ProfitMode) {
    const d = PROFIT_DEFAULTS[next];
    const toAbroad = next === "abroad";
    setMode(next);
    setShippingUsd(d.shippingUsd);
    setDutyPct(pct(d.dutyPct));
    setVatIncluded(d.vatIncluded);
    setDomesticShipping(d.domesticShipping);
    // Para birimi değişince (TL ↔ USD) fiyat ve reklam maliyeti yeniden önerilir.
    if (toAbroad !== abroad) {
      const price = suggestedPrice(competitorUsd, toAbroad ? 1 : rate);
      setSalePrice(price);
      setAdCost(toAbroad ? Math.round(price * AD_SHARE * 100) / 100 : Math.round(price * AD_SHARE));
    }
  }

  const r = calculateProfit({
    mode,
    salePrice,
    rate: abroad ? 1 : rate,
    unitCostUsd,
    shippingUsd,
    dutyPct: dutyPct / 100,
    perParcelFee,
    domesticShipping,
    paymentPct: paymentPct / 100,
    returnPct: returnPct / 100,
    adCost,
    vatIncluded: !abroad && vatIncluded,
    vatPct: 0.2,
  });
  // Alış fiyatı girilmeden kâr gösterilirse yanıltıcı olur (maliyet 0 sayılır).
  const missingCost = !(unitCostUsd > 0);
  const good = r.profit > 0 && !missingCost;

  return (
    <section className="card mt-5 p-5">
      <h2 className="card-title">Kâr hesabı — kendi sitenden satış</h2>
      <p className="card-note mb-4">
        Varsayılanlar tahmindir; kendi teklif ve fiyatlarınızla değiştirin. Gümrük oranı ürünün GTİP koduna göre değişir: kesin oran için gümrük
        müşavirine danışın. Gelir vergisi ve sabit giderler (site, abonelik) dahil değildir.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="text-muted">Senaryo</span>
            <select value={mode} onChange={(e) => switchMode(e.target.value as ProfitMode)} className={input}>
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-muted">{MODES.find((m) => m.value === mode)?.hint}</span>
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field
              label="Satış fiyatı"
              suffix={cur}
              value={salePrice}
              onChange={setSalePrice}
              hint={competitorUsd ? `Rakibin fiyatı ≈ ${money(competitorUsd, "USD")}${abroad ? "" : ` ≈ ${money(competitorUsd * rate, "TRY")}`}` : undefined}
            />
            {!abroad && <Field label="1 USD" suffix="TL" value={rate} onChange={setRate} hint={fxDate ? `TCMB döviz satış kuru, ${fxDate}` : "Kur bulunamadı; elle girin"} />}
            <Field label="Toptan fiyat" suffix="USD" value={unitCostUsd} onChange={setUnitCostUsd} hint="Toptancı adaylarındaki en ucuz benzer ilan; tedarikçiyle anlaştığınız fiyatı girin" />
            <Field
              label={mode === "tr_bulk" ? "Navlun / adet" : "Kargo / paket"}
              suffix="USD"
              value={shippingUsd}
              onChange={setShippingUsd}
              hint={mode === "tr_bulk" ? "Toplu gönderimin adet başına düşen taşıma bedeli" : "Çin'den müşteriye kargo (AliExpress Standard vb.)"}
            />
            <Field
              label="Gümrük vergisi"
              suffix="%"
              value={dutyPct}
              onChange={setDutyPct}
              hint={
                mode === "tr_parcel"
                  ? "Şubat 2026'dan beri 30 € muafiyeti yok; AB dışından gelen gönderilerde yaygın oran %60 (ürün + kargo üzerinden)"
                  : mode === "tr_bulk"
                    ? "Gümrük + ilave gümrük vergisi; GTİP koduna göre değişir"
                    : "Müşteri ülkesindeki ithalat vergisi satıcıya düşüyorsa girin"
              }
            />
            {mode === "tr_parcel" && <Field label="Paket başı beyanname" suffix="TL" value={perParcelFee} onChange={setPerParcelFee} hint="Her gönderi için gümrük beyanname/hizmet bedeli (kargo firmasına sorun)" />}
            {mode === "tr_bulk" && <Field label="Yurt içi kargo" suffix="TL" value={domesticShipping} onChange={setDomesticShipping} hint="Anlaşmalı kargo firmasının paket başı ücreti" />}
            <Field label="Ödeme komisyonu" suffix="%" value={paymentPct} onChange={setPaymentPct} hint="iyzico / PayTR / Shopify Payments vb." />
            <Field label="İade / hasar" suffix="%" value={returnPct} onChange={setReturnPct} />
            <Field label="Reklam / satış (CPA)" suffix={cur} value={adCost} onChange={setAdCost} hint="Bir satış için reklama harcanan tutar. Gerçek değer ancak test reklamıyla öğrenilir; başlangıç tahmini fiyatın %25'i" />
          </div>
          {!abroad && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={vatIncluded} onChange={(e) => setVatIncluded(e.target.checked)} className="h-4 w-4" />
              Satış fiyatına %20 KDV dahil (şirket/şahıs şirketi olarak satıyorsanız)
            </label>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-2xl border p-4 ${missingCost ? "border-amber-300 dark:border-amber-800" : good ? "border-emerald-300 dark:border-emerald-800" : "border-red-300 dark:border-red-800"}`}>
              <div className="text-xs text-muted">Adet başı net kâr</div>
              {missingCost ? (
                <div className="text-sm font-medium text-amber-700 dark:text-amber-400">Önce toptan fiyatı girin</div>
              ) : (
                <>
                  <div className={`text-xl font-semibold tabular-nums ${good ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{money(r.profit, cur)}</div>
                  <div className="text-xs text-muted">satışın %{r.marginPct.toLocaleString("tr-TR")}&apos;i</div>
                </>
              )}
            </div>
            <div className="rounded-2xl border border-line p-4" title="Reklam hariç tüm maliyetler düşüldükten sonra kalan: satış başına reklama bundan fazlası harcanırsa zarar edilir">
              <div className="text-xs text-muted">Reklama en fazla (başabaş)</div>
              <div className="text-xl font-semibold tabular-nums">{money(Math.max(0, r.maxAdCost), cur)}</div>
              <div className="text-xs text-muted">{r.breakevenRoas !== null ? `başabaş ROAS ${r.breakevenRoas.toLocaleString("tr-TR")}` : "reklamsız da zarar"}</div>
            </div>
            <div className="col-span-2 rounded-2xl border border-line p-4 text-sm">
              {r.breakevenPrice !== null ? (
                <>
                  Bu maliyetlerle zarar etmemek için en düşük satış fiyatı: <strong className="tabular-nums">{money(r.breakevenPrice, cur)}</strong>
                </>
              ) : (
                "Komisyon ve KDV oranları satışın tamamını götürüyor; oranları kontrol edin."
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.label} className="border-b border-line last:border-0">
                  <td className="py-1 text-muted">{l.label}</td>
                  <td className={`py-1 text-right tabular-nums ${l.amount < 0 ? "" : "font-medium"}`}>{money(l.amount, cur)}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-medium">Kalan</td>
                <td className={`pt-2 text-right font-semibold tabular-nums ${good ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{money(r.profit, cur)}</td>
              </tr>
            </tbody>
          </table>
          {supplierUsd === null ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">Bu ürün için toptan fiyat bulunamadı; tedarikçiden aldığınız fiyatı girin.</p>
          ) : supplierByImage ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Toptan fiyat, ürünle aynı fotoğrafı kullanan ilandan alındı.</p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Toptan fiyat yalnızca isim benzerliğiyle bulunan ilandan alındı; yukarıdaki toptancı adaylarından aynı ürün olduğunu kontrol edip doğru fiyatı girin.
            </p>
          )}
          {!abroad && !usdTry && <p className="text-xs text-amber-700 dark:text-amber-400">Güncel kur henüz alınmadı; 1 USD karşılığını elle girin.</p>}
        </div>
      </div>
    </section>
  );
}
