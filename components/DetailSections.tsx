// Ürün ve mağaza detay sayfalarının ortak bölümleri (sunucu bileşenleri).
import { LineChart } from "@/components/Charts";
import { adLibraryPageUrl } from "@/dtc/adLibrary";
import type { AdSignalRow } from "@/lib/ads";
import { ageLabel, compact, dayLabel, formatPrice } from "@/lib/format";
import type { CopyMember } from "@/lib/newStores";

export function Kpi({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div title={hint} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function AdsSection({ domain, ads, history }: { domain: string; ads: AdSignalRow | null; history: { day: string; active_ads: number }[] }) {
  return (
    <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Reklamlar (Facebook / Instagram)</h2>
        <a href={adLibraryPageUrl(ads?.page_id ?? null, domain)} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          Reklam Kütüphanesi&apos;nde aç ↗
        </a>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Meta Reklam Kütüphanesi: son 150 günde AB&apos;de gösterilen reklamlar. Haftalarca yayında kalan ve sayısı artan reklamlar, ürünün sattığının en güçlü açık işaretidir.
      </p>
      {!ads ? (
        <p className="text-sm text-zinc-500">Henüz aranmadı (Meta anahtarı eklendiyse bir sonraki günlük çalıştırmada aranır).</p>
      ) : ads.total_ads === 0 ? (
        <p className="text-sm text-zinc-500">Reklam bulunamadı · son arama {dayLabel(ads.checked_at.slice(0, 10))}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Yayında" value={String(ads.active_ads)} sub={`toplam ${ads.total_ads}`} />
              <Kpi label="En eski reklam" value={ads.longest_active_days !== null ? `${ads.longest_active_days} gün` : "—"} sub="hâlâ yayında" />
              <Kpi label="Son 14 gün" value={`+${ads.new_ads_14d}`} sub="yeni reklam" />
              <Kpi label="AB erişimi" value={ads.eu_reach !== null ? compact(ads.eu_reach) : "—"} sub="kişi (tahmini)" />
            </div>
            <ul className="space-y-2 text-sm">
              {ads.samples.map((s) => (
                <li key={s.id} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="flex items-baseline justify-between gap-2 text-xs text-zinc-500">
                    <span>
                      {s.active ? "Yayında" : "Durdu"}
                      {s.start ? ` · ${dayLabel(s.start.slice(0, 10))} başladı` : ""}
                    </span>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">Reklamı gör ↗</a>
                  </div>
                  {s.title && <p className="font-medium">{s.title}</p>}
                  {s.body && <p className="line-clamp-3 text-zinc-600 dark:text-zinc-400">{s.body}</p>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500">
              {ads.page_name ? `Sayfa: ${ads.page_name} · ` : ""}
              {ads.platforms.length ? `${ads.platforms.join(", ")} · ` : ""}son arama {dayLabel(ads.checked_at.slice(0, 10))}
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">Yayındaki reklam sayısı</h3>
            <LineChart
              points={history.map((h) => ({ day: h.day, y: h.active_ads }))}
              format={(n) => String(Math.round(n))}
              minZero
              color="stroke-emerald-500"
              dot="fill-emerald-500"
              area="fill-emerald-500/10"
              empty="Geçmiş birikiyor"
            />
          </div>
        </div>
      )}
    </section>
  );
}

export function CopiesSection({ self, members }: { self: string; members: CopyMember[] }) {
  const sameSeller = members.some((m) => m.copy_same_seller);
  const prices = members.map((m) => m.hero_price).filter((n): n is number => n !== null).map(Number);
  return (
    <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Aynı ürünü satan mağazalar ({members.length})</h2>
        {prices.length > 1 && (
          <p className="text-sm">
            Fiyat aralığı <strong>{formatPrice(Math.min(...prices), members[0].currency)}</strong> – <strong>{formatPrice(Math.max(...prices), members[0].currency)}</strong>
          </p>
        )}
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Öne çıkan ürün fotoğrafı ya da AliExpress görseli aynı olan yeni mağazalar. Birden çok bağımsız mağazanın aynı anda satması ürünün sattığını gösterir,
        ama rekabet de artar: fiyat ve açılış tarihlerine bakın.
        {sameSeller && " Başlık ve fiyat birebir aynı: bu mağazalar büyük ihtimalle aynı satıcının ağı, bağımsız talep kanıtı sayılmaz."}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {members.map((m) => (
          <a
            key={m.domain}
            href={m.hero_handle ? `https://${m.domain}/products/${m.hero_handle}` : `https://${m.domain}/`}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col overflow-hidden rounded border text-xs hover:border-violet-500 ${m.domain === self ? "border-violet-500" : "border-zinc-200 dark:border-zinc-800"}`}
          >
            <span className="block aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900">
              {m.hero_image && <img src={m.hero_image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
            </span>
            <span className="flex flex-col gap-0.5 p-2">
              <span className="truncate font-medium text-violet-700 dark:text-violet-400">
                {m.domain}
                {m.domain === self ? " (bu)" : ""}
              </span>
              {m.hero_price !== null && <span className="font-semibold">{formatPrice(Number(m.hero_price), m.currency)}</span>}
              <span className="text-zinc-500">
                {m.first_product_at ? `${ageLabel(m.first_product_at)} önce açıldı` : ""}
                {m.product_count ? ` · ${m.product_count} ürün` : ""}
              </span>
              <span className="text-zinc-500">
                Puan {Number(m.total_score).toFixed(0)}
                {m.ads_active ? ` · ${m.ads_active} reklam` : ""}
                {m.status !== "live" ? ` · ${m.status === "old" ? "150 günü geçti" : m.status}` : ""}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
