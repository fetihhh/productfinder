// Kazanan reklamların gerçek kitlesi: Meta Reklam Kütüphanesi AB reklamları için yaş × cinsiyet × ülke erişim dökümü verir
// (age_country_gender_reach_breakdown). Buradan kime gösterildiği çıkarılır ve Türkiye kampanyası için hedefleme önerilir.
import type { ArchivedAd } from "./adLibrary.ts";

export type AgeGenderRow = { age_range?: string; male?: number | null; female?: number | null; unknown?: number | null };
export type CountryBreakdown = { country?: string; age_gender_breakdowns?: AgeGenderRow[] };

export type Audience = {
  /** Dökümdeki toplam erişim (kişi). */
  total: number;
  female: number;
  male: number;
  /** Yaş aralığı payları (0–1), yaşa göre sıralı. */
  ages: { range: string; share: number }[];
  /** Erişimin en az %70'ini kapsayan en dar bitişik yaş aralığı. */
  core: { min: number; max: number | null; share: number } | null;
  /** Reklamların kaçında hangi platform seçili (0–1). */
  platforms: { name: string; share: number }[];
  /** En çok erişilen ülkeler (pay). */
  countries: { code: string; share: number }[];
  /** Dökümü olan reklam sayısı. */
  ads: number;
};

const ageBounds = (r: string): [number, number | null] => {
  const m = r.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  const p = r.match(/^(\d+)\+$/);
  return p ? [Number(p[1]), null] : [Number.NaN, null];
};

/** Erişim dökümünden kitle; döküm yoksa null. Uzun süredir yayındaki (kazanan) reklamların erişimi zaten büyüktür. */
export function audienceOf(ads: ArchivedAd[]): Audience | null {
  const ageMap = new Map<string, number>();
  const countryMap = new Map<string, number>();
  let female = 0;
  let male = 0;
  let total = 0;
  let withData = 0;
  for (const a of ads) {
    const rows = (a.age_country_gender_reach_breakdown ?? []) as CountryBreakdown[];
    let any = false;
    for (const c of rows) {
      for (const r of c.age_gender_breakdowns ?? []) {
        const f = Number(r.female ?? 0) || 0;
        const m = Number(r.male ?? 0) || 0;
        const u = Number(r.unknown ?? 0) || 0;
        const sum = f + m + u;
        if (sum <= 0 || !r.age_range) continue;
        any = true;
        female += f;
        male += m;
        total += sum;
        ageMap.set(r.age_range, (ageMap.get(r.age_range) ?? 0) + sum);
        if (c.country) countryMap.set(c.country, (countryMap.get(c.country) ?? 0) + sum);
      }
    }
    if (any) withData++;
  }
  if (total === 0) return null;

  const ages = [...ageMap.entries()]
    .map(([range, n]) => ({ range, share: n / total, lo: ageBounds(range)[0] }))
    .filter((a) => Number.isFinite(a.lo))
    .sort((a, b) => a.lo - b.lo);
  // Çekirdek yaş: en büyük dilimden başlayıp komşulardan büyük olanı ekleyerek %70'e ulaşana kadar genişlet.
  let core: Audience["core"] = null;
  if (ages.length) {
    let i = ages.reduce((best, a, k) => (a.share > ages[best].share ? k : best), 0);
    let j = i;
    let share = ages[i].share;
    while (share < 0.7 && (i > 0 || j < ages.length - 1)) {
      const left = i > 0 ? ages[i - 1].share : -1;
      const right = j < ages.length - 1 ? ages[j + 1].share : -1;
      if (right >= left) share += ages[++j].share;
      else share += ages[--i].share;
    }
    core = { min: ageBounds(ages[i].range)[0], max: ageBounds(ages[j].range)[1], share };
  }

  const platformCount = new Map<string, number>();
  for (const a of ads) for (const p of new Set(a.publisher_platforms ?? [])) platformCount.set(p, (platformCount.get(p) ?? 0) + 1);
  const platforms = [...platformCount.entries()].map(([name, n]) => ({ name, share: n / ads.length })).sort((a, b) => b.share - a.share);
  const countries = [...countryMap.entries()]
    .map(([code, n]) => ({ code, share: n / total }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);

  return {
    total,
    female,
    male,
    ages: ages.map(({ range, share }) => ({ range, share })),
    core,
    platforms,
    countries,
    ads: withData,
  };
}

export type Targeting = {
  gender: string;
  genderNote: string;
  ageMin: number;
  ageMax: number | null;
  placements: string[];
  notes: string[];
};

/** Türkiye kampanyası için hedefleme önerisi (Reklam Yöneticisi ayarları). */
export function turkeyTargeting(a: Audience): Targeting {
  const known = a.female + a.male;
  const fShare = known > 0 ? a.female / known : 0.5;
  const pct = (x: number) => `%${Math.round(x * 100)}`;
  const gender = fShare >= 0.7 ? "Kadın" : fShare <= 0.3 ? "Erkek" : "Tümü";
  const genderNote =
    gender === "Tümü"
      ? `Kitle karışık (${pct(fShare)} kadın, ${pct(1 - fShare)} erkek): cinsiyet daraltmayın, Meta en iyi tepki vereni kendisi bulur.`
      : `Erişimin ${pct(gender === "Kadın" ? fShare : 1 - fShare)}'i ${gender.toLowerCase()}: testte yalnızca ${gender.toLowerCase()} hedefleyin.`;
  const ageMin = Math.max(18, a.core?.min ?? 18);
  const ageMax = a.core?.max ?? null;
  const share = (n: string) => a.platforms.find((p) => p.name === n)?.share ?? 0;
  const placements: string[] = [];
  // Reklamlar 3+ platformda birden yayındaysa rakip otomatik yerleşim (Advantage+) kullanıyor demektir.
  const auto = a.platforms.filter((p) => p.share >= 0.8).length >= 3;
  if (auto) placements.push("Advantage+ yerleşimler (rakip de otomatik yerleşim kullanıyor)");
  else {
    if (share("instagram") >= 0.5) placements.push("Instagram Reels", "Instagram Akış ve Hikâyeler");
    if (share("facebook") >= 0.5) placements.push("Facebook Akış", "Facebook Reels");
  }
  if (placements.length === 0) placements.push("Advantage+ yerleşimler (otomatik)");
  const notes = [
    "Konum: Türkiye (yalnızca \"bu konumda yaşayan kişiler\").",
    "Dil: boş bırakın (Türkçe seçmek kitleyi gereksiz daraltır).",
    "İlgi alanı eklemeden geniş hedeflemeyle başlayın; kreatif kitleyi seçer. Sonuç gelmezse ürünle ilgili 2–3 ilgi alanı deneyin.",
  ];
  if (a.core && a.core.share < 0.6) notes.push("Yaş dağılımı geniş: yaş aralığını daraltmadan başlayın.");
  return { gender, genderNote, ageMin, ageMax, placements, notes };
}
