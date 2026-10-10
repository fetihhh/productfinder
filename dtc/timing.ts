// Zamanlama: bir ürüne şimdi girmek için erken mi, zirvede mi, doymuş mu? Aynı ürünü satan mağazalar (kopya kümesi),
// bunların kaçının reklam verdiği, reklamların büyüyüp büyümediği ve ürünün ne zamandır satıldığı birlikte değerlendirilir.

export type Timing = "early" | "peak" | "saturated" | "fading" | "unproven";

export const TIMING_LABELS: Record<Timing, string> = {
  early: "Erken",
  peak: "Zirvede",
  saturated: "Doymuş",
  fading: "Sönüyor",
  unproven: "Henüz kanıt yok",
};

export type TimingMember = {
  firstProductAt: string | null;
  activeAds: number;
  totalAds: number;
  newAds14d: number;
  /** proven | scaling | testing | stopped | none */
  adStage: string;
  stockDrops: number;
};

const DAY = 86_400_000;

/**
 * Kurallar (ilk uyan geçerli):
 *   Doymuş   — ≥ 8 bağımsız mağaza ya da ≥ 5 mağaza reklam veriyor
 *   Sönüyor  — eskiden reklam verilmiş ama artık kimse vermiyor ve stok hareketi yok
 *   Zirvede  — 4–7 mağaza, ya da 3–4 reklamcı, ya da ≥ 30 gündür kanıtlanmış reklamla ve en az 2 mağaza
 *   Erken    — ≤ 3 mağaza, ≤ 2 reklamcı, ilk satış ≤ 60 gün ve talep kanıtı var (yayında reklam, ölçeklenen reklam ya da stok hareketi)
 *   Henüz kanıt yok — talep kanıtı olmayan tek mağaza ürünü
 */
export function timingFor(members: TimingMember[], now = Date.now()): { timing: Timing; reason: string } {
  const n = Math.max(1, members.length);
  const advertisers = members.filter((m) => m.activeAds > 0).length;
  const everAdvertised = members.filter((m) => m.totalAds > 0).length;
  const scaling = members.some((m) => m.adStage === "scaling" || m.adStage === "proven");
  const proven = members.some((m) => m.adStage === "proven");
  const drops = members.reduce((s, m) => s + m.stockDrops, 0);
  const first = members.map((m) => m.firstProductAt).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  const age = first ? Math.round((now - Date.parse(first)) / DAY) : null;
  const ageText = age !== null ? `${age} gündür satılıyor` : "satış süresi bilinmiyor";
  const base = `${n} mağaza · ${advertisers} reklamcı · ${ageText}`;

  if (n >= 8 || advertisers >= 5) return { timing: "saturated", reason: `${base}: rekabet yoğun` };
  if (everAdvertised > 0 && advertisers === 0 && drops === 0) return { timing: "fading", reason: `${base}: reklamlar durmuş, stok hareketi yok` };
  if (n >= 4 || advertisers >= 3 || (proven && n >= 2 && age !== null && age >= 30)) return { timing: "peak", reason: `${base}: talep kanıtlı, rakipler çoğalıyor` };
  const evidence = advertisers > 0 || scaling || drops > 0;
  if (evidence && (age === null || age <= 60)) return { timing: "early", reason: `${base}: talep var, rakip az` };
  if (evidence) return { timing: "peak", reason: `${base}: talep var ama ürün bir süredir satılıyor` };
  return { timing: "unproven", reason: `${base}: reklam ya da satış hareketi görülmedi` };
}
