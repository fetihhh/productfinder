// Türkiye görünümünün veritabanı katmanı: hangi ürünlerin Türk pazaryerlerinde aranacağı, sonuçların kaydı, sayfa sorguları.
import type { TrListing } from "../dtc/turkey.ts";
import { db } from "./db.ts";

const DAY = 86_400_000;
export const TR_RECHECK_DAYS = 14;

export type TrTarget = { id: string; name: string; brand_domain: string };

/** Önce takip edilenler (favori/incelenecek), sonra doğrulanmış ürünler winner skoruna göre; 14 günde bir yeniden. */
export async function productsForTrCheck(limit: number): Promise<TrTarget[]> {
  const stale = new Date(Date.now() - TR_RECHECK_DAYS * DAY).toISOString();
  const cols = "id, name, brand_domain";
  const [tracked, verified] = await Promise.all([
    db().from("products").select(`${cols}, tracking!inner(status)`).in("tracking.status", ["favorite", "review"]).or(`tr_checked_at.is.null,tr_checked_at.lt.${stale}`).limit(limit),
    db()
      .from("products")
      .select(cols)
      .eq("dtc_status", "verified")
      .or(`tr_checked_at.is.null,tr_checked_at.lt.${stale}`)
      .order("winner_score", { ascending: false })
      .limit(limit),
  ]);
  if (verified.error) throw new Error(`products okunamadı: ${verified.error.message}`);
  const rows = [...((tracked.data ?? []) as TrTarget[]), ...(verified.data as TrTarget[])];
  const seen = new Set<string>();
  const picked = rows.filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, limit);
  // İngilizce olmayan adlar için kayıtlı İngilizce çeviri (Türk sitelerinde İspanyolca/Fransızca ad işe yaramaz).
  const { data: tr } = picked.length
    ? await db().from("translations").select("text, translated, source_lang").in("text", picked.map((p) => p.name.trim()))
    : { data: [] };
  const en = new Map(((tr ?? []) as { text: string; translated: string; source_lang: string }[]).filter((t) => !t.source_lang.includes(">")).map((t) => [t.text, t.translated]));
  return picked.map(({ id, name, brand_domain }) => ({ id, name: en.get(name.trim()) ?? name, brand_domain }));
}

export async function saveTrListings(id: string, listings: TrListing[]): Promise<void> {
  const { error } = await db().from("products").update({ tr_listings: listings, tr_checked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`products güncellenemedi: ${error.message}`);
}

export type TrProduct = {
  id: string;
  name: string;
  brand_domain: string;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  winner_score: number;
  tr_listings: TrListing[] | null;
  tr_checked_at: string | null;
};

/** Türkiye sayfası: Türkiye'de benzer ilanı olan ürünler ve hiç bulunmayanlar (fırsat). */
export async function trProducts(): Promise<{ sold: TrProduct[]; open: TrProduct[]; checked: number }> {
  const { data, error } = await db()
    .from("products")
    .select("id, name, brand_domain, image_url, price, currency, winner_score, tr_listings, tr_checked_at")
    .not("tr_checked_at", "is", null)
    .order("winner_score", { ascending: false })
    .limit(500);
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  const rows = (data ?? []).map((r) => ({ ...r, winner_score: Number(r.winner_score), price: r.price === null ? null : Number(r.price) })) as TrProduct[];
  return { sold: rows.filter((r) => (r.tr_listings ?? []).length > 0), open: rows.filter((r) => (r.tr_listings ?? []).length === 0), checked: rows.length };
}

export type TrStore = {
  domain: string;
  shop_name: string | null;
  hero_title: string | null;
  hero_image: string | null;
  hero_price: number | null;
  currency: string | null;
  total_score: number;
  first_product_at: string | null;
  ad_points: number;
};

/** Türk mağazaları: mağaza ülkesi Türkiye ya da para birimi TL olan açık mağazalar. */
export async function trStores(): Promise<{ stores: TrStore[]; shipsToTr: number }> {
  const [stores, ships] = await Promise.all([
    db()
      .from("stores")
      .select("domain, shop_name, hero_title, hero_image, hero_price, currency, total_score, first_product_at, ad_points")
      .eq("status", "live")
      .or("country.eq.TR,currency.eq.TRY")
      .order("total_score", { ascending: false })
      .limit(100),
    db().from("stores").select("domain", { count: "exact", head: true }).eq("status", "live").eq("ships_to_tr", true),
  ]);
  if (stores.error) throw new Error(`stores okunamadı: ${stores.error.message}`);
  return { stores: (stores.data ?? []) as TrStore[], shipsToTr: ships.count ?? 0 };
}
