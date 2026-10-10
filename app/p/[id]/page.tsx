import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart, ScoreBars } from "@/components/Charts";
import { SOURCE_NAMES, STATUS } from "@/components/ProductCard";
import { TrackingForm } from "@/components/TrackingForm";
import { ageLabel, availabilityLabel, compact, countryLabel, dayLabel, formatPrice, launchLabel, moneyRange, rangeLabel } from "@/lib/format";
import { getProduct, sameImage } from "@/lib/products";
import { adLibraryPageUrl } from "@/dtc/adLibrary";
import type { AdSignalRow } from "@/lib/ads";
import { SOURCE_NAMES as SUPPLIER_SOURCES } from "@/dtc/suppliers";
import { REVIEW_TO_SALES, toUsd, visitsFromRank } from "@/lib/winner";
import { getFx } from "@/lib/fx";
import { copiesOf, type CopyMember } from "@/lib/newStores";
import { ProfitCalculator } from "@/components/ProfitCalculator";

function Kpi({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div title={hint} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium">{title}</h2>
      {note && <p className="mb-2 text-xs text-zinc-500">{note}</p>}
      {children}
    </section>
  );
}

function AdsSection({ domain, ads, history }: { domain: string; ads: AdSignalRow | null; history: { day: string; active_ads: number }[] }) {
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

function CopiesSection({ self, members }: { self: string; members: CopyMember[] }) {
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

export default async function ProductPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const [data, fx] = await Promise.all([getProduct(id), getFx()]);
  if (!data) notFound();
  const { p, history, ranks, suppliers, ads, adHistory } = data;
  const copies = await copiesOf(p.brand_domain);
  const w = p.winner_breakdown;
  const brand = p.brands;
  const href = p.product_url ?? `https://${p.brand_domain}`;
  const currency = p.currency ?? history.findLast((h) => h.currency)?.currency ?? null;

  const visitPoints = ranks.map((r) => ({ day: r.day, y: r.rank ? visitsFromRank(r.rank).mid : null }));
  const rankPoints = ranks.map((r) => ({ day: r.day, y: r.rank }));
  const reviewPoints = history.map((h) => ({ day: h.day, y: h.review_count }));
  const salesPoints = history.map((h) => ({ day: h.day, y: h.review_count === null ? null : h.review_count * ((REVIEW_TO_SALES.low + REVIEW_TO_SALES.high) / 2) }));
  const pricePoints = history.map((h) => ({ day: h.day, y: h.price }));
  const latestRank = ranks.findLast((r) => r.rank !== null) ?? null;
  const notRanked = ranks.length > 0 && ranks[ranks.length - 1].rank === null;
  const accumulating = `Günlük ölçüm birikiyor (${history.length} gün). Grafik her gün otomatik dolar.`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">← Ürünler</Link>

      <header className="mt-3 grid gap-4 md:grid-cols-[240px_1fr]">
        <a href={href} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
          {p.image_url && <img src={p.image_url} alt={p.name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
        </a>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS[p.dtc_status].cls}`}>{STATUS[p.dtc_status].label}</span>
            {brand?.platform && brand.platform !== "unknown" && (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">{brand.platform}</span>
            )}
            {brand?.country && <span className="text-xs text-zinc-500">{countryLabel(brand.country)}</span>}
            {brand?.ships_to_tr !== null && brand?.ships_to_tr !== undefined && (
              <span className={`text-xs ${brand.ships_to_tr ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}`}>
                · Türkiye'ye {brand.ships_to_tr ? "gönderim var" : "gönderim yok"}
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold leading-snug">
            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.name}</a>
          </h1>
          <a href={`https://${p.brand_domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            {p.brand_domain} ↗
          </a>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {[
              formatPrice(p.price, p.currency) && `Fiyat ${formatPrice(p.price, p.currency)}${p.variant_count && p.variant_count > 1 ? "'den" : ""}`,
              p.review_count !== null && `${p.review_count.toLocaleString("tr-TR")} yorum${p.rating !== null ? ` · ★ ${Number(p.rating).toFixed(1)}` : ""}`,
              availabilityLabel(p.availability),
              launchLabel(p.launched_at) && `Satışta: ${launchLabel(p.launched_at)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {p.dtc_reason && <p className="text-xs text-zinc-500">{p.dtc_reason}</p>}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Winner skoru" value={`${Number(p.winner_score).toFixed(0)}/100`} sub={`Trend ${Number(p.trend_score).toFixed(0)} · Yükseliş ${Number(p.momentum_score).toFixed(0)}`} />
        <Kpi
          label="Site trafiği"
          value={w?.visits ? `≈ ${rangeLabel(w.visits)}` : notRanked ? "< ~100 B" : "—"}
          sub="ziyaret / ay (tahmini)"
          hint="Tranco sırasından kaba tahmin; aralık ×0,5–×2"
        />
        <Kpi
          label="Tranco sırası"
          value={latestRank?.rank ? `#${latestRank.rank.toLocaleString("tr-TR")}` : notRanked ? "1 Mn dışında" : "—"}
          sub={w?.rankChange ? `30 gün: ${w.rankChange >= 1 ? "↑" : "↓"} %${Math.abs(Math.round((w.rankChange - 1) * 100))}` : latestRank ? dayLabel(latestRank.day) : undefined}
          hint="Dünya genelinde site popülerlik sırası (küçük = daha popüler)"
        />
        <Kpi
          label="Toplam satış"
          value={w?.sales ? `≈ ${rangeLabel(w.sales)}` : "—"}
          sub="adet (yorum × 10–50)"
          hint="Alıcıların yaklaşık %2–10'u yorum bırakır varsayımı"
        />
        <Kpi
          label="Aylık satış"
          value={w?.salesPerMonth ? `≈ ${rangeLabel(w.salesPerMonth)}` : "—"}
          sub={w?.salesPerMonth ? `${w.reviewsPerMonth} yeni yorum/ay` : "en az 7 günlük ölçüm gerekir"}
        />
        <Kpi
          label="Aylık ciro"
          value={w?.revenuePerMonth ? `≈ ${moneyRange(w.revenuePerMonth, currency)}` : "—"}
          sub={w?.revenuePerMonth ? "aylık satış × fiyat" : "aylık satış bekleniyor"}
        />
      </div>

      <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Toptancı adayları</h2>
          <p className="text-sm">
            {p.supplier_min_usd !== null && (
              <>
                En düşük toptan fiyat <strong>{formatPrice(p.supplier_min_usd, "USD")}</strong>
                {p.margin_ratio !== null && (
                  <>
                    {" "}· perakende/toptan <strong className={Number(p.margin_ratio) >= 3 ? "text-emerald-700 dark:text-emerald-400" : ""}>≈ {Number(p.margin_ratio).toLocaleString("tr-TR")}×</strong>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          AliExpress, Alibaba ve Made-in-China&apos;da ürün tarifiyle bulunan benzer ilanlar. En benzer ilanların fotoğrafı ürün fotoğraflarıyla
          karşılaştırılır: &quot;Aynı fotoğraf&quot; işaretli ilan büyük ihtimalle mağazanın tedarikçisidir ve toptan fiyat yalnızca bu ilanlardan hesaplanır.
          Marj kargo, gümrük ve vergi hariçtir.
        </p>
        {p.supplier_checked_at === null ? (
          <p className="text-sm text-zinc-500">Toptancı araması bir sonraki günlük çalıştırmada yapılacak.</p>
        ) : suppliers.length === 0 ? (
          <p className="text-sm text-zinc-500">Benzer toptan ilanı bulunamadı.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {suppliers.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col overflow-hidden rounded border hover:border-amber-500 ${sameImage(s) ? "border-emerald-500" : "border-zinc-200 dark:border-zinc-800"}`}
              >
                <span className="relative block aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                  {sameImage(s) && (
                    <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">📷 Aynı fotoğraf</span>
                  )}
                  {s.image_url && <img src={s.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                </span>
                <span className="flex flex-1 flex-col gap-0.5 p-2 text-xs">
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {SUPPLIER_SOURCES[s.source]} · {sameImage(s) ? "aynı fotoğraf" : `%${Math.round(s.similarity * 100)} benzer`}
                  </span>
                  <span className="line-clamp-2" title={s.title}>{s.title}</span>
                  {s.price_min !== null && (
                    <span className="font-semibold">
                      {formatPrice(s.price_min, s.currency ?? "USD")}
                      {s.price_max !== null && s.price_max !== s.price_min ? `–${formatPrice(s.price_max, s.currency ?? "USD")}` : ""}
                    </span>
                  )}
                  {s.moq && <span className="text-zinc-500">MOQ {s.moq}</span>}
                  {s.sold !== null && <span className="text-zinc-500">{s.sold.toLocaleString("tr-TR")} satıldı</span>}
                  {s.supplier_name && <span className="truncate text-zinc-500" title={s.supplier_name}>{s.supplier_name}</span>}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      <ProfitCalculator
        competitorUsd={toUsd(p.price, currency)}
        supplierUsd={p.supplier_min_usd === null ? null : Number(p.supplier_min_usd)}
        supplierByImage={p.supplier_image_match}
        usdTry={fx?.rates.USD ?? null}
        fxDate={fx?.date ?? null}
      />

      <AdsSection domain={p.brand_domain} ads={ads} history={adHistory} />

      {copies.length > 1 && <CopiesSection self={p.brand_domain} members={copies} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Site trafiği — tahmini aylık ziyaret"
          note={notRanked ? "Site şu an Tranco ilk 1 milyonunda değil (≈ 100 binden az ziyaret/ay); boşluklar listede olmadığı günler." : "Tranco sırasından türetilir (2,4·10¹⁰ × sıra^−0,9). Kesin değer değil, eğilimi gösterir."}
        >
          <LineChart points={visitPoints} format={compact} minZero empty={ranks.length ? "Site ilk 1 milyonda değil" : "Trafik verisi yarınki çalıştırmada gelecek"} />
        </Panel>
        <Panel title="Tranco sırası" note="Küçük sayı = daha popüler site. Düşen çizgi trafiğin arttığını gösterir.">
          <LineChart points={rankPoints} format={(n) => `#${Math.round(n).toLocaleString("tr-TR")}`} color="stroke-sky-500" dot="fill-sky-500" area="fill-sky-500/10" empty="Sıra verisi yok" />
        </Panel>
        <Panel title="Yorum sayısı" note={history.length < 7 ? accumulating : "Yorum artış hızı satış hızının en iyi açık göstergesidir."}>
          <LineChart points={reviewPoints} format={compact} color="stroke-amber-500" dot="fill-amber-500" area="fill-amber-500/10" empty="Bu üründe yorum bilgisi okunamadı" />
        </Panel>
        <Panel title="Tahmini toplam satış (adet)" note="Yorum sayısı × 30 (×10–50 aralığının ortası).">
          <LineChart points={salesPoints} format={compact} color="stroke-violet-500" dot="fill-violet-500" area="fill-violet-500/10" empty="Yorum bilgisi olmadan satış tahmini yapılamıyor" />
        </Panel>
        <Panel title="Fiyat" note={currency ? `Para birimi: ${currency}. İndirim/zam günleri burada görünür.` : undefined}>
          <LineChart
            points={pricePoints}
            format={(n) => formatPrice(n, currency) ?? String(n)}
            color="stroke-rose-500"
            dot="fill-rose-500"
            area="fill-rose-500/10"
            empty="Fiyat okunamadı"
          />
        </Panel>
        <Panel title="Winner skoru nasıl oluştu?" note="Her çubuk kendi azami puanına göre dolar. Ayrıntılar README'de.">
          {w ? (
            <ScoreBars
              parts={[
                { label: "Talep", value: w.parts.talep, max: 25, hint: "Toplam yorum (1000 yorum = tam), düşük puanda azalır" },
                { label: "İvme", value: w.parts.ivme, max: 20, hint: "Aylık yeni yorum (30/ay = tam); 7 günlük ölçüm gerekir" },
                { label: "Trafik", value: w.parts.trafik, max: 15, hint: "Tranco sırası + 30 günlük iyileşme" },
                { label: "Gündem", value: w.parts.gundem, max: 10, hint: "Bloglarda anılma (trend skoru)" },
                { label: "Fiyat", value: w.parts.fiyat, max: 10, hint: "25–150 $ bandı tam puan" },
                { label: "Tedarik", value: w.parts.tedarik ?? 0, max: 20, hint: "Toptancıda benzer ürün 8 + kâr marjı (≥4× = 12)" },
                { label: "Reklam", value: w.parts.reklam ?? 0, max: 15, hint: "Meta'da yayındaki reklam sayısı ve en eski reklamın yaşı" },
              ]}
            />
          ) : (
            <p className="text-sm text-zinc-500">Skor bir sonraki çalıştırmada hesaplanacak.</p>
          )}
          {w?.momentum && (
            <>
              <h3 className="mt-4 mb-1.5 text-sm font-medium">Yükseliş skoru: {w.momentum.score.toFixed(0)}/100</h3>
              <ScoreBars
                parts={[
                  { label: "Yorum hızı", value: w.momentum.parts.yorum, max: 45, hint: "Aylık yorum büyümesi (%30/ay = tam)" },
                  { label: "Trafik hızı", value: w.momentum.parts.trafik, max: 35, hint: "30 günde Tranco sırası iyileşmesi (%20 = tam)" },
                  { label: "Gündem", value: w.momentum.parts.gundem, max: 20, hint: "Son 7 günde blog yazısı (2 = tam)" },
                  { label: "Yeni reklam", value: w.momentum.parts.reklam ?? 0, max: 25, hint: "Son 14 günde açılan reklam (3 = tam): reklam bütçesi artıyor" },
                ]}
              />
            </>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Ölçüm geçmişi: {w?.historyDays ?? 0} gün. Satış tahminleri yorum oranı varsayımına dayanır; kesin satış sayısını yalnızca marka bilir.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Kaynaklar">
          <ul className="space-y-1 text-sm">
            {p.mentions.map((m) => (
              <li key={m.url}>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {SOURCE_NAMES[m.source] ?? m.source} · {dayLabel(m.posted_at.slice(0, 10))}
                  {m.title ? ` — ${m.title}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Takip ve Türkiye notu">
          <TrackingForm productId={p.id} t={p.tracking} />
        </Panel>
      </div>
    </main>
  );
}
