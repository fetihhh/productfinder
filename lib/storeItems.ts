// Ürün bazında kopya tespiti ve stok hareketinin veritabanı katmanı (store_items). Mağazaların anlık görüntüsündeki ilk
// ürünler (hareket sırasına göre) ayrı satırlarda tutulur; görsel özeti ve AliExpress görsel kimliğiyle aynı ürünü satan
// bağımsız mağazalar bulunur. Bir ürünü birden çok yeni mağazanın aynı anda satması klasik "winner" işaretidir.
import { clusterCopies, shopIdFromImage } from "../dtc/copies.ts";
import { allRows, db } from "./db.ts";

export type ItemToHash = { domain: string; handle: string; image: string };

/** Anlık görüntülerden ürünleri eşitler (mağaza başına ilk perStore ürün); değişen satır sayısı. */
export async function syncStoreItems(perStore: number): Promise<number> {
  const { data, error } = await db().rpc("sync_store_items", { per_store: perStore });
  if (error) throw new Error(`store_items eşitlenemedi: ${error.message}`);
  return Number(data ?? 0);
}

/** Görsel özeti çıkarılmamış ürünler: önce stoğu azalanlar. */
export async function itemsToHash(limit: number): Promise<ItemToHash[]> {
  const { data, error } = await db()
    .from("store_items")
    .select("domain, handle, image")
    .is("hashed_at", null)
    .not("image", "is", null)
    .order("so", { ascending: false })
    .order("domain")
    .limit(Math.min(limit, 1000));
  if (error) throw new Error(`store_items okunamadı: ${error.message}`);
  return data as ItemToHash[];
}

export async function saveItemHash(domain: string, handle: string, hash: string | null): Promise<void> {
  const { error } = await db().from("store_items").update({ hash, hashed_at: new Date().toISOString() }).eq("domain", domain).eq("handle", handle);
  if (error) throw new Error(`store_items güncellenemedi: ${error.message}`);
}

type ItemRow = {
  domain: string;
  handle: string;
  title: string | null;
  price: number | null;
  image: string | null;
  hash: string | null;
  ali: string | null;
  shop_id: string | null;
  copy_group: string | null;
  copies: number;
  same_seller: boolean;
};

export const itemKey = (domain: string, handle: string) => `${domain}/${handle}`;

/**
 * Ürünleri aynı fotoğraf (dHash farkı ≤ eşik) ya da aynı AliExpress görsel kimliği üzerinden kümeler; değişenleri yazar.
 * copies = aynı ürünü satan diğer mağaza sayısı (aynı Shopify mağazasının başka alan adları sayılmaz).
 */
export async function updateItemCopies(maxDistance: number): Promise<{ items: number; groups: number; changed: number }> {
  const { data, error } = await allRows<ItemRow>((a, b) =>
    db()
      .from("store_items")
      .select("domain, handle, title, price, image, hash, ali, shop_id, copy_group, copies, same_seller")
      .or("hash.not.is.null,ali.not.is.null,copy_group.not.is.null")
      .order("domain")
      .order("handle")
      .range(a, b),
  );
  if (error) throw new Error(`store_items okunamadı: ${error.message}`);
  const rows = data!;
  const groups = clusterCopies(
    rows.map((r) => ({
      domain: itemKey(r.domain, r.handle),
      hash: r.hash,
      aliId: r.ali,
      firstProductAt: null,
      shopId: r.shop_id ?? shopIdFromImage(r.image) ?? r.domain,
      title: r.title,
      price: r.price === null ? null : Number(r.price),
    })),
    maxDistance,
  );
  let changed = 0;
  for (const r of rows) {
    const g = groups.get(itemKey(r.domain, r.handle)) ?? { group: null, size: 1, sameSeller: false };
    const copies = g.size - 1;
    if (r.copy_group === g.group && r.copies === copies && r.same_seller === g.sameSeller) continue;
    changed++;
    const { error: uErr } = await db()
      .from("store_items")
      .update({ copy_group: g.group, copies, same_seller: g.sameSeller })
      .eq("domain", r.domain)
      .eq("handle", r.handle);
    if (uErr) throw new Error(`store_items güncellenemedi: ${uErr.message}`);
    // Ürün listesindeki kopya sayısı: aynı satıcının ağı bağımsız rakip sayılmaz.
    const { error: pErr } = await db()
      .from("products")
      .update({ copy_count: g.sameSeller ? 0 : copies })
      .eq("product_url", `https://${r.domain}/products/${r.handle}`);
    if (pErr) throw new Error(`products güncellenemedi: ${pErr.message}`);
  }
  const withCopies = [...groups.values()].filter((g) => g.group);
  return { items: withCopies.length, groups: new Set(withCopies.map((g) => g.group)).size, changed };
}

