// Bağımlılıksız SVG grafikler (sunucu bileşenleri). Boş değerler (null) çizgide boşluk bırakır.
import { dayLabel } from "@/lib/format";

export type Point = { day: string; y: number | null };

const W = 640;
const H = 220;
const PAD = { top: 14, right: 14, bottom: 34, left: 100 };
// Grafik ekran genişliğine ölçeklenir; dar ekranda yazılar küçülmesin diye viewBox birimi büyütülür.
const AXIS = "fill-zinc-500 text-[22px] sm:text-[13px]";

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Ardışık (null olmayan) noktaları ayrı çizgi parçalarına böler. */
function segments(points: { x: number; y: number | null }[]): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ x: p.x, y: p.y });
  }
  if (cur.length) out.push(cur);
  return out;
}

export function LineChart({
  points,
  format,
  color = "stroke-emerald-500",
  dot = "fill-emerald-500",
  area = "fill-emerald-500/10",
  empty = "Henüz veri yok",
  minZero = false,
}: {
  points: Point[];
  format: (n: number) => string;
  color?: string;
  dot?: string;
  area?: string;
  empty?: string;
  minZero?: boolean;
}) {
  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day));
  const ys = sorted.map((p) => p.y).filter((y): y is number => y !== null);
  if (ys.length === 0) {
    return <div className="flex h-40 items-center justify-center rounded border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">{empty}</div>;
  }

  const t0 = Date.parse(sorted[0].day);
  const t1 = Date.parse(sorted[sorted.length - 1].day);
  const ticks = niceTicks(minZero ? 0 : Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const sx = (day: string) => PAD.left + (t1 === t0 ? innerW / 2 : ((Date.parse(day) - t0) / (t1 - t0)) * innerW);
  const sy = (y: number) => PAD.top + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;

  const mapped = sorted.map((p) => ({ x: sx(p.day), y: p.y === null ? null : sy(p.y) }));
  const segs = segments(mapped);
  const base = PAD.top + innerH;
  const xLabels = sorted.length > 1 ? [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1]] : [sorted[0]];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
          <text x={PAD.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" className={AXIS}>{format(t)}</text>
        </g>
      ))}
      {[...new Set(xLabels.map((p) => p.day))].map((day, i, arr) => (
        <text key={day} x={sx(day)} y={H - 8} textAnchor={arr.length === 1 ? "middle" : i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"} className={AXIS}>
          {dayLabel(day)}
        </text>
      ))}
      {segs.map((s, i) => (
        <g key={i}>
          {s.length > 1 && (
            <path d={`M${s[0].x},${base} ${s.map((p) => `L${p.x},${p.y}`).join(" ")} L${s[s.length - 1].x},${base} Z`} className={area} />
          )}
          {s.length > 1 && <polyline points={s.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className={color} strokeWidth={2} strokeLinejoin="round" />}
        </g>
      ))}
      {sorted.map((p) =>
        p.y === null ? null : (
          <circle key={p.day} cx={sx(p.day)} cy={sy(p.y)} r={sorted.length > 40 ? 2.5 : 5} className={dot}>
            <title>{`${dayLabel(p.day)}: ${format(p.y)}`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}

/** Küçük eğilim çizgisi (kart ve tablo için). */
export function Sparkline({ values, className = "stroke-emerald-500" }: { values: (number | null)[]; className?: string }) {
  const ys = values.filter((v): v is number => v !== null);
  if (ys.length < 2) return <span className="text-xs text-zinc-400">—</span>;
  const w = 80;
  const h = 22;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const pts = values.map((v, i) => ({ x: (i / (values.length - 1)) * w, y: v === null ? null : h - 2 - ((v - min) / (max - min || 1)) * (h - 4) }));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="inline-block align-middle">
      {segments(pts).map((s, i) => (
        <polyline key={i} points={s.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className={className} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

/** Winner skoru bileşenleri: her biri kendi azamisine göre dolan çubuk. */
export function ScoreBars({ parts }: { parts: { label: string; value: number; max: number; hint: string }[] }) {
  return (
    <div className="space-y-1.5">
      {parts.map((p) => (
        <div key={p.label} title={p.hint} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-xs">
          <span className="text-zinc-500">{p.label}</span>
          <span className="h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
            <span className="block h-full rounded bg-amber-500" style={{ width: `${Math.min(100, (p.value / p.max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums">{p.value.toFixed(1)}/{p.max}</span>
        </div>
      ))}
    </div>
  );
}
