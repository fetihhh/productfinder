import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart, ScoreBars } from "@/components/Charts";
import { AdsSection, CopiesSection, Kpi } from "@/components/DetailSections";
import { STATUS } from "@/components/ProductCard";
import { movementOrder } from "@/dtc/storeSnapshot";
import { ageLabel, countryLabel, dayLabel, formatPrice } from "@/lib/format";
import { getStoreDetail } from "@/lib/newStores";

const STORE_STATUS: Record<string, string> = { live: "Açık", closed: "Şifreli / boş", pending: "Kontrol bekliyor", dead: "Kapanmış", old: "150 günü geçti" };

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="card-title">{title}</h2>
      {note && <p className="card-note mb-3">{note}</p>}
      {children}
    </section>
  );
}

export default async function StorePage({ params }: PageProps<"/m/[domain]">) {
  const { domain } = await params;
  const data = await getStoreDetail(decodeURIComponent(domain).toLowerCase());
  if (!data) notFound();
  const { s, checks, ads, adHistory, copies } = data;
  const live = checks.filter((c) => c.status === "live");
  const stockPct = s.products_snapshot?.length
    ? Math.round((s.products_snapshot.reduce((n, i) => n + i.a, 0) / Math.max(1, s.products_snapshot.reduce((n, i) => n + i.v, 0))) * 100)
    : null;
  const items = [...(s.products_snapshot ?? [])].sort(movementOrder);
  const parts = s.score_parts;
  const heroHref = s.hero_handle ? `https://${s.domain}/products/${s.hero_handle}` : `https://${s.domain}/`;

  return (
    <main className="page">
      <Link href="/yeni" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>Yeni mağazalar</Link>

      <header className="mt-3 grid gap-4 md:grid-cols-[240px_1fr]">
        <a href={heroHref} target="_blank" rel="noopener noreferrer" className="card block aspect-[4/3] overflow-hidden bg-surface-muted">
          {s.hero_image && <img src={s.hero_image} alt={s.hero_title ?? ""} referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
        </a>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="badge bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/25 dark:text-sky-300">
              {STORE_STATUS[s.status] ?? s.status}
              {s.first_product_at ? ` · ${ageLabel(s.first_product_at)} önce açıldı` : ""}
            </span>
            {s.products && (
              <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS[s.products.dtc_status as keyof typeof STATUS]?.cls ?? ""}`}>
                {STATUS[s.products.dtc_status as keyof typeof STATUS]?.label ?? s.products.dtc_status}
              </span>
            )}
            {(s.ali_image_count ?? 0) > 0 && (
              <span className="badge bg-orange-500/12 text-orange-700 ring-1 ring-orange-500/25 dark:text-orange-300">
                AliExpress görseli: {s.ali_image_count} ürün
              </span>
            )}
            {s.country && <span className="text-muted">{countryLabel(s.country)}</span>}
            {s.ships_to_tr !== null && <span className={s.ships_to_tr ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}>· Türkiye&apos;ye {s.ships_to_tr ? "gönderim var" : "gönderim yok"}</span>}
          </div>
          <h1 className="h1 leading-tight">{s.shop_name ?? s.domain}</h1>
          <a href={`https://${s.domain}/`} target="_blank" rel="noopener noreferrer" className="link text-sm">
            {s.domain} ↗
          </a>
          <p className="text-sm text-muted">
            Öne çıkan ürün:{" "}
            <a href={heroHref} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
              {s.hero_title ?? "—"}
            </a>
            {s.hero_price !== null && ` · ${formatPrice(Number(s.hero_price), s.currency)}`}
          </p>
          <p className="text-xs text-muted">
            {s.registered_on ? `Alan adı kaydı ${dayLabel(s.registered_on)} · ` : ""}keşif {dayLabel(s.discovered_at.slice(0, 10))} · {s.checks} kontrol
            {s.last_checked_at ? ` · son ${dayLabel(s.last_checked_at.slice(0, 10))}` : ""}
            {s.status === "live" ? ` · sonraki ${dayLabel(s.next_check_at.slice(0, 10))}` : ""}
          </p>
          {s.product_id && (
            <Link href={`/p/${s.product_id}`} className="btn-primary btn-sm mt-1">
              Aday ürün: doğrulama, toptancı ve kâr hesabı →
            </Link>
          )}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Toplam puan" value={`${Number(s.total_score).toFixed(0)}/100`} sub={`mağaza ${Number(s.store_score).toFixed(0)} · reklam ${Number(s.ad_points).toFixed(0)} · kopya ${Number(s.copy_points).toFixed(0)}`} />
        <Kpi label="Ürün" value={String(s.product_count ?? "?")} sub={s.min_price !== null ? `${formatPrice(Number(s.min_price), s.currency)} – ${formatPrice(Number(s.max_price), s.currency)}` : undefined} />
        <Kpi label="Stokta" value={stockPct !== null ? `%${stockPct}` : "—"} sub="varyantların stokta olanı" hint="Satılan varyantlar tükendikçe düşer" />
        <Kpi label="Stok azalması" value={String(s.stock_drops)} sub={`${s.moving_products} üründe`} hint="İki kontrol arasında stokta olan varyant sayısının azaldığı durumlar (satış işareti)" />
        <Kpi label="Reklam" value={ads ? String(ads.active_ads) : "—"} sub={ads ? "yayında" : "aranmadı"} />
        <Kpi label="Rakip" value={String(s.copy_count)} sub={s.copy_same_seller ? "aynı satıcı ağı olabilir" : "aynı ürünü satan mağaza"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Mağaza puanı nasıl oluştu?" note="Her çubuk kendi azami puanına göre dolar. Merch (baskılı giyim) eksi puandır.">
          {parts ? (
            <ScoreBars
              parts={[
                { label: "Odak", value: parts.odak, max: 25, hint: "Az ürün (tek ürün mağazası tam)" },
                { label: "Yenilik", value: parts.yenilik, max: 15, hint: "İlk ürünün yaşı" },
                { label: "Dropship", value: parts.dropship, max: 20, hint: "Uzun teslimat, dünya geneli gönderim ya da AliExpress görseli" },
                { label: "İndirim", value: parts.indirim, max: 10, hint: "Ürünlerin çoğu indirimli" },
                { label: "Fiyat", value: parts.fiyat, max: 10, hint: "Öne çıkan ürün 15–150" },
                { label: "Hareket", value: parts.hareket, max: 20, hint: "Son iki kontrol arasında yeni ürün ve tükenen varyant" },
                { label: "Reklam", value: Number(s.ad_points), max: 25, hint: "Meta'da yayındaki reklamlar" },
                { label: "Kopya", value: Number(s.copy_points), max: 15, hint: "Aynı ürünü satan bağımsız mağazalar" },
                ...(parts.merch ? [{ label: "Merch (eksi)", value: Math.abs(parts.merch), max: 20, hint: "Baskılı giyim mağazası: toplamdan düşülür" }] : []),
              ]}
            />
          ) : (
            <p className="text-sm text-muted">Döküm bir sonraki kontrolde hesaplanacak.</p>
          )}
        </Panel>
        <Panel title="Ürün sayısı" note="Her kontroldeki ürün sayısı; artış mağazanın büyüdüğünü gösterir.">
          <LineChart points={live.map((c) => ({ day: c.day, y: c.product_count }))} format={(n) => String(Math.round(n))} minZero empty="En az iki kontrol gerekir" />
        </Panel>
        <Panel title="Stokta olan varyantlar" note="Düşüş = satılan ya da stoğu biten varyantlar (varyant sayısı aynıyken).">
          <LineChart
            points={live.map((c) => ({ day: c.day, y: c.total_variants ? Math.round(((c.available_variants ?? 0) / c.total_variants) * 100) : null }))}
            format={(n) => `%${Math.round(n)}`}
            minZero
            color="stroke-rose-500"
            dot="fill-rose-500"
            area="fill-rose-500/10"
            empty="En az iki kontrol gerekir"
          />
        </Panel>
      </div>

      <section className="card mt-5 p-5">
        <h2 className="card-title">Ürünler — en hareketliden</h2>
        <p className="card-note mb-4">
          Her kontrolde kaydedilen ürün listesi. Stoğu azalan ve fiyatı değişen ürünler önce: mağazanın asıl sattığı ürün genelde en üsttedir. Hareket ikinci
          kontrolden itibaren sayılır.
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Ürün listesi puanı 35&apos;in üstündeki mağazalarda bir sonraki kontrolde kaydedilecek.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((i) => (
              <a
                key={i.h}
                href={`https://${s.domain}/products/${i.h}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col overflow-hidden rounded-xl border bg-surface text-xs transition hover:-translate-y-0.5 hover:shadow-md hover:border-amber-500 ${i.so > 0 ? "border-rose-400" : "border-line"}`}
              >
                <span className="relative block aspect-square overflow-hidden bg-surface-muted">
                  {i.img && <img src={i.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  {i.so > 0 && <span className="badge absolute top-1.5 left-1.5 bg-rose-600 text-white shadow-sm">📉 {i.so} kez stok azaldı</span>}
                  {i.ali && <span className="badge absolute bottom-1.5 left-1.5 bg-orange-500 text-white shadow-sm">AliExpress görseli</span>}
                </span>
                <span className="flex flex-1 flex-col gap-0.5 p-2">
                  <span className="line-clamp-2 font-medium" title={i.t}>{i.t}</span>
                  {i.p !== null && (
                    <span>
                      <strong>{formatPrice(i.p, s.currency)}</strong>
                      {i.cp !== null && <span className="ml-1 text-muted line-through">{formatPrice(i.cp, s.currency)}</span>}
                    </span>
                  )}
                  {i.pc > 0 && i.pp !== null && (
                    <span className="text-amber-700 dark:text-amber-400">
                      Fiyat {formatPrice(i.pp, s.currency)} → {formatPrice(i.p, s.currency)}
                    </span>
                  )}
                  <span className="text-muted">
                    Stok {i.a}/{i.v} varyant{i.c ? ` · ${ageLabel(i.c)} önce eklendi` : ""}
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      <AdsSection domain={s.domain} ads={ads} history={adHistory} />
      {copies.length > 1 && <CopiesSection self={s.domain} members={copies} />}
    </main>
  );
}
