import Link from "next/link";
import { connection } from "next/server";
import { Sparkline } from "@/components/Charts";
import { getNicheTrends } from "@/lib/niches";

export const metadata = { title: "Nişler" };

function Metric({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div title={hint} className="rounded-xl bg-surface-muted px-2.5 py-2">
      <div className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

export default async function NichesPage() {
  await connection();
  const trends = await getNicheTrends();
  const maxHeat = Math.max(1, ...trends.map((t) => t.heat));

  return (
    <main className="page">
      <p className="eyebrow">Keşif</p>
      <h1 className="h1 mt-1">Niş trendleri</h1>
      <p className="lead">
        Son 5 ayda açılan mağazalar ürün türüne göre gruplanır. Isınma; bu hafta açılan mağazalardan, reklam veren ve reklamını ölçekleyen
        mağazalardan, stok hareketinden ve &quot;Erken&quot; etiketli ürünlerden hesaplanır. Yeni mağazanın çok açıldığı ama reklamın henüz az olduğu nişler
        fırsat olabilir.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {trends.map((t) => {
          const delta = t.opened7 - t.openedPrev7;
          return (
            <section key={t.key} className="card card-hover flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="card-title truncate">{t.label}</h2>
                  <p className="text-xs text-muted">
                    {t.stores} açık yeni mağaza · ort. puan {t.avgScore}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-medium tracking-wide text-muted uppercase">Isınma</div>
                  <div className="text-xl font-semibold tabular-nums text-brand-strong">{t.heat}</div>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <span className="block h-full rounded-full bg-linear-to-r from-amber-400 to-orange-500" style={{ width: `${Math.round((t.heat / maxHeat) * 100)}%` }} />
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium tracking-wide text-muted uppercase">Bu hafta açılan</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {t.opened7}
                    <span className={`ml-1.5 text-xs font-semibold ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted"}`}>
                      {delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${-delta}` : "="}
                    </span>
                  </div>
                </div>
                <div className="w-32" title="Son 8 haftada açılan mağaza sayısı">
                  <Sparkline values={t.weekly} className="stroke-orange-500" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-1.5">
                <Metric label="Reklamcı" value={t.advertisers} hint="Yayında reklamı olan mağaza" />
                <Metric label="Ölçeklenen" value={t.scaling} hint="Reklamı ölçeklenen ya da kanıtlanmış mağaza" tone={t.scaling ? "text-orange-600 dark:text-orange-400" : ""} />
                <Metric label="Hareket" value={t.moving} hint="Stok azalması görülen mağaza" />
                <Metric label="Erken" value={t.early} hint="Talep kanıtı olan, rakibi az ürün" tone={t.early ? "text-emerald-600 dark:text-emerald-400" : ""} />
              </div>

              {t.top.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {t.top.map((s) => (
                    <li key={s.domain}>
                      <Link href={`/m/${s.domain}`} className="flex items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-surface-muted">
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-1 ring-line">
                          {s.image && <img src={s.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.title}</span>
                          <span className="block truncate text-xs text-muted">{s.domain}</span>
                        </span>
                        <span className="text-xs font-semibold tabular-nums">{Math.round(s.score)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <Link href={`/yeni?niche=${t.key}&sort=score`} className="btn btn-sm mt-auto self-start pt-1.5">
                Mağazaları gör
              </Link>
            </section>
          );
        })}
      </div>
    </main>
  );
}
