import Link from "next/link";
import { Filters } from "@/components/Filters";
import { ProductCard } from "@/components/ProductCard";
import { facets, listProducts, newToday, parseFilters } from "@/lib/products";

const QUICK = [
  { href: "/", label: "Doğrulanmış" },
  { href: "/?days=1&status=all", label: "Bugün yeni" },
  { href: "/?sup=1&sort=margin", label: "Toptancısı olanlar" },
  { href: "/?track=favorite&status=all", label: "★ Favoriler" },
  { href: "/?age=150&status=all", label: "Yeni mağazaların ürünleri" },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const f = parseFilters(await searchParams);
  const [{ rows, error }, { categories, platforms, countries }, today] = await Promise.all([listProducts(f), facets(), newToday()]);

  return (
    <main className="page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Ürünler</p>
          <h1 className="h1 mt-1">{f.sort === "rising" ? "Yükselen ürünler" : "Winner adayları"}</h1>
          <p className="lead">
            {f.sort === "rising"
              ? "Büyüklüğe değil hıza göre: yorum artış hızı (45), trafik sırası iyileşmesi (35) ve bu haftaki blog gündemi (20). Hızlar en az 7 günlük ölçümden sonra hesaplanır."
              : "Markanın kendi sitesinde satılan fiziksel ürünler; satış sinyali, toptancı, marj ve rakip mağazalarla birlikte."}
          </p>
        </div>
        <Link href="/?days=1&status=all" className="btn">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Bugün {today} yeni ürün
        </Link>
      </div>

      <div className="no-scrollbar mt-5 -mb-1 flex gap-2 overflow-x-auto pb-1">
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className="chip shrink-0 py-1 transition hover:border-amber-500/60 hover:text-foreground">
            {q.label}
          </Link>
        ))}
      </div>

      <Filters f={f} categories={categories} platforms={platforms} countries={countries} />

      {error && <p className="mt-6 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">Veritabanı hatası: {error}</p>}
      <p className="mt-5 text-sm text-muted">
        <span className="font-semibold text-foreground">{rows.length}</span> ürün{rows.length === 200 ? " (ilk 200)" : ""}
        {f.status === "verified" && " · ürün ve marka hiçbir pazaryerinde/büyük perakendecide bulunamadı"}
      </p>
      {!error && rows.length === 0 && (
        <div className="card mt-4 grid place-items-center px-6 py-16 text-center">
          <p className="text-base font-medium">Bu filtrelerle ürün yok</p>
          <p className="mt-1 text-sm text-muted">Filtreleri genişletin; günlük iş her sabah yeni adaylar ekler.</p>
          <Link href="/" className="btn mt-4">
            Filtreleri sıfırla
          </Link>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </main>
  );
}
