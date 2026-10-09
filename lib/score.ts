// Açıklanabilir trend skoru (0–100). Kaynaklar (bloglar) upvote vermediği için etkileşim bileşeni yoktur.
//
//   kaynak  = 40 × min(S, 3) / 3          S   = ürünü anan farklı kaynak (blog) sayısı
//   artış   = 30 × min(G, 3) / 3          G   = m7 / max(1, (m30 − m7) / 3)
//                                               m7: son 7 gündeki bahsedilme, m30: son 30 gündeki
//                                               (son hafta, önceki 3 haftanın haftalık ortalamasına göre)
//   hacim   = 30 × min(m30, 5) / 5
//
// Örnek: tek blogda bu hafta 1 kez anılan ürün → 13.3 + 10 + 6 = 29.3

export type MentionLite = { source: string; posted_at: string };

export type ScoreBreakdown = {
  sources: number;
  m7: number;
  m30: number;
  growth: number;
  parts: { kaynak: number; artis: number; hacim: number };
};

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function trendScore(mentions: MentionLite[], now = Date.now()): { score: number; breakdown: ScoreBreakdown } {
  const sources = new Set(mentions.map((m) => m.source)).size;
  const ages = mentions.map((m) => now - new Date(m.posted_at).getTime());
  const m7 = ages.filter((a) => a <= 7 * DAY).length;
  const m30 = ages.filter((a) => a <= 30 * DAY).length;
  const growth = m7 / Math.max(1, (m30 - m7) / 3);

  const kaynak = (40 * Math.min(sources, 3)) / 3;
  const artis = (30 * Math.min(growth, 3)) / 3;
  const hacim = (30 * Math.min(m30, 5)) / 5;

  return {
    score: round1(kaynak + artis + hacim),
    breakdown: {
      sources,
      m7,
      m30,
      growth: round1(growth),
      parts: { kaynak: round1(kaynak), artis: round1(artis), hacim: round1(hacim) },
    },
  };
}
