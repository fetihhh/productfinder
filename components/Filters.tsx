import type { Filters as F } from "@/lib/products";

const field =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// JavaScript gerektirmeyen GET formu: filtreler URL'de tutulur, paylaşılabilir ve yer imine eklenebilir.
export function Filters({ f, categories, platforms }: { f: F; categories: string[]; platforms: string[] }) {
  return (
    <form method="get" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
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
        <option value="all">Tüm durumlar</option>
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
      <div className="flex gap-2">
        <input
          type="number"
          name="min"
          min={0}
          max={100}
          defaultValue={f.minScore || ""}
          placeholder="Min skor"
          className={`${field} w-full`}
          aria-label="Minimum trend skoru"
        />
        <select name="sort" defaultValue={f.sort} className={field} aria-label="Sıralama">
          <option value="score">Skor</option>
          <option value="new">Yeni</option>
        </select>
      </div>
      <div className="col-span-2 flex gap-2 sm:col-span-4 lg:col-span-8">
        <button className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          Filtrele
        </button>
        <a href="/" className="px-2 py-1.5 text-sm text-zinc-500 hover:underline">
          Sıfırla
        </a>
      </div>
    </form>
  );
}
