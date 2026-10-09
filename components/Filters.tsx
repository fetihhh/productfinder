import type { Filters as F } from "@/lib/products";
import { countryLabel } from "@/lib/format";

const field =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// JavaScript gerektirmeyen GET formu: filtreler URL'de tutulur, paylaşılabilir ve yer imine eklenebilir.
export function Filters({ f, categories, platforms, countries }: { f: F; categories: string[]; platforms: string[]; countries: string[] }) {
  return (
    <form method="get" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      <input
        type="search"
        name="q"
        defaultValue={f.q}
        placeholder="Ürün veya marka ara"
        className={`${field} col-span-2 sm:col-span-4 lg:col-span-2`}
      />
      <select name="status" defaultValue={f.status} className={field} aria-label="Doğrulama durumu">
        <option value="verified">Doğrulanmış</option>
        <option value="unverified">Doğrulanmamış</option>
        <option value="rejected_marketplace">Pazaryerinde</option>
        <option value="rejected_big_brand">Büyük marka</option>
        <option value="all">Tüm durumlar</option>
      </select>
      <select name="country" defaultValue={f.country} className={field} aria-label="Mağaza ülkesi">
        <option value="">Tüm ülkeler</option>
        {countries.map((c) => (
          <option key={c} value={c}>{countryLabel(c)}</option>
        ))}
      </select>
      <select name="category" defaultValue={f.category} className={field} aria-label="Kategori">
        <option value="">Tüm kategoriler</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select name="platform" defaultValue={f.platform} className={field} aria-label="Platform">
        <option value="">Tüm platformlar</option>
        {platforms.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <select name="days" defaultValue={String(f.days)} className={field} aria-label="Tarih">
        <option value="0">Her zaman</option>
        <option value="7">Son 7 gün</option>
        <option value="30">Son 30 gün</option>
        <option value="90">Son 90 gün</option>
      </select>
      <select name="track" defaultValue={f.track} className={field} aria-label="Takip durumu">
        <option value="all">Tüm takip</option>
        <option value="favorite">Favori</option>
        <option value="review">İncelenecek</option>
        <option value="rejected">Elendi</option>
      </select>
      <input type="number" name="reviews" min={0} defaultValue={f.minReviews || ""} placeholder="Min yorum" className={field} aria-label="Minimum yorum sayısı" />
      <input type="number" name="min" min={0} max={100} defaultValue={f.minScore || ""} placeholder="Min winner" className={field} aria-label="Minimum winner skoru" />
      <div className="flex gap-2">
        <input type="number" name="pmin" min={0} defaultValue={f.priceMin || ""} placeholder="Fiyat ≥" className={`${field} w-full`} aria-label="Minimum fiyat" />
        <input type="number" name="pmax" min={0} defaultValue={f.priceMax || ""} placeholder="≤" className={`${field} w-full`} aria-label="Maksimum fiyat" />
      </div>
      <select name="sort" defaultValue={f.sort} className={field} aria-label="Sıralama">
        <option value="winner">Sırala: winner skoru</option>
        <option value="rising">Yükselenler</option>
        <option value="margin">Sırala: kâr marjı</option>
        <option value="score">Sırala: trend skoru</option>
        <option value="reviews">Sırala: yorum sayısı</option>
        <option value="new">Sırala: en yeni</option>
        <option value="price">Sırala: fiyat (artan)</option>
      </select>
      <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="tr" value="1" defaultChecked={f.shipsTr} className="h-4 w-4" />
        Yalnızca Türkiye&apos;ye gönderenler
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="sup" value="1" defaultChecked={f.supplier} className="h-4 w-4" />
        Yalnızca toptancısı bulunanlar
      </label>
      <div className="col-span-2 flex gap-2 sm:col-span-4 lg:col-span-2 lg:justify-end">
        <a href="/" className="px-2 py-1.5 text-sm text-zinc-500 hover:underline">Sıfırla</a>
        <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Filtrele</button>
      </div>
    </form>
  );
}
