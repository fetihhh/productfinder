import Link from "next/link";
import { Filters } from "@/components/Filters";
import { ProductCard } from "@/components/ProductCard";
import { facets, listProducts, parseFilters } from "@/lib/products";
import { logout } from "./login/actions";

export default async function Home({ searchParams }: PageProps<"/">) {
  const f = parseFilters(await searchParams);
  const [{ rows, error }, { categories, platforms, countries }] = await Promise.all([listProducts(f), facets()]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Product Finder</h1>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/?sort=rising" className="text-rose-600 hover:underline dark:text-rose-400">↗ Yükselenler</Link>
          <Link href="/siteler" className="text-blue-600 hover:underline dark:text-blue-400">Siteler ve trafik</Link>
          <form action={logout}>
            <button className="text-zinc-500 hover:underline">Çıkış</button>
          </form>
        </nav>
      </header>

      <Filters f={f} categories={categories} platforms={platforms} countries={countries} />

      {error && <p className="mt-6 text-red-600">Veritabanı hatası: {error}</p>}
      <p className="mt-4 text-sm text-zinc-500">
        {rows.length} ürün{rows.length === 200 ? " (ilk 200)" : ""}
        {f.status === "verified" &&
          " · yalnızca markanın kendi sitesinde satılan fiziksel ürünler (ürün ve marka hiçbir pazaryerinde/büyük perakendecide bulunamadı)"}
      </p>
      {f.sort === "rising" && (
        <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">
          Yükselenler: büyüklüğe değil hıza göre sıralanır. Yorum artış hızı (45), trafik sırası iyileşmesi (35) ve bu haftaki blog gündemi (20).
          Yorum ve trafik hızı en az 7 günlük ölçümden sonra hesaplanır; o zamana kadar yalnızca gündem puanı görünür.
        </p>
      )}
      {!error && rows.length === 0 && (
        <p className="mt-6 text-zinc-500">Bu filtrelerle ürün yok. Filtreleri genişletin ya da `npm run ingest` çalıştırın.</p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </main>
  );
}
