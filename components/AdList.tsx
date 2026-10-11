"use client";

import { useMemo, useState } from "react";
import type { AdItemView } from "@/dtc/adItems";

const PLATFORM: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network", threads: "Threads", whatsapp: "WhatsApp" };

const SORTS = {
  score: { label: "En çok tutan (önerilen)", fn: (a: AdItemView, b: AdItemView) => b.score - a.score },
  days: { label: "En uzun yayında", fn: (a: AdItemView, b: AdItemView) => (b.days ?? -1) - (a.days ?? -1) },
  newest: { label: "En yeni", fn: (a: AdItemView, b: AdItemView) => (b.start_at ?? "").localeCompare(a.start_at ?? "") },
  reach: { label: "En çok erişim", fn: (a: AdItemView, b: AdItemView) => (b.eu_reach ?? -1) - (a.eu_reach ?? -1) },
  copies: { label: "En çok kopyalanan", fn: (a: AdItemView, b: AdItemView) => b.activeCopies - a.activeCopies || b.copies - a.copies },
} as const;
type SortKey = keyof typeof SORTS;

const compact = (n: number) => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const day = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "2-digit" });
const flag = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Kopyalandı ✓" : "Metni kopyala"}
    </button>
  );
}

/** Reklamın Meta önizlemesi (görsel/video): yalnızca ekrana gelince yüklenir. */
function AdPreview({ id }: { id: string }) {
  return (
    <div className="w-full shrink-0 overflow-hidden rounded-xl border border-line bg-white sm:w-[300px]">
      <iframe
        src={`/reklam/${id}`}
        title="Reklam önizlemesi"
        loading="lazy"
        referrerPolicy="no-referrer"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        className="block h-[520px] w-full"
      />
    </div>
  );
}

/** Mağazanın tüm Meta reklamları: sıralama, yayındakiler, aynı metnin kopyalarını birleştirme ve arama. */
export function AdList({ items, previews = true }: { items: AdItemView[]; previews?: boolean }) {
  const [showPreview, setShowPreview] = useState(previews);
  const [sort, setSort] = useState<SortKey>("score");
  const [activeOnly, setActiveOnly] = useState(false);
  const [merge, setMerge] = useState(true);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    let list = items.filter((i) => (!activeOnly || i.active) && (!needle || `${i.title ?? ""} ${i.body ?? ""} ${i.description ?? ""}`.toLocaleLowerCase("tr").includes(needle)));
    list = [...list].sort(SORTS[sort].fn);
    if (merge) {
      // Aynı metnin kopyalarından yalnızca sıralamada ilk geleni (en iyisi) gösterilir.
      const seen = new Set<string>();
      list = list.filter((i) => {
        if (!i.creative_key) return true;
        if (seen.has(i.creative_key)) return false;
        seen.add(i.creative_key);
        return true;
      });
    }
    return list;
  }, [items, sort, activeOnly, merge, q]);

  const active = items.filter((i) => i.active).length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="field w-56" aria-label="Sıralama">
          {Object.entries(SORTS).map(([k, s]) => (
            <option key={k} value={k}>
              {s.label}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Metinde ara…" className="field w-48" aria-label="Reklam metninde ara" />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm select-none has-checked:border-amber-500/60 has-checked:bg-amber-500/10">
          <input type="checkbox" className="check" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Yalnızca yayında ({active})
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm select-none has-checked:border-amber-500/60 has-checked:bg-amber-500/10">
          <input type="checkbox" className="check" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
          Aynı metni birleştir
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm select-none has-checked:border-amber-500/60 has-checked:bg-amber-500/10">
          <input type="checkbox" className="check" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} />
          Video / görsel önizleme
        </label>
        <span className="text-xs text-muted">
          {rows.length} / {items.length} reklam
        </span>
      </div>

      <ol className="mt-4 space-y-3">
        {rows.slice(0, limit).map((i, n) => (
          <li key={i.id} className="flex flex-col gap-4 rounded-2xl border border-line p-4 sm:flex-row">
            {showPreview && <AdPreview id={i.id} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-muted text-[11px] font-semibold tabular-nums">{n + 1}</span>
                <span className={`inline-flex items-center gap-1 font-medium ${i.active ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}>
                  <span className={`h-2 w-2 rounded-full ${i.active ? "bg-emerald-500" : "bg-zinc-400"}`} />
                  {i.active ? "Yayında" : "Durdu"}
                </span>
                {i.days !== null && (
                  <span title="Yayında kaldığı süre">
                    <b className="tabular-nums">{i.days}</b> gün
                  </span>
                )}
                {i.start_at && (
                  <span className="text-muted">
                    {day(i.start_at)} → {i.active ? "bugün" : i.stop_at ? day(i.stop_at) : "?"}
                  </span>
                )}
                {i.copies > 1 && (
                  <span className="badge bg-orange-500/15 text-orange-700 dark:text-orange-300" title="Aynı metinle açılmış reklam sayısı (yayında / toplam): ölçekleme işareti">
                    {i.activeCopies}/{i.copies} kopya
                  </span>
                )}
                {i.eu_reach ? (
                  <span title="AB'deki erişim">
                    👥 <b className="tabular-nums">{compact(i.eu_reach)}</b>
                  </span>
                ) : null}
                {i.female_share !== null && (
                  <span className="text-muted" title="Erişimin cinsiyet ve en büyük yaş dilimi">
                    {i.female_share >= 0.5 ? `%${Math.round(i.female_share * 100)} kadın` : `%${Math.round((1 - i.female_share) * 100)} erkek`}
                    {i.top_age ? ` · ${i.top_age}` : ""}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-muted tabular-nums" title="Önerilen sıra puanı: yayında kalma süresi, yayındaki kopya, erişim">
                  puan {i.score}
                </span>
              </div>
              {i.title && <p className="mt-2 text-sm font-semibold">{i.title}</p>}
              {i.body && (
                <details className="group mt-1">
                  <summary className="cursor-pointer list-none text-sm whitespace-pre-line [&::-webkit-details-marker]:hidden">
                    <span className="line-clamp-3 group-open:line-clamp-none">{i.body}</span>
                    <span className="text-xs text-brand-strong group-open:hidden">devamı</span>
                  </summary>
                </details>
              )}
              {i.description && <p className="mt-1 text-xs text-muted">{i.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {i.platforms.length > 0 && <span>{i.platforms.map((p) => PLATFORM[p] ?? p).join(" · ")}</span>}
                {i.countries.length > 0 && <span title={i.countries.join(", ")}>{i.countries.slice(0, 8).map(flag).join(" ")}</span>}
                {i.page_name && <span>Sayfa: {i.page_name}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a href={`https://www.facebook.com/ads/library/?id=${encodeURIComponent(i.id)}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-primary">
                  Reklamı aç ↗
                </a>
                <a href={`/reklam/${i.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                  Önizlemeyi büyüt ↗
                </a>
                {(i.title || i.body) && <CopyText text={[i.title, i.body].filter(Boolean).join("\n\n")} />}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {rows.length > limit && (
        <button type="button" className="btn mt-4 w-full justify-center" onClick={() => setLimit((l) => l + 20)}>
          Daha fazla göster ({rows.length - limit} kaldı)
        </button>
      )}
      {rows.length === 0 && <p className="mt-4 text-sm text-muted">Bu filtrede reklam yok.</p>}
    </div>
  );
}
