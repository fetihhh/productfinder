import Link from "next/link";
import { STATUS } from "@/components/ProductCard";
import { ageLabel, countryLabel, formatPrice } from "@/lib/format";
import { listNewStores, parseStoreFilters, storeFunnel } from "@/lib/newStores";

const field = "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function NewStoresPage({ searchParams }: PageProps<"/yeni">) {
  const f = parseStoreFilters(await searchParams);
  const [{ rows, error }, funnel] = await Promise.all([listNewStores(f), storeFunnel()]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">← Ürünler</Link>
      <h1 className="mt-3 text-xl font-semibold">Yeni mağazalar</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Son 5 ayda açılmış küçük Shopify mağazaları. Her gün yeni kayıtlı alan adları taranır, Shopify&apos;a bağlananlar
        bulunur ve haftalık kontrol edilir: açıldı mı, kaç ürün var, yeni ürün eklendi mi, stok tükeniyor mu.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        Bulunan {funnel.total.toLocaleString("tr-TR")} mağaza · açık {funnel.live.toLocaleString("tr-TR")} · henüz kapalı/şifreli{" "}
        {funnel.closed.toLocaleString("tr-TR")} · ilk kontrol bekleyen {funnel.pending.toLocaleString("tr-TR")} · kapanmış{" "}
        {funnel.dead.toLocaleString("tr-TR")} · aday ürünü eklenen {funnel.promoted.toLocaleString("tr-TR")}
      </p>

      <form className="mt-4 flex flex-wrap items-center gap-2">
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
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="tr" value="1" defaultChecked={f.tr} className="h-4 w-4" /> Türkiye&apos;ye gönderenler
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
                  <span title="Mağaza puanı: odak, yenilik, indirim, fiyat, hareket" className="ml-auto rounded bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white">
                    Puan {Number(s.store_score).toFixed(0)}
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
                  <dt className="text-zinc-500">Kontrol</dt>
                  <dd>{s.checks} kez</dd>
                </dl>
                {s.product_id && (
                  <Link href={`/p/${s.product_id}`} className="mt-auto pt-1 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">
                    Doğrulama, toptancı ve grafikler →
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
