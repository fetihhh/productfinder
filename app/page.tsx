import { Filters } from "@/components/Filters";
import { ProductCard } from "@/components/ProductCard";
import { facets, listProducts, parseFilters } from "@/lib/products";
import { logout } from "./login/actions";

export default async function Home({ searchParams }: PageProps<"/">) {
  const f = parseFilters(await searchParams);
  const [{ rows, error }, { categories, platforms }] = await Promise.all([listProducts(f), facets()]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Product Finder</h1>
        <form action={logout}>
          <button className="text-sm text-zinc-500 hover:underline">Çıkış</button>
        </form>
      </header>

      <Filters f={f} categories={categories} platforms={platforms} />

      {error && <p className="mt-6 text-red-600">Veritabanı hatası: {error}</p>}
      <p className="mt-4 text-sm text-zinc-500">
        {rows.length} ürün{rows.length === 200 ? " (ilk 200)" : ""}
        {f.status === "verified" && " · yalnızca pazaryerinde bulunmayan, markanın kendi sitesinde satılan fiziksel ürünler"}
      </p>
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
