import Link from "next/link";
import { STATUS } from "@/components/ProductCard";
import { adLibraryPageUrl } from "@/dtc/adLibrary";
import { adSignalsFor } from "@/lib/ads";
import { ageLabel, compact, countryLabel, formatPrice } from "@/lib/format";
import { listNewStores, metaAdsState, parseStoreFilters, storeFunnel, type MetaAdsState } from "@/lib/newStores";

const field = "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

/** Reklam aramasının durumu: anahtar eksik, geçersiz ya da süresi yakında doluyorsa uyarır. */
function MetaNotice({ meta }: { meta: MetaAdsState | null }) {
  const box = "mt-3 rounded border px-3 py-2 text-sm";
  if (!meta || meta.status === "no_token") {
    return (
      <p className={`${box} border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400`}>
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
    <p className={`${box} ${daysLeft !== null && daysLeft <= 10 ? "border-amber-400 text-amber-800 dark:text-amber-300" : "border-zinc-200 text-zinc-500 dark:border-zinc-800"}`}>
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

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">← Ürünler</Link>
      <h1 className="mt-3 text-xl font-semibold">Yeni mağazalar</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Son 5 ayda açılmış küçük Shopify mağazaları. Her gün yeni kayıtlı alan adları taranır, Shopify&apos;a bağlananlar
        bulunur ve düzenli kontrol edilir (puanı yüksek olanlar her gün): açıldı mı, kaç ürün var, yeni ürün eklendi mi, stok tükeniyor mu,
        aynı ürünü başka mağazalar da satıyor mu.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        Bulunan {funnel.total.toLocaleString("tr-TR")} mağaza · açık {funnel.live.toLocaleString("tr-TR")} · henüz kapalı/şifreli{" "}
        {funnel.closed.toLocaleString("tr-TR")} · ilk kontrol bekleyen {funnel.pending.toLocaleString("tr-TR")} · kapanmış{" "}
        {funnel.dead.toLocaleString("tr-TR")} · aday ürünü eklenen {funnel.promoted.toLocaleString("tr-TR")}
      </p>
      <MetaNotice meta={meta} />
      {f.group && (
        <p className="mt-3 rounded border border-violet-300 px-3 py-2 text-sm text-violet-800 dark:border-violet-800 dark:text-violet-300">
          Aynı ürünü satan mağazalar ({f.group} kümesi).{" "}
          <Link href="/yeni" className="underline">Tüm mağazalar</Link>
        </p>
      )}

      <form className="mt-4 flex flex-wrap items-center gap-2">
        {f.group && <input type="hidden" name="group" value={f.group} />}
        <input name="q" defaultValue={f.q} placeholder="Mağaza veya ürün ara" className={`${field} w-56`} />
        <select name="age" defaultValue={String(f.maxAge)} className={field} aria-label="Mağaza yaşı">
          <option value="30">İlk ürünü ≤ 30 gün</option>
          <option value="60">≤ 60 gün</option>
          <option value="90">≤ 90 gün</option>
          <option value="150">≤ 5 ay</option>
        </select>
        <input type="number" name="min" min={0} max={100} defaultValue={f.minScore || ""} placeholder="Min puan" className={`${field} w-28`} />
        <select name="sort" defaultValue={f.sort} className={field} aria-label="Sıralama">
          <option value="score">Sırala: mağaza puanı</option>
          <option value="new">En yeni</option>
          <option value="products">En az ürün (tek ürün mağazaları)</option>
          <option value="ads">En çok reklam</option>
          <option value="copies">Aynı ürünü satan en çok mağaza</option>
          <option value="moving">En çok stok hareketi</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="tr" value="1" defaultChecked={f.tr} className="h-4 w-4" /> Türkiye&apos;ye gönderenler
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="ads" value="1" defaultChecked={f.ads} className="h-4 w-4" /> Reklam verenler
        </label>
        <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Filtrele</button>
      </form>

      {error && <p className="mt-4 text-red-600">Veritabanı hatası: {error}</p>}
      {!error && rows.length === 0 && (
        <p className="mt-6 text-zinc-500">
          Bu filtrelerle açık yeni mağaza yok. Keşif her gün çalışır; yeni kayıtlı alan adlarındaki mağazalar genelde birkaç gün ile birkaç hafta
          içinde açılır.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((s) => {
          const href = s.hero_handle ? `https://${s.domain}/products/${s.hero_handle}` : `https://${s.domain}/`;
          const discount = s.product_count ? Math.round(((s.discounted_count ?? 0) / s.product_count) * 100) : 0;
          const ad = ads.get(s.domain);
          return (
            <article key={s.domain} className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <a href={href} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                {s.hero_image && <img src={s.hero_image} alt={s.hero_title ?? ""} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
              </a>
              <div className="flex flex-1 flex-col gap-1.5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    {ageLabel(s.first_product_at) ?? "?"} önce açıldı
                  </span>
                  {s.products && (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS[s.products.dtc_status as keyof typeof STATUS]?.cls ?? ""}`}>
                      {STATUS[s.products.dtc_status as keyof typeof STATUS]?.label ?? s.products.dtc_status}
                    </span>
                  )}
                  {(s.ads_active ?? 0) > 0 && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Reklam veriyor</span>
                  )}
                  <span
                    title={`Mağaza puanı ${Number(s.store_score).toFixed(0)} (odak, yenilik, dropship, indirim, fiyat, hareket) + reklam ${Number(s.ad_points).toFixed(0)}`}
                    className="ml-auto rounded bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white"
                  >
                    Puan {Number(s.total_score).toFixed(0)}
                  </span>
                </div>
                <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:underline">
                  {s.hero_title ?? s.shop_name ?? s.domain}
                </a>
                <a href={`https://${s.domain}/`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                  {s.shop_name ? `${s.shop_name} · ` : ""}
                  {s.domain} ↗
                </a>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {s.hero_price !== null && (
                    <>
                      <dt className="text-zinc-500">Fiyat</dt>
                      <dd>{formatPrice(s.hero_price, s.currency)}</dd>
                    </>
                  )}
                  <dt className="text-zinc-500">Ürün</dt>
                  <dd>
                    {s.product_count ?? "?"}
                    {s.product_count === 1 ? " (tek ürün mağazası)" : ""}
                    {discount ? ` · %${discount} indirimli` : ""}
                  </dd>
                  {s.country && (
                    <>
                      <dt className="text-zinc-500">Mağaza</dt>
                      <dd>{countryLabel(s.country)}</dd>
                    </>
                  )}
                  {s.ships_to_tr !== null && (
                    <>
                      <dt className="text-zinc-500">Türkiye</dt>
                      <dd className={s.ships_to_tr ? "font-medium text-emerald-700 dark:text-emerald-400" : ""}>{s.ships_to_tr ? "Gönderim var" : "Gönderim yok"}</dd>
                    </>
                  )}
                  {s.products?.supplier_min_usd != null && (
                    <>
                      <dt className="text-zinc-500">Toptan</dt>
                      <dd>
                        {formatPrice(s.products.supplier_min_usd, "USD")}&apos;den
                        {s.products.margin_ratio != null ? ` · marj ≈ ${Number(s.products.margin_ratio).toLocaleString("tr-TR")}×` : ""}
                      </dd>
                    </>
                  )}
                  {(s.dropship_count ?? 0) > 0 && (
                    <>
                      <dt className="text-zinc-500">Dropship</dt>
                      <dd title="Ürün açıklamasında uzun teslimat aralığı (ör. 7-15 iş günü) ya da dünya geneli gönderim">
                        {s.dropship_count}/{s.product_count} üründe işaret
                      </dd>
                    </>
                  )}
                  {ad && (
                    <>
                      <dt className="text-zinc-500">Reklam</dt>
                      <dd className={ad.active_ads > 0 ? "font-medium text-emerald-700 dark:text-emerald-400" : ""}>
                        {ad.total_ads === 0 ? (
                          "bulunamadı"
                        ) : (
                          <a href={adLibraryPageUrl(ad.page_id, s.domain)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {ad.active_ads} yayında
                            {ad.longest_active_days !== null ? ` · en eskisi ${ad.longest_active_days} gün` : ""}
                            {ad.new_ads_14d ? ` · +${ad.new_ads_14d} yeni` : ""}
                            {ad.eu_reach !== null ? ` · ${compact(ad.eu_reach)} erişim` : ""} ↗
                          </a>
                        )}
                      </dd>
                    </>
                  )}
                  {s.copy_count > 0 && (
                    <>
                      <dt className="text-zinc-500">Rakip</dt>
                      <dd title="Aynı ürünü (aynı fotoğraf ya da aynı AliExpress görseli) satan diğer mağazalar">
                        <Link href={`/yeni?group=${encodeURIComponent(s.copy_group ?? "")}&age=150`} className="font-medium text-violet-700 hover:underline dark:text-violet-400">
                          {s.copy_count} mağaza daha satıyor
                        </Link>
                        {s.copy_same_seller && <span className="text-amber-700 dark:text-amber-400"> · aynı satıcının ağı olabilir</span>}
                      </dd>
                    </>
                  )}
                  {(s.ali_image_count ?? 0) > 0 && (
                    <>
                      <dt className="text-zinc-500">AliExpress</dt>
                      <dd title="Ürün görselinin dosya adı AliExpress görsel kimliği: fotoğraf AliExpress'ten alınmış">
                        {s.ali_image_count}/{s.product_count} üründe AliExpress görseli
                      </dd>
                    </>
                  )}
                  {s.stock_drops > 0 && (
                    <>
                      <dt className="text-zinc-500">Hareket</dt>
                      <dd className="font-medium text-rose-700 dark:text-rose-400" title="İki kontrol arasında stokta olan varyant sayısı azaldı (satış işareti)">
                        {s.moving_products} üründe {s.stock_drops} kez stok azaldı
                      </dd>
                    </>
                  )}
                  <dt className="text-zinc-500">Kontrol</dt>
                  <dd>{s.checks} kez</dd>
                </dl>
                <div className="mt-auto flex flex-wrap gap-x-3 pt-1 text-sm font-medium">
                  <Link href={`/m/${s.domain}`} className="text-sky-700 hover:underline dark:text-sky-400">
                    Mağaza detayı →
                  </Link>
                  {s.product_id && (
                    <Link href={`/p/${s.product_id}`} className="text-amber-700 hover:underline dark:text-amber-400">
                      Toptancı ve kâr →
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
