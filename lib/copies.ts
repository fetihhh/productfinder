// Kopyalanan ürünlerin veritabanı katmanı: öne çıkan ürün görsellerinin özeti ve kümeler.
import { NEW_STORE_MAX_AGE_DAYS } from "../config/limits.ts";
import { clusterCopies, copyPoints, shopIdFromImage, type CopyPoint } from "../dtc/copies.ts";
import { allRows, db } from "./db.ts";

const DAY = 86_400_000;

export type StoreToHash = { domain: string; hero_image: string };

/** Özeti çıkarılmamış ya da öne çıkan ürünü değişmiş açık mağazalar (puana göre). */
export async function storesToHash(limit: number, minScore: number): Promise<StoreToHash[]> {
  const since = new Date(Date.now() - NEW_STORE_MAX_AGE_DAYS * DAY).toISOString();
  const { data, error } = await allRows((a, b) =>
    db()
      .from("stores")
      .select("domain, hero_image, hero_hash_image")
      .eq("status", "live")
      .gte("store_score", minScore)
      .gte("first_product_at", since)
      .not("hero_image", "is", null)
      .order("store_score", { ascending: false })
      .order("domain")
      .range(a, b),
  );
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  return (data as { domain: string; hero_image: string; hero_hash_image: string | null }[])
    .filter((s) => s.hero_hash_image !== s.hero_image)
    .slice(0, limit)
    .map(({ domain, hero_image }) => ({ domain, hero_image }));
}

export async function saveHeroHash(domain: string, image: string, hash: string | null): Promise<void> {
  const { error } = await db().from("stores").update({ hero_hash: hash, hero_hash_image: image }).eq("domain", domain);
  if (error) throw new Error(`stores güncellenemedi: ${error.message}`);
}

/**
 * Kümeleri yeniden hesaplar ve değişen mağazaları/ürünleri günceller. Dönüş: kopyası olan mağaza ve küme sayısı.
 * Açık ve 150 günü geçmiş ("old") mağazalar birlikte kümelenir (eski mağaza da rakiptir).
 */
export async function updateCopies(maxDistance: number): Promise<{ stores: number; groups: number; changed: number }> {
  const { data, error } = await allRows((a, b) =>
    db()
      .from("stores")
      .select("domain, hero_hash, hero_ali_id, hero_image, hero_title, hero_price, first_product_at, copy_group, copy_count, copy_same_seller, product_id")
      .in("status", ["live", "old"])
      .or("hero_hash.not.is.null,hero_ali_id.not.is.null,copy_group.not.is.null")
      .order("domain")
      .range(a, b),
  );
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  type Row = {
    domain: string;
    hero_hash: string | null;
    hero_ali_id: string | null;
    hero_image: string | null;
    hero_title: string | null;
    hero_price: number | null;
    first_product_at: string | null;
    copy_group: string | null;
    copy_count: number;
    copy_same_seller: boolean;
    product_id: string | null;
  };
  const rows = data as unknown as Row[];
  const points: CopyPoint[] = rows.map((r) => ({
    domain: r.domain,
    hash: r.hero_hash,
    aliId: r.hero_ali_id,
    firstProductAt: r.first_product_at,
    shopId: shopIdFromImage(r.hero_image),
    title: r.hero_title,
    price: r.hero_price === null ? null : Number(r.hero_price),
  }));
  const groups = clusterCopies(points, maxDistance);

  let changed = 0;
  for (const r of rows) {
    const g = groups.get(r.domain) ?? { group: null, size: 1, sameSeller: false };
    const copies = g.size - 1;
    if (r.copy_group === g.group && r.copy_count === copies && r.copy_same_seller === g.sameSeller) continue;
    changed++;
    const { error: uErr } = await db()
      .from("stores")
      // Aynı satıcının mağaza ağı bağımsız talep kanıtı değildir: kopya puanı verilmez.
      .update({ copy_group: g.group, copy_count: copies, copy_same_seller: g.sameSeller, copy_points: g.sameSeller ? 0 : copyPoints(copies) })
      .eq("domain", r.domain);
    if (uErr) throw new Error(`stores güncellenemedi: ${uErr.message}`);
    if (r.product_id) {
      const { error: pErr } = await db().from("products").update({ copy_count: copies }).eq("id", r.product_id);
      if (pErr) throw new Error(`products güncellenemedi: ${pErr.message}`);
    }
  }
  const withCopies = [...groups.values()].filter((g) => g.group);
  return { stores: withCopies.length, groups: new Set(withCopies.map((g) => g.group)).size, changed };
}
