// Ürün ve mağaza detay sayfalarının ortak bölümleri (sunucu bileşenleri).
import { LineChart, ScoreBars } from "@/components/Charts";
import { STAGE_LABELS, type AdStage } from "@/dtc/adAnalysis";
import { adLibraryPageUrl } from "@/dtc/adLibrary";
import type { AdHistoryPoint, AdSignalRow } from "@/lib/ads";
import { ageLabel, compact, dayLabel, formatPrice } from "@/lib/format";
import type { CopyMember, OfferRow } from "@/lib/newStores";

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
                {ads.creatives.slice(0, 3).map((cr, i) => (
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

const TIMING_TEXT: Record<string, { title: string; advice: string; cls: string }> = {
  early: { title: "🌱 Erken", advice: "Talep kanıtı var, rakip az. Girmek için iyi bir an: hızlı test edin.", cls: "border-emerald-500/40 bg-emerald-500/8" },
  peak: { title: "🔥 Zirvede", advice: "Ürün kanıtlanmış ama rakipler çoğalıyor. Ancak daha iyi teklif, fiyat ya da reklamla girin.", cls: "border-amber-500/40 bg-amber-500/8" },
  saturated: { title: "🧱 Doymuş", advice: "Çok mağaza satıyor ya da reklam veriyor. Fiyat rekabeti sert; farklı bir açı yoksa geçin.", cls: "border-red-500/40 bg-red-500/8" },
  fading: { title: "📉 Sönüyor", advice: "Reklamlar durmuş ve satış hareketi yok. Trend geçiyor olabilir.", cls: "border-zinc-500/40 bg-zinc-500/8" },
  unproven: { title: "Henüz kanıt yok", advice: "Reklam ya da satış hareketi görülmedi. Kanıt birikince etiket güncellenir.", cls: "border-line bg-surface-muted/50" },
};

/** Zamanlama kartı: etiket, gerekçe ve ne yapılmalı. */
export function TimingCard({ timing, reason }: { timing: string | null; reason: string | null }) {
  if (!timing) return null;
  const t = TIMING_TEXT[timing] ?? TIMING_TEXT.unproven;
  return (
    <div className={`rounded-2xl border p-4 ${t.cls}`}>
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">Zamanlama</div>
      <div className="mt-1 text-lg font-semibold">{t.title}</div>
      <p className="mt-1 text-sm">{t.advice}</p>
      {reason && <p className="mt-1 text-xs text-muted">{reason}</p>}
    </div>
  );
}

const yes = (b: boolean | undefined) => (b ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓</span> : <span className="text-muted">—</span>);

/** Rakip teklif karşılaştırması: aynı ürünü satan mağazalar ve reklamlarında öne çıkan teklifler. */
export function CompetitorOffers({ rows }: { rows: OfferRow[] }) {
  if (rows.length === 0) return null;
  const prices = rows.map((r) => r.hero_price).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null;
  const cur = rows.find((r) => r.currency)?.currency ?? null;
  const n = rows.length;
  const freeShip = rows.filter((r) => r.offer?.freeShipping).length;
  const bundles = rows.filter((r) => r.offer?.bundle).length;
  const guarantees = rows.filter((r) => r.offer?.guaranteeDays).length;
  const ad = rows.reduce(
    (s, r) => {
      const o = r.ad_offers;
      if (!o?.total) return s;
      s.total += o.total;
      s.free += o.freeShipping ?? 0;
      s.bundle += o.bundle ?? 0;
      s.urgency += o.urgency ?? 0;
      s.guarantee += o.guarantee ?? 0;
      for (const d of o.discounts ?? []) s.discounts.set(d, (s.discounts.get(d) ?? 0) + 1);
      return s;
    },
    { total: 0, free: 0, bundle: 0, urgency: 0, guarantee: 0, discounts: new Map<number, number>() },
  );
  const topDiscounts = [...ad.discounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
  const advice = [
    median !== null && `${n > 1 ? "Rakiplerin medyan fiyatı" : "Bu mağazanın fiyatı"} ${formatPrice(median, cur)}`,
    n > 1 && freeShip > n / 2 && `rakiplerin çoğu ücretsiz kargo veriyor (${freeShip}/${n})`,
    n > 1 && bundles > 0 && `${bundles} rakip paket/çoklu alım sunuyor`,
    topDiscounts.length > 0 && `reklamlarda en çok %${topDiscounts[0]} indirim vurgulanıyor`,
    ad.urgency > 0 && `reklamların ${ad.urgency}'inde aciliyet ("bugün", "son stok") var`,
  ].filter(Boolean);

  return (
    <section className="card mt-5 p-5">
      <h2 className="card-title">Rakip teklifleri</h2>
      <p className="card-note mb-4">
        {n > 1
          ? `Aynı ürünü satan ${n} mağazanın fiyatı ve satış teklifleri. Kendi fiyatınızı ve teklifinizi belirlerken rakiplerin altında kalmak yerine daha iyi teklif (paket, garanti, ücretsiz kargo) vermek çoğu zaman daha kârlıdır.`
          : "Bu mağazanın satış teklifi. Aynı ürünü satan başka mağaza bulununca karşılaştırma burada görünür."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Mağaza</th>
              <th className="py-2 pr-3 font-medium">Fiyat</th>
              <th className="py-2 pr-3 font-medium">İndirim</th>
              <th className="py-2 pr-3 font-medium">Ücretsiz kargo</th>
              <th className="py-2 pr-3 font-medium">Garanti</th>
              <th className="py-2 pr-3 font-medium">Paket</th>
              <th className="py-2 pr-3 font-medium">Reklam</th>
              <th className="py-2 font-medium">Açılış</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.domain} className={`border-b border-line last:border-0 ${r.self ? "bg-amber-500/5" : ""}`}>
                <td className="py-2 pr-3">
                  <a href={r.hero_handle ? `https://${r.domain}/products/${r.hero_handle}` : `https://${r.domain}/`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {r.shop_name ?? r.domain}
                  </a>
                  <div className="text-xs text-muted">
                    {r.domain}
                    {r.self ? " · bu" : ""}
                  </div>
                </td>
                <td className="py-2 pr-3 font-semibold tabular-nums">{r.hero_price !== null ? formatPrice(r.hero_price, r.currency) : "—"}</td>
                <td className="py-2 pr-3 tabular-nums">{r.offer?.discountPct ? `%${r.offer.discountPct}` : "—"}</td>
                <td className="py-2 pr-3">{yes(r.offer?.freeShipping)}</td>
                <td className="py-2 pr-3">{r.offer?.guaranteeDays ? `${r.offer.guaranteeDays} gün` : <span className="text-muted">—</span>}</td>
                <td className="py-2 pr-3">{yes(r.offer?.bundle)}</td>
                <td className="py-2 pr-3">{r.ad_stage && r.ad_stage !== "none" ? <AdStageBadge stage={r.ad_stage} /> : <span className="text-muted">—</span>}</td>
                <td className="py-2 text-xs text-muted">{r.first_product_at ? `${ageLabel(r.first_product_at)} önce` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.every((r) => !r.offer) && <p className="mt-2 text-xs text-muted">Teklif bilgisi mağazaların bir sonraki kontrolünde okunacak.</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Reklamlarda öne çıkan teklifler</h3>
          {ad.total === 0 ? (
            <p className="text-sm text-muted">Reklam metni yok.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {topDiscounts.map((d) => (
                <span key={d} className="chip bg-surface py-1">
                  %{d} indirim
                </span>
              ))}
              {ad.free > 0 && <span className="chip bg-surface py-1">Ücretsiz kargo · {ad.free}/{ad.total}</span>}
              {ad.bundle > 0 && <span className="chip bg-surface py-1">Paket / 2x1 · {ad.bundle}</span>}
              {ad.urgency > 0 && <span className="chip bg-surface py-1">Aciliyet · {ad.urgency}</span>}
              {ad.guarantee > 0 && <span className="chip bg-surface py-1">Garanti · {ad.guarantee}</span>}
              {topDiscounts.length === 0 && ad.free + ad.bundle + ad.urgency + ad.guarantee === 0 && <span className="text-sm text-muted">Belirgin bir teklif kalıbı yok.</span>}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Öneri</h3>
          <p className="text-sm text-muted">{advice.length ? `${advice.join("; ")}.` : "Karşılaştırma için yeterli veri yok."}</p>
          {n > 1 && (
            <p className="mt-1 text-xs text-muted">
              Garanti veren: {guarantees}/{n} · paket sunan: {bundles}/{n} · ücretsiz kargo: {freeShip}/{n}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}