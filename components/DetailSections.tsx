// Ürün ve mağaza detay sayfalarının ortak bölümleri (sunucu bileşenleri).
import { LineChart, ScoreBars } from "@/components/Charts";
import { STAGE_LABELS, type AdStage } from "@/dtc/adAnalysis";
import { adLibraryPageUrl } from "@/dtc/adLibrary";
import type { AdHistoryPoint, AdSignalRow } from "@/lib/ads";
import { ageLabel, compact, dayLabel, formatPrice } from "@/lib/format";
import type { CopyMember } from "@/lib/newStores";

export function Kpi({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div title={hint} className="card p-4">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1.5 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

const STAGE_STYLE: Record<AdStage, string> = {
  proven: "bg-emerald-500 text-white",
  scaling: "bg-orange-500 text-white",
  testing: "bg-sky-500 text-white",
  stopped: "bg-zinc-500 text-white",
  none: "bg-zinc-400 text-white",
};

export function AdStageBadge({ stage, score }: { stage: AdStage; score?: number }) {
  return (
    <span className={`badge shadow-sm ${STAGE_STYLE[stage]}`} title="Reklam kanıt skoru: süreklilik, ölçeklenme, kopyalanan reklam, erişim, ülke genişlemesi">
      {stage === "proven" ? "🏆" : stage === "scaling" ? "🚀" : stage === "testing" ? "🧪" : "⏸"} {STAGE_LABELS[stage]}
      {score !== undefined && score > 0 ? ` · ${Math.round(score)}` : ""}
    </span>
  );
}

const euro = (n: number) => n.toLocaleString("tr-TR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function AdsSection({ domain, ads, history }: { domain: string; ads: AdSignalRow | null; history: AdHistoryPoint[] }) {
  const total = ads ? (ads.total_ads >= 100 ? "100+" : String(ads.total_ads)) : "0";
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="card-title">Reklam analizi</h2>
          {ads && ads.total_ads > 0 && <AdStageBadge stage={ads.ad_stage} score={Number(ads.ad_score)} />}
        </div>
        <a href={adLibraryPageUrl(ads?.page_id ?? null, domain)} target="_blank" rel="noopener noreferrer" className="link text-sm">
          Reklam Kütüphanesi&apos;nde aç ↗
        </a>
      </div>
      <p className="card-note mb-4">
        Meta Reklam Kütüphanesi (Facebook/Instagram, son 150 günde AB&apos;de gösterilen reklamlar). Kârsız reklam birkaç gün içinde kapatılır:
        haftalarca yayında kalan, kopyalanıp yeni kitlelere ve ülkelere açılan reklamlar ürünün kazandırdığının en güçlü açık kanıtıdır.
      </p>
      {!ads ? (
        <p className="text-sm text-muted">Henüz aranmadı (Meta anahtarı eklendiyse bir sonraki günlük çalıştırmada aranır).</p>
      ) : ads.total_ads === 0 ? (
        <p className="text-sm text-muted">Reklam bulunamadı · son arama {dayLabel(ads.checked_at.slice(0, 10))}</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Yayında" value={String(ads.active_ads)} sub={`son 150 günde ${total}`} />
            <Kpi label="7+ gündür yayında" value={String(ads.active_7d)} sub={`14+ gün: ${ads.active_14d}`} hint="Kârsız reklam birkaç günde kapatılır; uzun yaşayan reklam kazandırıyordur" />
            <Kpi label="En eski reklam" value={ads.longest_active_days !== null ? `${ads.longest_active_days} gün` : "—"} sub="hâlâ yayında" />
            <Kpi label="Son 14 gün" value={`+${ads.new_ads_14d}`} sub="yeni reklam (ölçekleme)" />
            <Kpi label="AB erişimi" value={ads.eu_reach !== null ? compact(ads.eu_reach) : "—"} sub={`${ads.countries.length || "?"} ülke`} />
            <Kpi
              label="Tahmini harcama"
              value={ads.spend_low !== null && ads.spend_high !== null ? `${euro(ads.spend_low)}+` : "—"}
              sub={ads.spend_high !== null ? `≈ ${euro(ads.spend_low!)}–${euro(ads.spend_high)}` : undefined}
              hint="Kaba tahmin: AB erişimi × 1,6 gösterim × 5–12 € CPM. Yalnızca büyüklük fikri verir."
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Reklam kanıt skoru {Math.round(Number(ads.ad_score))}/100</h3>
              {ads.ad_parts ? (
                <ScoreBars
                  parts={[
                    { label: "Süreklilik", value: ads.ad_parts.sureklilik, max: 35, hint: "Hâlâ yayındaki en eski reklamın yaşı ve 7+ gündür yayındaki reklam sayısı" },
                    { label: "Ölçeklenme", value: ads.ad_parts.olceklenme, max: 25, hint: "Son 14 günde açılan reklam sayısı (bütçe artışı)" },
                    { label: "Kopya reklam", value: ads.ad_parts.kopya, max: 15, hint: "Aynı reklam metninin yayındaki kopya sayısı (kazanan reklamı yeni kitlelere açma)" },
                    { label: "Erişim", value: ads.ad_parts.erisim, max: 15, hint: "AB'de toplam erişim" },
                    { label: "Ülke genişlemesi", value: ads.ad_parts.genisleme, max: 10, hint: "Reklamın gösterildiği AB ülkesi sayısı" },
                  ]}
                />
              ) : (
                <p className="text-sm text-muted">Skor bir sonraki aramada hesaplanacak.</p>
              )}
              {ads.countries.length > 0 && (
                <p className="mt-3 flex flex-wrap gap-1">
                  {ads.countries.map((c) => (
                    <span key={c} className="chip py-0 font-mono text-[11px]">
                      {c}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-semibold">Yayındaki reklam</h3>
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
              <div>
                <h3 className="mb-1 text-sm font-semibold">AB erişimi</h3>
                <LineChart
                  points={history.map((h) => ({ day: h.day, y: h.eu_reach }))}
                  format={(n) => compact(n)}
                  minZero
                  color="stroke-orange-500"
                  dot="fill-orange-500"
                  area="fill-orange-500/10"
                  empty="Geçmiş birikiyor"
                />
              </div>
            </div>
          </div>

          {ads.top_products.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Reklamı verilen ürünler</h3>
              <ul className="flex flex-wrap gap-2">
                {ads.top_products.map((p) => (
                  <li key={p.handle}>
                    <a href={`https://${domain}/products/${p.handle}`} target="_blank" rel="noopener noreferrer" className="chip gap-2 bg-surface py-1 hover:border-amber-500/60">
                      <span className="max-w-[260px] truncate">{p.title}</span>
                      <strong className="text-brand-strong">{p.ads} reklam</strong>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ads.creatives.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">En çok tekrarlanan reklam metinleri</h3>
              <ul className="grid gap-2 md:grid-cols-3">
                {ads.creatives.map((cr, i) => (
                  <li key={i} className="rounded-xl border border-line bg-surface-muted/50 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-brand-strong">
                        {cr.active} yayında · {cr.count} kopya
                      </span>
                      {cr.firstStart && <span className="text-muted">{dayLabel(cr.firstStart.slice(0, 10))}&apos;den beri</span>}
                    </div>
                    <p className="line-clamp-3 text-muted">{cr.text || "—"}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Örnek reklamlar</h3>
            <ul className="grid gap-2 md:grid-cols-3">
              {ads.samples.map((s) => (
                <li key={s.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                    <span>
                      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${s.active ? "bg-emerald-500" : "bg-zinc-400"}`} />
                      {s.active ? "Yayında" : "Durdu"}
                      {s.start ? ` · ${dayLabel(s.start.slice(0, 10))}` : ""}
                    </span>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="link">
                      Gör ↗
                    </a>
                  </div>
                  {s.title && <p className="mt-1 font-medium">{s.title}</p>}
                  {s.body && <p className="mt-0.5 line-clamp-3 text-muted">{s.body}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              {ads.page_name ? `Sayfa: ${ads.page_name} · ` : ""}
              {ads.platforms.length ? `${ads.platforms.join(", ")} · ` : ""}son arama {dayLabel(ads.checked_at.slice(0, 10))}
            </p>
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
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Aynı ürünü satan mağazalar ({members.length})</h2>
        {prices.length > 1 && (
          <p className="text-sm">
            Fiyat aralığı <strong>{formatPrice(Math.min(...prices), members[0].currency)}</strong> – <strong>{formatPrice(Math.max(...prices), members[0].currency)}</strong>
          </p>
        )}
      </div>
      <p className="card-note mb-4">
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
            className={`flex flex-col overflow-hidden rounded-xl border bg-surface text-xs transition hover:-translate-y-0.5 hover:shadow-md hover:border-violet-500 ${m.domain === self ? "border-violet-500" : "border-line"}`}
          >
            <span className="block aspect-square overflow-hidden bg-surface-muted">
              {m.hero_image && <img src={m.hero_image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
            </span>
            <span className="flex flex-col gap-0.5 p-2">
              <span className="truncate font-medium text-violet-700 dark:text-violet-400">
                {m.domain}
                {m.domain === self ? " (bu)" : ""}
              </span>
              {m.hero_price !== null && <span className="font-semibold">{formatPrice(Number(m.hero_price), m.currency)}</span>}
              <span className="text-muted">
                {m.first_product_at ? `${ageLabel(m.first_product_at)} önce açıldı` : ""}
                {m.product_count ? ` · ${m.product_count} ürün` : ""}
              </span>
              <span className="text-muted">
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
