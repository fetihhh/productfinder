import Link from "next/link";
import { connection } from "next/server";
import { formatPrice, ageLabel, compact } from "@/lib/format";
import { salesFromReviews, salesWatch, storeItemMoves, type SalesFilter, type SalesRow, type StoreItemMove } from "@/lib/sales";

export const metadata = { title: "Satış takibi" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

function PriceCell({ price, prev, compareAt, currency, changedAt }: { price: number | null; prev: number | null; compareAt: number | null; currency: string | null; changedAt?: string | null }) {
  if (price === null) return <span className="text-muted">—</span>;
  const change = prev !== null && prev > 0 && Math.abs(prev - price) >= 0.01 ? pct(price, prev) : null;
  return (
    <div className="leading-tight">
      <p className="font-medium tabular-nums">{formatPrice(price, currency)}</p>
      {change !== null && (
        <p className={`text-xs tabular-nums ${change < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {change < 0 ? "▼" : "▲"} %{Math.abs(change)} (önce {formatPrice(prev, currency)}){changedAt ? ` · ${ageLabel(changedAt)}` : ""}
        </p>
      )}
      {compareAt !== null && compareAt > price && <p className="text-xs text-muted">indirim %{Math.abs(pct(price, compareAt))}</p>}
    </div>
  );
}

function StockCell({ avail, total, inventory, tracked }: { avail: number | null; total: number | null; inventory: number | null; tracked: boolean | null }) {
  if (total === null || avail === null) return <span className="text-muted">—</span>;
  const ratio = total > 0 ? avail / total : 1;
  return (
    <div className="leading-tight">
      <p className={`tabular-nums ${ratio <= 0.5 ? "font-semibold text-amber-700 dark:text-amber-300" : ""}`}>
        {avail}/{total} varyant
      </p>
      {inventory !== null ? <p className="text-xs tabular-nums text-muted">{inventory} adet kaldı</p> : tracked === false && <p className="text-xs text-muted">stok takibi yok</p>}
    </div>
  );
}

function ProductTable({ rows, days }: { rows: SalesRow[]; days: number }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 font-medium">Ürün</th>
            <th className="px-3 py-2.5 text-right font-medium">Winner</th>
            <th className="px-3 py-2.5 font-medium">Fiyat</th>
            <th className="px-3 py-2.5 font-medium">Stok</th>
            <th className="px-3 py-2.5 font-medium" title={`Son ${days} gün: iki ölçüm arasında tükenen varyant, yeniden gelen varyant, azalan adet`}>
              Hareket ({days} g)
            </th>
            <th className="px-3 py-2.5 font-medium" title="Yorum artışı × 10–50 (alıcıların %2–10'u yorum bırakır)">Tahmini satış</th>
            <th className="px-3 py-2.5 text-right font-medium" title="Eşleşen AliExpress ilanının haftalık satışı">Toptancı/hafta</th>
            <th className="px-3 py-2.5 font-medium">Ölçüm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const est = salesFromReviews(r.reviews_start, r.reviews_end);
            const moves = [
              r.units_sold ? `${r.units_sold} adet satıldı` : "",
              r.sold_out ? `${r.sold_out} varyant tükendi` : "",
              r.restocked ? `${r.restocked} yeniden stokta` : "",
            ].filter(Boolean);
            return (
              <tr key={r.id} className="border-b border-line/60 align-top last:border-0">
                <td className="max-w-[300px] px-3 py-2.5">
                  <div className="flex gap-2.5">
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded-lg bg-surface-muted" />
                    )}
                    <div className="min-w-0">
                      <Link href={`/p/${r.id}`} className="line-clamp-2 font-medium hover:underline">
                        {r.name}
                      </Link>
                      <p className="truncate text-xs text-muted">{r.brand_domain}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.winner_score === null ? "—" : Math.round(Number(r.winner_score))}</td>
                <td className="px-3 py-2.5">
                  <PriceCell price={r.price === null ? null : Number(r.price)} prev={r.price_prev === null ? null : Number(r.price_prev)} compareAt={r.compare_at === null ? null : Number(r.compare_at)} currency={r.currency} changedAt={r.price_changed_at} />
                </td>
                <td className="px-3 py-2.5">
                  <StockCell avail={r.variants_available} total={r.variants_total} inventory={r.inventory} tracked={r.stock_tracked} />
                </td>
                <td className="px-3 py-2.5 text-xs">{moves.length ? moves.map((m) => <p key={m}>{m}</p>) : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2.5 text-xs">
                  {est ? (
                    <span>
                      {compact(est.low)}–{compact(est.high)} adet
                      <span className="block text-muted">
                        +{(r.reviews_end ?? 0) - (r.reviews_start ?? 0)} yorum
                      </span>
                    </span>
                  ) : r.reviews_end !== null ? (
                    <span className="text-muted">{r.reviews_end} yorum, artış yok</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums">{r.supplier_sold_per_week ? compact(Number(r.supplier_sold_per_week)) : "—"}</td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {ageLabel(r.last_measured_at) ?? "—"}
                  <span className="block">{r.days_measured} gün</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StoreMoves({ rows }: { rows: StoreItemMove[] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 font-medium">Ürün</th>
            <th className="px-3 py-2.5 font-medium">Fiyat</th>
            <th className="px-3 py-2.5 font-medium">Stok</th>
            <th className="px-3 py-2.5 text-right font-medium" title="İki kontrol arasında stokta olan varyant sayısının azaldığı kez">Stok azaldı</th>
            <th className="px-3 py-2.5 text-right font-medium" title="Aynı ürünü satan bağımsız başka mağaza">Rakip</th>
            <th className="px-3 py-2.5 font-medium">Son hareket</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.domain}/${r.handle}`} className="border-b border-line/60 align-top last:border-0">
              <td className="max-w-[320px] px-3 py-2.5">
                <div className="flex gap-2.5">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="h-11 w-11 shrink-0 rounded-lg bg-surface-muted" />
                  )}
                  <div className="min-w-0">
                    <a href={`https://${r.domain}/products/${r.handle}`} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-medium hover:underline">
                      {r.title ?? r.handle}
                    </a>
                    <Link href={`/m/${r.domain}`} className="truncate text-xs text-muted hover:underline">
                      {r.shop_name ?? r.domain}
                    </Link>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <PriceCell price={r.price === null ? null : Number(r.price)} prev={r.prev_price === null ? null : Number(r.prev_price)} compareAt={r.compare_at === null ? null : Number(r.compare_at)} currency={r.currency} />
              </td>
              <td className="px-3 py-2.5">
                <StockCell avail={r.avail} total={r.variants} inventory={null} tracked={null} />
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.so || "—"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.copies || "—"}</td>
              <td className="px-3 py-2.5 text-xs text-muted">{r.last_move ? ageLabel(r.last_move) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SalesPage({ searchParams }: PageProps<"/satis">) {
  await connection();
  const sp = await searchParams;
  const tab = one(sp.tab) === "magaza" ? "magaza" : "urun";
  const filter = (["price_drop", "stock", "low"].includes(one(sp.f)) ? one(sp.f) : "all") as SalesFilter;
  const days = [7, 30, 90].includes(Number(one(sp.days))) ? Number(one(sp.days)) : 30;
  const minScore = [0, 30, 40, 50].includes(Number(one(sp.min))) ? Number(one(sp.min)) : 40;
  const [rows, moves] = await Promise.all([
    tab === "urun" ? salesWatch({ days, minScore, filter, limit: 300 }) : Promise.resolve([]),
    tab === "magaza" ? storeItemMoves({ days, filter: filter === "low" ? "all" : filter, limit: 300 }) : Promise.resolve([]),
  ]);
  const href = (t: string) => `/satis?tab=${t}&days=${days}`;
  const filters: [SalesFilter, string][] =
    tab === "urun"
      ? [["all", "Hepsi"], ["price_drop", "Fiyatı düşenler"], ["stock", "Stok hareketi olanlar"], ["low", "Tükenmek üzere"]]
      : [["all", "Hepsi"], ["price_drop", "Fiyatı düşenler"], ["stock", "Stoğu azalanlar"]];

  return (
    <main className="page">
      <p className="eyebrow">Satış takibi</p>
      <h1 className="h1 mt-1">Ne kadar satıyor?</h1>
      <p className="lead">
        Winner ürünler günde iki kez, diğer doğrulanmış ürünler günde bir, adaylar 3 günde bir ölçülür; izlenen mağazaların ürünleri her mağaza kontrolünde.
        Shopify kalan adedi herkese göstermez: satış, iki ölçüm arasında tükenen varyanttan, tema gösteriyorsa azalan adetten, yorum artışından ve
        toptancıdaki satış hızından okunur. Dropshipping mağazalarının çoğu stok takibi yapmaz (ürün hep &quot;stokta&quot; görünür); bu ürünlerde yorum
        artışı ve toptancı satışı esas alınır.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line bg-surface p-1">
          {[
            ["urun", "Ölçülen ürünler"],
            ["magaza", "Tüm mağaza ürünleri"],
          ].map(([k, l]) => (
            <Link key={k} href={href(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${tab === k ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <select name="f" defaultValue={filter} className="field w-52" aria-label="Filtre">
            {filters.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select name="days" defaultValue={String(days)} className="field w-36" aria-label="Dönem">
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 90 gün</option>
          </select>
          {tab === "urun" && (
            <select name="min" defaultValue={String(minScore)} className="field w-40" aria-label="En düşük winner skoru">
              <option value="40">Winner ≥ 40</option>
              <option value="50">Winner ≥ 50</option>
              <option value="30">Winner ≥ 30</option>
              <option value="0">Tüm ürünler</option>
            </select>
          )}
          <button className="btn btn-sm btn-primary">Uygula</button>
        </form>
      </div>

      {tab === "urun" ? (
        rows.length ? (
          <ProductTable rows={rows} days={days} />
        ) : (
          <p className="card mt-5 p-6 text-sm text-muted">Bu filtrede ölçülmüş ürün yok. Ölçümler her çalıştırmada birikir.</p>
        )
      ) : moves.length ? (
        <StoreMoves rows={moves} />
      ) : (
        <p className="card mt-5 p-6 text-sm text-muted">Bu dönemde fiyatı düşen ya da stoğu azalan mağaza ürünü yok.</p>
      )}
    </main>
  );
}
