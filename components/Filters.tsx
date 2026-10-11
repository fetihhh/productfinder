import type { Filters as F } from "@/lib/products";
import { Toggle } from "@/components/ui";
import { countryLabel } from "@/lib/format";

function Select({ name, value, label, children }: { name: string; value: string; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value} className="field">
        {children}
      </select>
    </label>
  );
}

// JavaScript gerektirmeyen GET formu: filtreler URL'de tutulur, paylaşılabilir ve yer imine eklenebilir.
export function Filters({ f, categories, platforms, countries }: { f: F; categories: string[]; platforms: string[]; countries: string[] }) {
  const advanced = [f.age, f.country, f.category, f.platform, f.days, f.track !== "all", f.minReviews, f.minScore, f.priceMin, f.priceMax, f.shipsTr, f.supplier, f.ads].filter(Boolean).length;
  return (
    <form method="get" className="card mt-6 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" name="q" defaultValue={f.q} placeholder="Ürün veya marka ara…" className="field pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select name="status" defaultValue={f.status} className="field sm:w-44" aria-label="Doğrulama durumu">
            <option value="verified">Doğrulanmış</option>
            <option value="unverified">Doğrulanmamış</option>
            <option value="rejected_marketplace">Pazaryerinde</option>
            <option value="rejected_big_brand">Büyük marka</option>
            <option value="all">Tüm durumlar</option>
          </select>
          <select name="sort" defaultValue={f.sort} className="field sm:w-48" aria-label="Sıralama">
            <option value="winner">Winner skoru</option>
            <option value="rising">Yükselenler</option>
            <option value="margin">Kâr marjı</option>
            <option value="score">Trend skoru</option>
            <option value="reviews">Yorum sayısı</option>
            <option value="new">En yeni</option>
            <option value="price">Fiyat (artan)</option>
          </select>
          <select name="trk" defaultValue={f.turkey} className="field sm:w-52" aria-label="Türkiye">
            <option value="">🇹🇷 Türkiye: hepsi</option>
            <option value="sold">Türkiye&apos;de satılanlar</option>
            <option value="open">Türkiye&apos;de rakibi yok</option>
          </select>
        </div>
        <button className="btn-primary sm:px-5">Filtrele</button>
      </div>

      <details className="group mt-3" open={advanced > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted select-none hover:text-foreground">
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
          Daha fazla filtre
          {advanced > 0 && <span className="badge bg-amber-500 text-white">{advanced}</span>}
          {advanced > 0 && (
            <a href="/" className="ml-auto text-xs font-normal underline-offset-4 hover:underline">
              Filtreleri sıfırla
            </a>
          )}
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-3 lg:grid-cols-6">
          <Select name="age" value={String(f.age)} label="Mağaza yaşı">
            <option value="0">Hepsi</option>
            <option value="30">≤ 30 gün</option>
            <option value="90">≤ 90 gün</option>
            <option value="150">≤ 5 ay</option>
          </Select>
          <Select name="country" value={f.country} label="Mağaza ülkesi">
            <option value="">Tüm ülkeler</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {countryLabel(c)}
              </option>
            ))}
          </Select>
          <Select name="category" value={f.category} label="Kategori">
            <option value="">Tümü</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select name="platform" value={f.platform} label="Platform">
            <option value="">Tümü</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select name="days" value={String(f.days)} label="Eklenme">
            <option value="0">Her zaman</option>
            <option value="1">Son 24 saat</option>
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 90 gün</option>
          </Select>
          <Select name="track" value={f.track} label="Takip">
            <option value="all">Tümü (elenenler hariç)</option>
            <option value="favorite">Favori</option>
            <option value="review">İncelenecek</option>
            <option value="rejected">Elendi</option>
          </Select>
          <label className="block">
            <span className="label">Min yorum</span>
            <input type="number" name="reviews" min={0} defaultValue={f.minReviews || ""} placeholder="0" className="field" />
          </label>
          <label className="block">
            <span className="label">Min winner</span>
            <input type="number" name="min" min={0} max={100} defaultValue={f.minScore || ""} placeholder="0" className="field" />
          </label>
          <div className="col-span-2">
            <span className="label">Fiyat aralığı</span>
            <div className="flex items-center gap-2">
              <input type="number" name="pmin" min={0} defaultValue={f.priceMin || ""} placeholder="En az" className="field" aria-label="Minimum fiyat" />
              <span className="text-muted">–</span>
              <input type="number" name="pmax" min={0} defaultValue={f.priceMax || ""} placeholder="En çok" className="field" aria-label="Maksimum fiyat" />
            </div>
          </div>
          <div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-3 lg:col-span-2">
            <Toggle name="tr" checked={f.shipsTr} label="Türkiye'ye gönderir" />
            <Toggle name="sup" checked={f.supplier} label="Toptancısı var" />
            <Toggle name="ads" checked={f.ads} label="Reklam veriyor" title="Meta Reklam Kütüphanesi'nde yayında reklamı olan markalar" />
          </div>
        </div>
      </details>
    </form>
  );
}
