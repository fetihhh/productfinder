// Arayüz biçimlendirme yardımcıları.

const regionNames = new Intl.DisplayNames(["tr"], { type: "region" });

/** "US" → "🇺🇸 Amerika Birleşik Devletleri" */
export function countryLabel(code: string): string {
  const flag = countryFlag(code);
  let name = code;
  try {
    name = regionNames.of(code) ?? code;
  } catch {
    // geçersiz kod: olduğu gibi göster
  }
  return `${flag} ${name}`;
}

export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function formatPrice(price: number | null, currency: string | null): string | null {
  if (price === null || !Number.isFinite(Number(price))) return null;
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: 2 }).format(Number(price));
  } catch {
    return `${price} ${currency ?? ""}`.trim();
  }
}

const AVAILABILITY: Record<string, string> = {
  InStock: "Stokta",
  OutOfStock: "Tükendi",
  PreOrder: "Ön sipariş",
  BackOrder: "Ön sipariş",
  LimitedAvailability: "Sınırlı stok",
  SoldOut: "Tükendi",
  Discontinued: "Üretimi bitti",
};

export function availabilityLabel(v: string | null): string | null {
  return v ? (AVAILABILITY[v] ?? v) : null;
}

const monthFmt = new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" });

export function launchLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : monthFmt.format(d);
}

const compactFmt = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

/** 12345 → "12,3 B", 2400000 → "2,4 Mn" */
export function compact(n: number): string {
  return compactFmt.format(n);
}

export function rangeLabel(r: { low: number; high: number } | null, unit = ""): string | null {
  if (!r) return null;
  return `${compact(r.low)}–${compact(r.high)}${unit}`;
}

/** Fiyat aralığı (ör. tahmini ciro) para birimiyle, kısaltılmış. */
export function moneyRange(r: { low: number; high: number } | null, currency: string | null): string | null {
  if (!r) return null;
  try {
    const f = new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency ?? "USD", notation: "compact", maximumFractionDigits: 1 });
    return `${f.format(r.low)}–${f.format(r.high)}`;
  } catch {
    return `${compact(r.low)}–${compact(r.high)} ${currency ?? ""}`.trim();
  }
}

const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-10-08" → "8 Eki" */
export function dayLabel(day: string): string {
  return dayFmt.format(new Date(`${day}T00:00:00Z`));
}

/** Tarihten bugüne geçen süre: "bugün", "12 gün", "3 ay". */
export function ageLabel(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days < 1) return "bugün";
  if (days < 60) return `${days} gün`;
  return `${Math.floor(days / 30)} ay`;
}
