import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart, ScoreBars } from "@/components/Charts";
import { SOURCE_NAMES, STATUS } from "@/components/ProductCard";
import { AdsSection, CopiesSection, Kpi } from "@/components/DetailSections";
import { TrackingForm } from "@/components/TrackingForm";
import { availabilityLabel, compact, countryLabel, dayLabel, formatPrice, launchLabel, moneyRange, rangeLabel } from "@/lib/format";
import { getProduct, sameImage } from "@/lib/products";
import { SOURCE_NAMES as SUPPLIER_SOURCES } from "@/dtc/suppliers";
import { REVIEW_TO_SALES, toUsd, visitsFromRank } from "@/lib/winner";
import { getFx } from "@/lib/fx";
import { copiesOf, storeExists } from "@/lib/newStores";
import { ProfitCalculator } from "@/components/ProfitCalculator";

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium">{title}</h2>
      {note && <p className="mb-2 text-xs text-zinc-500">{note}</p>}
      {children}
    </section>
  );
}

export default async function ProductPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const [data, fx] = await Promise.all([getProduct(id), getFx()]);
  if (!data) notFound();
  const { p, history, ranks, suppliers, ads, adHistory, nameEn } = data;
  const [copies, isStore] = await Promise.all([copiesOf(p.brand_domain), storeExists(p.brand_domain)]);
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
          {nameEn && <p className="text-sm text-zinc-500" title="Makine çevirisi (MyMemory)">İngilizcesi: {nameEn}</p>}
          <a href={`https://${p.brand_domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            {p.brand_domain} ↗
          </a>
          {isStore && (
            <Link href={`/m/${p.brand_domain}`} className="ml-3 text-sm font-medium text-sky-700 hover:underline dark:text-sky-400">
              Mağaza detayı →
            </Link>
          )}
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
                {p.supplier_sold !== null && (
                  <>
                    {" "}· tedarikçi satışı <strong>{p.supplier_sold.toLocaleString("tr-TR")}</strong>
                    {p.supplier_sold_per_week !== null && <strong className="text-emerald-700 dark:text-emerald-400"> (+{Number(p.supplier_sold_per_week).toLocaleString("tr-TR")}/hafta)</strong>}
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
                  {(s.sold !== null || s.rating !== null) && (
                    <span className="text-zinc-500">
                      {s.sold !== null ? `${s.sold.toLocaleString("tr-TR")} satıldı` : ""}
                      {s.sold !== null && s.rating !== null ? " · " : ""}
                      {s.rating !== null ? `★ ${Number(s.rating).toLocaleString("tr-TR")}` : ""}
                    </span>
                  )}
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
        <Panel title="Winner skoru nasıl oluştu?" note="Her çubuk kendi azami puanına göre dolar; toplam en fazla 100. Ayrıntılar README'de.">
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
                { label: "Stok hareketi", value: w.parts.hareket ?? 0, max: 10, hint: "Mağazada stokta olan varyant sayısının azalması (satış işareti)" },
                { label: "Rakip mağaza", value: w.parts.kopya ?? 0, max: 10, hint: "Aynı ürünü satan bağımsız yeni mağazalar (talep kanıtı)" },
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
