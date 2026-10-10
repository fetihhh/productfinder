import Link from "next/link";
import { STATUS } from "@/components/ProductCard";
import { AdStageBadge } from "@/components/DetailSections";
import { OverlayBadge, ScoreRing, Stat, TimingBadge, Toggle } from "@/components/ui";
import { NICHES, nicheLabel } from "@/dtc/niche";
import { adLibraryPageUrl } from "@/dtc/adLibrary";
import { adSignalsFor } from "@/lib/ads";
import { ageLabel, compact, countryLabel, formatPrice } from "@/lib/format";
import { listNewStores, metaAdsState, parseStoreFilters, storeFunnel, type MetaAdsState } from "@/lib/newStores";

/** Reklam aramasının durumu: anahtar eksik, geçersiz ya da süresi yakında doluyorsa uyarır. */
function MetaNotice({ meta }: { meta: MetaAdsState | null }) {
  const box = "mt-4 rounded-2xl border px-4 py-3 text-sm";
  if (!meta || meta.status === "no_token") {
    return (
      <p className={`${box} border-line bg-surface text-muted`}>
        Reklam sinyali kapalı: Meta Reklam Kütüphanesi anahtarı eklenmemiş. Kurulum README&apos;de (&quot;Reklam sinyali&quot;).
      </p>
    );
  }
  if (meta.status === "invalid" || (meta.status === "stopped" && !meta.reason?.startsWith("Hız sınırı"))) {
    return (
      <p className={`${box} border-red-300 text-red-700 dark:border-red-800 dark:text-red-400`}>
        Reklam araması çalışmadı: {meta.reason ?? "anahtar geçersiz"}. README → &quot;Reklam sinyali&quot; → anahtarı yenileme.
      </p>
    );
  }
  const daysLeft = meta.expiresAt ? Math.floor((Date.parse(meta.expiresAt) - Date.now()) / 86_400_000) : null;
  return (
    <p className={`${box} ${daysLeft !== null && daysLeft <= 10 ? "border-amber-400 text-amber-800 dark:text-amber-300" : "border-line bg-surface text-muted"}`}>
      Reklam sinyali: son çalıştırmada {meta.checked ?? 0} alan adı arandı, {meta.found ?? 0} tanesinde reklam bulundu
      {meta.status === "stopped" ? " (API hız sınırına takıldı, yarın devam eder)" : ""}.
      {daysLeft !== null && ` Meta anahtarının süresi ${daysLeft} gün sonra doluyor${daysLeft <= 10 ? " — README'deki adımlarla yenileyin" : ""}.`}
    </p>
  );
}

