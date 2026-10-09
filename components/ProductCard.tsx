import { saveTracking } from "@/app/actions";
import type { ProductRow } from "@/lib/products";

const STATUS: Record<ProductRow["dtc_status"], { label: string; cls: string }> = {
  verified: { label: "Doğrulandı", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected_marketplace: { label: "Pazaryerinde", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  unverified: { label: "Doğrulanmadı", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

const TRACK: Record<string, { label: string; cls: string }> = {
  favorite: { label: "★ Favori", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  review: { label: "İncelenecek", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  rejected: { label: "Elendi", cls: "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-800" },
};

const SOURCE_NAMES: Record<string, string> = {
  coolthings: "Cool Things",
  thegadgeteer: "The Gadgeteer",
  theawesomer: "The Awesomer",
};

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
const badge = "rounded px-1.5 py-0.5 text-xs font-medium";
const input = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function ProductCard({ p }: { p: ProductRow }) {
  const href = p.product_url ?? `https://${p.brand_domain}`;
  const b = p.score_breakdown;
  const scoreTitle = b
    ? `Kaynak ${b.parts.kaynak} + Artış ${b.parts.artis} + Hacim ${b.parts.hacim}\n${b.sources} kaynak · son 7 gün ${b.m7} · son 30 gün ${b.m30}`
    : undefined;
  const t = p.tracking;

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <a href={href} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {p.image_url && (
          <img src={p.image_url} alt={p.name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${badge} ${STATUS[p.dtc_status].cls}`}>{STATUS[p.dtc_status].label}</span>
          {p.brands?.platform && p.brands.platform !== "unknown" && (
            <span className={`${badge} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300`}>{p.brands.platform}</span>
          )}
          {t?.status && <span className={`${badge} ${TRACK[t.status].cls}`}>{TRACK[t.status].label}</span>}
          <span title={scoreTitle} className={`${badge} ml-auto cursor-help bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>
            Skor {Number(p.trend_score).toFixed(0)}
          </span>
        </div>

        <h2 className="font-medium leading-snug">
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.name}</a>
        </h2>
        <a href={`https://${p.brand_domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {p.brand_domain} ↗
        </a>

        {p.dtc_reason && (
          <p title={p.dtc_reason} className="line-clamp-3 text-xs text-zinc-500">{p.dtc_reason}</p>
        )}

        <p className="text-xs text-zinc-500">
          {p.mentions.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" title={m.title ?? undefined} className="mr-2 hover:underline">
              {SOURCE_NAMES[m.source] ?? m.source} · {dateFmt.format(new Date(m.posted_at))}
            </a>
          ))}
        </p>

        <details className="mt-auto border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400">
            Takip ve Türkiye notu{t?.note || t?.tr_competitor || t?.tr_est_cost || t?.tr_note ? " •" : ""}
          </summary>
          <form action={saveTracking} className="mt-2 space-y-2">
            <input type="hidden" name="product_id" value={p.id} />
            <select name="status" defaultValue={t?.status ?? ""} className={input} aria-label="Takip durumu">
              <option value="">Takip yok</option>
              <option value="favorite">Favori</option>
              <option value="review">İncelenecek</option>
              <option value="rejected">Elendi</option>
            </select>
            <textarea name="note" defaultValue={t?.note ?? ""} rows={2} placeholder="Not" className={input} />
            <input name="tr_competitor" defaultValue={t?.tr_competitor ?? ""} placeholder="Türkiye'de rakip var mı?" className={input} />
            <input name="tr_est_cost" defaultValue={t?.tr_est_cost ?? ""} placeholder="Tahmini maliyet" className={input} />
            <textarea name="tr_note" defaultValue={t?.tr_note ?? ""} rows={2} placeholder="Türkiye notu" className={input} />
            <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Kaydet</button>
          </form>
        </details>
      </div>
    </article>
  );
}
