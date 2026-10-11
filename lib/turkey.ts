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
