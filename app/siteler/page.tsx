import Link from "next/link";
import { Sparkline } from "@/components/Charts";
import { compact, countryLabel, rangeLabel } from "@/lib/format";
import { listSites } from "@/lib/products";
import { rankChange, visitsFromRank } from "@/lib/winner";

export default async function SitesPage({ searchParams }: PageProps<"/siteler">) {
  const all = (await searchParams).all === "1";
  const sites = await listSites(!all);
  const maxVisits = Math.max(1, ...sites.map((s) => (s.tranco_rank ? visitsFromRank(s.tranco_rank).mid : 0)));
  const ranked = sites.filter((s) => s.tranco_rank);
  // Ortalama birkaç dev siteye kayar (microsoft.com tek başına milyarlar); tipik değer için medyan.
  const median = ranked.length ? visitsFromRank(ranked[Math.floor((ranked.length - 1) / 2)].tranco_rank!).mid : null;

  return (
    <main className="page">
      <p className="eyebrow">Trafik</p>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="h1 mt-1">Siteler ve trafik</h1>
        <Link href={all ? "/siteler" : "/siteler?all=1"} className="btn btn-sm">
          {all ? "Yalnızca doğrulanmış ürünü olanlar" : "Tüm siteleri göster"}
        </Link>
      </div>
      <p className="lead">
        {sites.length} site · {ranked.length} tanesi Tranco ilk 1 milyonunda
        {median !== null && ` · tipik (medyan) site ≈ ${compact(median)} ziyaret/ay`}. Ziyaret sayıları sıradan türetilmiş kaba tahminlerdir (×0,5–×2).
      </p>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-muted text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Site</th>
              <th className="px-3 py-2">Ülke</th>
              <th className="px-3 py-2">Tranco</th>
              <th className="px-3 py-2">Tahmini ziyaret / ay</th>
              <th className="px-3 py-2">30 gün</th>
              <th className="px-3 py-2">Eğilim</th>
              <th className="px-3 py-2 text-right">Ürün</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const v = s.tranco_rank ? visitsFromRank(s.tranco_rank) : null;
              const change = rankChange(s.ranks);
              return (
                <tr key={s.domain} className="border-t border-line">
                  <td className="px-3 py-2">
                    <a href={`https://${s.domain}`} target="_blank" rel="noopener noreferrer" className="link">
                      {s.domain}
                    </a>
                    {s.marketplace_status === "found" && <span className="ml-1.5 text-xs text-red-600">pazaryerinde</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{s.country ? countryLabel(s.country) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{s.tranco_rank ? `#${s.tranco_rank.toLocaleString("tr-TR")}` : <span className="text-muted">1 Mn dışı</span>}</td>
                  <td className="px-3 py-2">
                    {v ? (
                      <div className="flex items-center gap-2" title={`${rangeLabel(v)} ziyaret/ay`}>
                        <span className="h-2 w-32 overflow-hidden rounded-full bg-surface-muted">
                          <span
                            className="block h-full rounded-full bg-linear-to-r from-emerald-400 to-emerald-600"
                            style={{ width: `${Math.max(3, ((Math.log10(v.mid) - 4) / Math.max(0.1, Math.log10(maxVisits) - 4)) * 100)}%` }}
                          />
                        </span>
                        <span className="tabular-nums">≈ {compact(v.mid)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">&lt; ~100 B</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums">
                    {change === null ? (
                      <span className="text-muted">veri birikiyor</span>
                    ) : (
                      <span className={change >= 1 ? "text-emerald-600" : "text-red-600"}>
                        {change >= 1 ? "↑" : "↓"} %{Math.abs(Math.round((change - 1) * 100))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {/* Sıra ters çevrilir: yukarı giden çizgi = trafik artıyor. */}
                    <Sparkline values={s.ranks.map((r) => (r.rank ? -r.rank : null))} />
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    <Link href={`/?status=all&q=${encodeURIComponent(s.domain)}`} className="hover:underline">
                      {s.verified} / {s.products}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Ürün sütunu: doğrulanmış / toplam ürün. Eğilim çizgisi son 60 günün sırası; yukarı = trafik artıyor.</p>
    </main>
  );
}
