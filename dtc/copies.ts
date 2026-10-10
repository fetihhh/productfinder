// Kopyalanan ürünler: aynı ürünü satan yeni mağazaları bulur. Aynı AliExpress görsel kimliği ya da neredeyse aynı
// öne çıkan ürün fotoğrafı (dHash farkı ≤ eşik) → aynı ürün. Bir ürünü birden çok dropshipper aynı anda satıyorsa
// ürün büyük ihtimalle satıyordur (klasik "winner" işareti) — ama rekabet de artıyordur.

/** 256 bitlik özet ↔ 64 karakter onaltılık metin (veritabanında saklamak için). */
export function hashToHex(h: bigint): string {
  return h.toString(16).padStart(64, "0");
}

/** Onaltılık özet → 8 × 32 bit (hızlı karşılaştırma için). */
export function hexToWords(hex: string): Uint32Array {
  const w = new Uint32Array(8);
  for (let i = 0; i < 8; i++) w[i] = parseInt(hex.slice(i * 8, i * 8 + 8), 16) >>> 0;
  return w;
}

function popcount32(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function wordsDistance(a: Uint32Array, b: Uint32Array, stopAbove = Infinity): number {
  let d = 0;
  for (let i = 0; i < 8 && d <= stopAbove; i++) d += popcount32((a[i] ^ b[i]) >>> 0);
  return d;
}

export type CopyPoint = {
  domain: string;
  hash: string | null;
  aliId: string | null;
  firstProductAt: string | null;
  /** Görsel adresindeki Shopify mağaza kimliği: aynı kimlik = aynı mağaza (farklı alan adıyla). */
  shopId?: string | null;
  title?: string | null;
  price?: number | null;
};

/**
 * size: kümedeki farklı mağaza (Shopify mağaza kimliği) sayısı.
 * sameSeller: tüm mağazalar ürünü birebir aynı başlık ve fiyatla satıyor → büyük ihtimalle aynı satıcının mağaza ağı;
 * bağımsız rakip sayılmaz (kopya puanı verilmez).
 */
export type CopyGroup = { group: string | null; size: number; sameSeller: boolean };

/** cdn.shopify.com/s/files/1/1022/1122/3866/files/… → "1022/1122/3866" */
export function shopIdFromImage(url: string | null): string | null {
  return url?.match(/\/s\/files\/1\/(\d+\/\d+\/\d+)\//)?.[1] ?? null;
}

/**
 * Mağazaları aynı ürüne göre kümeler (birleşim-bul). Küme anahtarı: kümedeki ilk açılan mağazanın alan adı.
 * Tek başına kalan (ya da yalnızca aynı mağazanın başka alan adlarıyla eşleşen) mağaza: { group: null, size: 1 }.
 */
export function clusterCopies(points: CopyPoint[], maxDistance: number): Map<string, CopyGroup> {
  const n = points.length;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const byAli = new Map<string, number>();
  points.forEach((p, i) => {
    if (!p.aliId) return;
    const j = byAli.get(p.aliId);
    if (j === undefined) byAli.set(p.aliId, i);
    else union(i, j);
  });
  const words = points.map((p) => (p.hash && /^[0-9a-f]{64}$/.test(p.hash) ? hexToWords(p.hash) : null));
  for (let i = 0; i < n; i++) {
    const a = words[i];
    if (!a) continue;
    for (let j = i + 1; j < n; j++) {
      const b = words[j];
      if (b && wordsDistance(a, b, maxDistance) <= maxDistance) union(i, j);
    }
  }

  const members = new Map<number, number[]>();
  for (let i = 0; i < n; i++) members.set(find(i), [...(members.get(find(i)) ?? []), i]);
  const out = new Map<string, CopyGroup>();
  for (const idx of members.values()) {
    const shops = new Set(idx.map((i) => points[i].shopId ?? points[i].domain));
    const norm = (i: number) => `${(points[i].title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${points[i].price ?? ""}`;
    const sameSeller = shops.size > 1 && idx.every((i) => points[i].title && norm(i) === norm(idx[0]));
    const first = [...idx].sort(
      (x, y) => (points[x].firstProductAt ?? "9").localeCompare(points[y].firstProductAt ?? "9") || points[x].domain.localeCompare(points[y].domain),
    )[0];
    for (const i of idx) {
      out.set(points[i].domain, shops.size > 1 ? { group: points[first].domain, size: shops.size, sameSeller } : { group: null, size: 1, sameSeller: false });
    }
  }
  return out;
}

/**
 * Kopya puanı (0–15): aynı ürünü satan başka mağaza 1 → 8, 2–4 → 12, ≥ 5 → 15. Mağaza toplam puanına eklenir.
 * copies = kümedeki diğer mağaza sayısı (küme boyutu − 1).
 */
export function copyPoints(copies: number): number {
  return copies >= 5 ? 15 : copies >= 2 ? 12 : copies >= 1 ? 8 : 0;
}
