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
