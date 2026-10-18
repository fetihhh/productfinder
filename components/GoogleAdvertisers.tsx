import Link from "next/link";
import { advertiserPageUrl } from "@/dtc/googleAds";
import { compact, dayLabel } from "@/lib/format";
import type { GoogleAdvertiserRow } from "@/lib/googleAds";

export type GoogleAdsState = { day: string; status: string; gb?: number; rows?: number; matched?: number; reason?: string } | null;

const FORMAT: Record<string, string> = { TEXT: "Metin", IMAGE: "Görsel", VIDEO: "Video" };
const KIND: Record<string, string> = { kucuk: "küçük e-ticaret", buyuk: "büyük şirket", ajans: "ajans", diger: "ürün satmıyor" };
const fullDay = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function GoogleAdsNotice({ state, empty, smallOnly }: { state: GoogleAdsState; empty: boolean; smallOnly: boolean }) {
  const box = "mt-5 rounded-2xl border p-4 text-sm";
  if (!state) {
    return (
      <div className={`${box} border-amber-400/60 bg-amber-500/5`}>
        <p className="font-semibold">Türkiye reklamları henüz okunmadı</p>
        <p className="mt-1 text-muted">Google BigQuery anahtarı tanımlanınca ilk çalıştırmada dolar (haftada bir yenilenir).</p>
      </div>
    );
  }
  if (state.status === "error" || (state.status === "skipped" && empty)) {
    return (
      <div className={`${box} border-amber-400/60 bg-amber-500/5`}>
        <p className="font-semibold">{state.status === "error" ? "Son okuma başarısız" : "Ücretsiz kotayı korumak için bu hafta okunmadı"}</p>
        {state.reason && <p className="mt-1 text-xs text-muted">{state.reason}</p>}
      </div>
    );
  }
  return (
    <p className={`${box} border-line bg-surface text-muted`}>
      {dayLabel(state.day)} tarihli özet: son 30 günde Türkiye&apos;de en az 3 yeni reklam açan {state.rows ?? 0} reklamveren, {state.matched ?? 0} tanesi
      bilinen bir mağaza.{" "}
      {smallOnly
        ? "Yalnızca ürün satan küçük ve orta e-ticaret reklamverenleri gösteriliyor: 30 günde 500+ reklam açan büyük şirketler, bilinen markalar ve zincirler, reklam/medya ajansları ve ürün satmayanlar (turizm, eğitim, restoran, finans…) gizli."
        : "Büyük şirketler ve ajanslar dahil hepsi gösteriliyor."}{" "}
      Kaynak Google Reklam Şeffaflık Merkezi (Google Arama, YouTube, Görüntülü Reklam Ağı, Shopping); reklamların kendisi
      reklamverenin Şeffaflık Merkezi sayfasında görülür.
    </p>
  );
}

export function GoogleAdvertiserList({ rows, showKind }: { rows: GoogleAdvertiserRow[]; showKind: boolean }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 font-medium">Reklamveren</th>
            <th className="px-3 py-2.5 text-right font-medium" title="Son 30 günde Türkiye'de ilk kez gösterilen reklam">Yeni (30 g)</th>
            <th className="px-3 py-2.5 text-right font-medium" title="Son 7 günde Türkiye'de gösterilen reklam">Yayında (7 g)</th>
            <th className="px-3 py-2.5 text-right font-medium">Toplam</th>
            <th className="px-3 py-2.5 font-medium">Biçim · konu</th>
            <th className="px-3 py-2.5 text-right font-medium" title="Türkiye'deki gösterim aralığı (Google'ın verdiği alt–üst sınır)">Gösterim</th>
            <th className="px-3 py-2.5 font-medium">İlk reklam</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.advertiser_id} className="border-b border-line/60 last:border-0">
              <td className="max-w-[280px] px-3 py-2.5">
                <p className="truncate font-medium" title={r.legal_name ?? undefined}>
                  {r.name ?? r.legal_name ?? r.advertiser_id}
                </p>
                <p className="truncate text-xs text-muted">
                  {r.location ? `${r.location} · ` : ""}
                  {showKind && r.kind ? `${KIND[r.kind] ?? r.kind} · ` : ""}
                  {r.domain ? (
                    <Link href={`/m/${r.domain}`} className="text-amber-700 hover:underline dark:text-amber-300">
                      {r.domain}
                    </Link>
                  ) : (
                    (r.legal_name ?? "")
                  )}
                </p>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.new_30d}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.active_7d}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted">{r.creatives}</td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-muted">
                {[...(r.formats ?? []).map((f) => FORMAT[f] ?? f), ...(r.topics ?? [])].join(" · ")}
              </td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums text-muted">
                {r.impressions_high ? `${compact(r.impressions_low ?? 0)}–${compact(r.impressions_high)}` : "—"}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted">{r.first_shown ? fullDay.format(new Date(`${r.first_shown}T00:00:00Z`)) : "—"}</td>
              <td className="px-3 py-2.5 text-right">
                <a href={advertiserPageUrl(r.advertiser_id)} target="_blank" rel="noopener noreferrer" className="btn btn-sm whitespace-nowrap">
                  Reklamları ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
