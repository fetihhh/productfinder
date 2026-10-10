// Ortak arayüz parçaları (sunucu bileşenleri): puan halkası, küçük ölçüm kutusu, filtre anahtarı.

/** Puana göre dolan halka (winner skoru, mağaza puanı). */
export function ScoreRing({ score, title, label = "winner" }: { score: number; title?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <span
      title={title}
      className="grid h-12 w-12 cursor-help place-items-center rounded-full p-[3px] shadow-lg"
      style={{ background: `conic-gradient(#f97316 ${pct * 3.6}deg, rgb(255 255 255 / 0.35) 0deg)` }}
    >
      <span className="grid h-full w-full place-items-center rounded-full bg-zinc-950/85 text-white backdrop-blur">
        <span className="text-center leading-none">
          <span className="block text-sm font-bold tabular-nums">{Math.round(score)}</span>
          <span lang={label === "winner" ? "en" : "tr"} className="block text-[8px] font-semibold tracking-wider text-amber-300 uppercase">{label}</span>
        </span>
      </span>
    </span>
  );
}

/** Kart içindeki küçük ölçüm kutusu (fiyat, toptan, marj…). */
export function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-muted px-2.5 py-2">
      <div className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={`truncate text-sm font-semibold tabular-nums ${good ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{value}</div>
      {sub && <div className="truncate text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

/** GET formlarında hap biçiminde onay kutusu. */
export function Toggle({ name, checked, label, title }: { name: string; checked: boolean; label: string; title?: string }) {
  return (
    <label
      title={title}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-foreground/80 transition select-none hover:bg-surface-muted has-checked:border-amber-500/60 has-checked:bg-amber-500/10 has-checked:text-amber-800 dark:has-checked:text-amber-300"
    >
      <input type="checkbox" name={name} value="1" defaultChecked={checked} className="check" />
      {label}
    </label>
  );
}

/** Görselin üstündeki yarı saydam etiket. */
export function OverlayBadge({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`badge bg-white/90 text-zinc-800 shadow-sm backdrop-blur dark:bg-zinc-900/85 dark:text-zinc-100 ${className}`}>
      {children}
    </span>
  );
}

const TIMING_STYLE: Record<string, { label: string; icon: string; cls: string }> = {
  early: { label: "Erken", icon: "🌱", cls: "bg-emerald-600 text-white" },
  peak: { label: "Zirvede", icon: "🔥", cls: "bg-amber-500 text-white" },
  saturated: { label: "Doymuş", icon: "🧱", cls: "bg-red-600 text-white" },
  fading: { label: "Sönüyor", icon: "📉", cls: "bg-zinc-600 text-white" },
  unproven: { label: "Henüz kanıt yok", icon: "·", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

/** Zamanlama: şimdi bu ürüne girmek için erken mi, zirvede mi, doymuş mu? */
export function TimingBadge({ timing, reason, hideUnproven = false }: { timing: string | null | undefined; reason?: string | null; hideUnproven?: boolean }) {
  if (!timing || (hideUnproven && timing === "unproven")) return null;
  const t = TIMING_STYLE[timing] ?? TIMING_STYLE.unproven;
  return (
    <span title={reason ?? undefined} className={`badge cursor-help shadow-sm ${t.cls}`}>
      {t.icon} {t.label}
    </span>
  );
}