export default async function NewStoresPage({ searchParams }: PageProps<"/yeni">) {
  const f = parseStoreFilters(await searchParams);
  const [{ rows, error }, funnel, meta] = await Promise.all([listNewStores(f), storeFunnel(), metaAdsState()]);
  const ads = await adSignalsFor(rows.map((r) => r.domain));

  const funnelItems: [string, number, string][] = [
    ["Bulunan", funnel.total, "bg-zinc-400"],
    ["Açık", funnel.live, "bg-emerald-500"],
    ["Kapalı/şifreli", funnel.closed, "bg-amber-500"],
    ["Kontrol bekleyen", funnel.pending, "bg-sky-500"],
    ["Kapanmış", funnel.dead, "bg-red-500"],
    ["Aday ürünü eklenen", funnel.promoted, "bg-orange-500"],
  ];

  return (
    <main className="page">
      <p className="eyebrow">Keşif</p>
      <h1 className="h1 mt-1">Yeni mağazalar</h1>
      <p className="lead">
        Son 5 ayda açılmış küçük Shopify mağazaları. Her gün yeni kayıtlı alan adları taranır, açılan mağazalar düzenli kontrol edilir (puanı yüksek
        olanlar her gün): kaç ürün var, yeni ürün eklendi mi, stok tükeniyor mu, aynı ürünü başka mağazalar da satıyor mu.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {funnelItems.map(([label, n, dot]) => (
          <span key={label} className="chip gap-1.5 bg-surface py-1">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {label}
            <strong className="font-semibold tabular-nums text-foreground">{n.toLocaleString("tr-TR")}</strong>
          </span>
        ))}
      </div>
      <MetaNotice meta={meta} />
      {f.group && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-800 dark:text-violet-300">
          Aynı ürünü satan mağazalar ({f.group} kümesi).
          <Link href="/yeni" className="font-semibold underline-offset-4 hover:underline">
            Tüm mağazalar
          </Link>
        </p>
      )}

      <form className="card mt-6 p-3 sm:p-4">
        {f.group && <input type="hidden" name="group" value={f.group} />}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input name="q" type="search" defaultValue={f.q} placeholder="Mağaza veya ürün ara…" className="field pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select name="age" defaultValue={String(f.maxAge)} className="field sm:w-40" aria-label="Mağaza yaşı">
              <option value="30">İlk ürün ≤ 30 gün</option>
              <option value="60">≤ 60 gün</option>
              <option value="90">≤ 90 gün</option>
              <option value="150">≤ 5 ay</option>
            </select>
            <input type="number" name="min" min={0} max={100} defaultValue={f.minScore || ""} placeholder="Min puan" className="field sm:w-28" aria-label="Minimum puan" />
            <select name="niche" defaultValue={f.niche} className="field sm:w-48" aria-label="Niş">
              <option value="">Tüm nişler</option>
              {NICHES.map((n) => (
                <option key={n.key} value={n.key}>
                  {n.label}
                </option>
              ))}
              <option value="other">Diğer</option>
            </select>
            <select name="sort" defaultValue={f.sort} className="field col-span-2 sm:w-56" aria-label="Sıralama">
              <option value="score">Mağaza puanı</option>
              <option value="new">En yeni</option>
              <option value="products">En az ürün (tek ürün)</option>
              <option value="ads">En güçlü reklam kanıtı</option>
              <option value="copies">Aynı ürünü satan en çok mağaza</option>
              <option value="moving">En çok stok hareketi</option>
            </select>
          </div>
          <button className="btn-primary sm:px-5">Filtrele</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <Toggle name="moving" checked={f.moving} label="📉 Satış hareketi" title="Kontroller arasında stokta olan varyant sayısı azalan mağazalar" />
          <Toggle name="ali" checked={f.ali} label="AliExpress görseli" title="Ürün görselinin dosya adı AliExpress görsel kimliği: fotoğraf AliExpress'ten alınmış" />
          <Toggle name="ads" checked={f.ads} label="Reklam veriyor" />
          <Toggle name="tr" checked={f.tr} label="Türkiye'ye gönderir" />
        </div>
      </form>

      {error && <p className="mt-6 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">Veritabanı hatası: {error}</p>}
      {!error && rows.length === 0 && (
        <div className="card mt-6 grid place-items-center px-6 py-16 text-center">
          <p className="text-base font-medium">Bu filtrelerle açık yeni mağaza yok</p>
          <p className="mt-1 max-w-md text-sm text-muted">Keşif her gün çalışır; yeni kayıtlı alan adlarındaki mağazalar genelde birkaç gün ile birkaç hafta içinde açılır.</p>
          <Link href="/yeni" className="btn mt-4">
            Filtreleri sıfırla
          </Link>
        </div>
      )}

      <p className="mt-5 text-sm text-muted">
        <span className="font-semibold text-foreground">{rows.length}</span> mağaza{rows.length === 120 ? " (ilk 120)" : ""}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((s) => {
          const href = s.hero_handle ? `https://${s.domain}/products/${s.hero_handle}` : `https://${s.domain}/`;
          const discount = s.product_count ? Math.round(((s.discounted_count ?? 0) / s.product_count) * 100) : 0;
          const ad = ads.get(s.domain);
          const status = s.products ? STATUS[s.products.dtc_status as keyof typeof STATUS] : null;
          return (
            <article key={s.domain} className="card card-hover group flex flex-col overflow-hidden">
              <div className="relative">
                <Link href={`/m/${s.domain}`} className="block aspect-[4/3] overflow-hidden bg-surface-muted">
                  {s.hero_image ? (
                    <img
                      src={s.hero_image}
                      alt={s.hero_title ?? ""}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-sm text-muted">Görsel yok</span>
                  )}
                </Link>
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <OverlayBadge>
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                      {ageLabel(s.first_product_at) ?? "?"} önce açıldı
                    </OverlayBadge>
                    {s.stock_drops > 0 && <span className="badge bg-rose-500 text-white shadow-sm">📉 {s.stock_drops} stok azalması</span>}
                    {ad && ad.total_ads > 0 && ad.ad_stage !== "none" && <AdStageBadge stage={ad.ad_stage} score={Number(ad.ad_score)} />}
                    <TimingBadge timing={s.timing} reason={s.timing_reason} hideUnproven />
                    {s.copy_count > 0 && !s.copy_same_seller && <span className="badge bg-violet-500 text-white shadow-sm">{s.copy_count} rakip</span>}
                  </div>
                  <ScoreRing
                    score={Number(s.total_score)}
                    label="puan"
                    title={`Toplam ${Number(s.total_score).toFixed(0)} = mağaza ${Number(s.store_score).toFixed(0)} + reklam ${Number(s.ad_points).toFixed(0)}`}
                  />
                </div>
                {status && (
                  <span className="absolute bottom-2.5 left-2.5">
                    <OverlayBadge>
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      Aday ürün · {status.label}
                    </OverlayBadge>
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h2 className="line-clamp-2 leading-snug font-semibold tracking-tight">
                    <Link href={`/m/${s.domain}`} className="hover:text-brand-strong">
                      {s.hero_title ?? s.shop_name ?? s.domain}
                    </Link>
                  </h2>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-muted hover:text-foreground">
                    <span className="truncate">
                      {s.shop_name ? `${s.shop_name} · ` : ""}
                      {s.domain}
                    </span>
                    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </a>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <Stat label="Fiyat" value={s.hero_price !== null ? formatPrice(s.hero_price, s.currency)! : "—"} sub={discount ? `%${discount} indirimli` : undefined} />
                  <Stat label="Ürün" value={String(s.product_count ?? "?")} sub={s.product_count === 1 ? "tek ürün" : undefined} />
                  <Stat
                    label="Marj"
                    value={s.products?.margin_ratio != null ? `${Number(s.products.margin_ratio).toLocaleString("tr-TR")}×` : "—"}
                    sub={s.products?.supplier_min_usd != null ? `toptan ${formatPrice(s.products.supplier_min_usd, "USD")}` : undefined}
                    good={Number(s.products?.margin_ratio) >= 3}
                  />
                </div>

                <dl className="facts">
                  {s.niche && s.niche !== "other" && (
                    <>
                      <dt>Niş</dt>
                      <dd>
                        <Link href={`/yeni?niche=${s.niche}`} className="hover:underline">
                          {nicheLabel(s.niche)}
                        </Link>
                      </dd>
                    </>
                  )}
                  {s.country && (
                    <>
                      <dt>Ülke</dt>
                      <dd>{countryLabel(s.country)}</dd>
                    </>
                  )}
                  {s.ships_to_tr !== null && (
                    <>
                      <dt>Türkiye</dt>
                      <dd className={s.ships_to_tr ? "text-emerald-600 dark:text-emerald-400" : ""}>{s.ships_to_tr ? "Gönderim var" : "Gönderim yok"}</dd>
                    </>
                  )}
                  {(s.dropship_count ?? 0) > 0 && (
                    <>
                      <dt>Dropship</dt>
                      <dd title="Ürün açıklamasında uzun teslimat aralığı (ör. 7-15 iş günü) ya da dünya geneli gönderim">
                        {s.dropship_count}/{s.product_count} üründe işaret
                      </dd>
                    </>
                  )}
                  {(s.ali_image_count ?? 0) > 0 && (
                    <>
                      <dt>AliExpress</dt>
                      <dd title="Ürün görselinin dosya adı AliExpress görsel kimliği: fotoğraf AliExpress'ten alınmış">
                        {s.ali_image_count}/{s.product_count} üründe görsel
                      </dd>
                    </>
                  )}
                  {s.stock_drops > 0 && (
                    <>
                      <dt>Hareket</dt>
                      <dd className="text-rose-600 dark:text-rose-400" title="İki kontrol arasında stokta olan varyant sayısı azaldı (satış işareti)">
                        {s.moving_products} üründe {s.stock_drops} kez
                      </dd>
                    </>
                  )}
                  {ad && (
                    <>
                      <dt>Reklam</dt>
                      <dd className={ad.active_ads > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {ad.total_ads === 0 ? (
                          "bulunamadı"
                        ) : (
                          <a href={adLibraryPageUrl(ad.page_id, s.domain)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {ad.active_ads} yayında
                            {ad.longest_active_days !== null ? ` · ${ad.longest_active_days} gün` : ""}
                            {ad.new_ads_14d ? ` · +${ad.new_ads_14d} yeni` : ""}
                            {ad.eu_reach !== null ? ` · ${compact(ad.eu_reach)}` : ""}
                          </a>
                        )}
                      </dd>
                    </>
                  )}
                  {s.copy_count > 0 && (
                    <>
                      <dt>Rakip</dt>
                      <dd title="Aynı ürünü (aynı fotoğraf ya da aynı AliExpress görseli) satan diğer mağazalar">
                        <Link href={`/yeni?group=${encodeURIComponent(s.copy_group ?? "")}&age=150`} className="text-violet-600 hover:underline dark:text-violet-400">
                          {s.copy_count} mağaza daha
                        </Link>
                        {s.copy_same_seller && <span className="text-amber-600 dark:text-amber-400"> · aynı satıcı ağı?</span>}
                      </dd>
                    </>
                  )}
                  <dt>Kontrol</dt>
                  <dd>{s.checks} kez</dd>
                </dl>

                <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
                  <Link href={`/m/${s.domain}`} className="btn btn-sm">
                    Mağaza detayı
                  </Link>
                  {s.product_id && (
                    <Link href={`/p/${s.product_id}`} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-strong transition-all hover:gap-1.5">
                      Toptancı ve kâr
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <path d="M5 12h14m-5-5 5 5-5 5" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}