export type CopyCandidate = {
  domain: string;
  handle: string;
  title: string | null;
  image: string | null;
  so: number;
  copies: number;
  shop_name: string | null;
  first_product_at: string | null;
  total_score: number;
};

/**
 * Aday yapılacak kopya kümeleri: en az minCopies bağımsız mağazada satılan, kümesinden henüz aday çıkmamış ürünler.
 * Kümeden tek temsilci: stoğu en çok azalan, sonra puanı en yüksek mağazanınki.
 */
export async function copyCandidates(limit: number, minCopies: number): Promise<CopyCandidate[]> {
  const { data, error } = await allRows((a, b) =>
    db()
      .from("store_items")
      .select("domain, handle, title, image, so, copies, copy_group, product_id")
      .gte("copies", minCopies)
      .eq("same_seller", false)
      .order("domain")
      .order("handle")
      .range(a, b),
  );
  if (error) throw new Error(`store_items okunamadı: ${error.message}`);
  type Row = { domain: string; handle: string; title: string | null; image: string | null; so: number; copies: number; copy_group: string; product_id: string | null };
  const byGroup = new Map<string, Row[]>();
  for (const r of data as Row[]) byGroup.set(r.copy_group, [...(byGroup.get(r.copy_group) ?? []), r]);
  const open = [...byGroup.values()].filter((g) => g.every((r) => !r.product_id));
  const domains = [...new Set(open.flat().map((r) => r.domain))];
  const stores = new Map<string, { shop_name: string | null; first_product_at: string | null; total_score: number; status: string }>();
  for (let i = 0; i < domains.length; i += 200) {
    const { data: s, error: sErr } = await db()
      .from("stores")
      .select("domain, shop_name, first_product_at, total_score, status")
      .in("domain", domains.slice(i, i + 200));
    if (sErr) throw new Error(`stores okunamadı: ${sErr.message}`);
    for (const r of s ?? []) stores.set(r.domain as string, { shop_name: r.shop_name, first_product_at: r.first_product_at, total_score: Number(r.total_score ?? 0), status: r.status });
  }
  const out: CopyCandidate[] = [];
  for (const g of open) {
    const live = g.filter((r) => stores.get(r.domain)?.status === "live");
    const best = live.sort((x, y) => y.so - x.so || stores.get(y.domain)!.total_score - stores.get(x.domain)!.total_score)[0];
    if (!best) continue;
    const s = stores.get(best.domain)!;
    out.push({ domain: best.domain, handle: best.handle, title: best.title, image: best.image, so: best.so, copies: best.copies, shop_name: s.shop_name, first_product_at: s.first_product_at, total_score: s.total_score });
  }
  return out.sort((a, b) => b.copies - a.copies || b.so - a.so || b.total_score - a.total_score).slice(0, limit);
}

export async function markItemPromoted(domain: string, handle: string, productId: string): Promise<void> {
  const { error } = await db().from("store_items").update({ product_id: productId }).eq("domain", domain).eq("handle", handle);
  if (error) throw new Error(`store_items güncellenemedi: ${error.message}`);
}

/** Winner skoru için: ürün adresi (alan adı/products/handle) → ürünün kendi stok azalması ve bağımsız kopya sayısı. */
export async function itemSignals(): Promise<Map<string, { so: number; copies: number }>> {
  const { data, error } = await allRows((a, b) =>
    db().from("store_items").select("domain, handle, so, copies, same_seller").or("so.gt.0,copies.gt.0").order("domain").order("handle").range(a, b),
  );
  if (error) throw new Error(`store_items okunamadı: ${error.message}`);
  return new Map(
    (data as { domain: string; handle: string; so: number; copies: number; same_seller: boolean }[]).map((r) => [
      itemKey(r.domain, r.handle),
      { so: r.so, copies: r.same_seller ? 0 : r.copies },
    ]),
  );
}

/** "https://alanadi/products/handle?..." → "alanadi/handle" (itemSignals anahtarı). */
export function itemKeyFromUrl(url: string | null): string | null {
  const m = url?.match(/^https?:\/\/([^/]+)\/products\/([^/?#]+)/i);
  if (!m) return null;
  let handle = m[2];
  try {
    handle = decodeURIComponent(handle);
  } catch {
    // olduğu gibi kalır
  }
  return itemKey(m[1].toLowerCase(), handle);
}
