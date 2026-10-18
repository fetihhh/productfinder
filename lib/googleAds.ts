// Türkiye'de reklam veren Google reklamverenlerinin veritabanı katmanı (google_advertisers).
import { advertiserKind, nameKey, storeKeys, type AdvertiserKind, type GoogleAdvertiser } from "../dtc/googleAds.ts";
import { allRows, db } from "./db.ts";

/**
 * Haftalık özeti yazar; reklamvereni bilinen bir mağazayla adından eşleştirir (yalnızca tek mağazaya denk gelen anahtar).
 * Bu çalıştırmada listede olmayan eski satırlar silinir. Dönüş: eşleşen reklamveren sayısı.
 */
export async function saveGoogleAdvertisers(rows: GoogleAdvertiser[]): Promise<number> {
  const started = new Date().toISOString();
  const { data: stores, error } = await allRows((a, b) =>
    db().from("stores").select("domain, shop_name").in("status", ["live", "old"]).order("domain").range(a, b),
  );
  if (error) throw new Error(`stores okunamadı: ${error.message}`);
  const byKey = new Map<string, string | null>();
  for (const s of stores as { domain: string; shop_name: string | null }[]) {
    for (const k of storeKeys(s.domain, s.shop_name)) byKey.set(k, byKey.has(k) && byKey.get(k) !== s.domain ? null : s.domain);
  }
  let matched = 0;
  const out = rows.map((r) => {
    const key = nameKey(r.name) ?? nameKey(r.legal_name);
    const domain = key ? (byKey.get(key) ?? null) : null;
    if (domain) matched++;
    return { ...r, domain, kind: advertiserKind(r), updated_at: started };
  });
  for (let i = 0; i < out.length; i += 500) {
    const { error: uErr } = await db().from("google_advertisers").upsert(out.slice(i, i + 500), { onConflict: "advertiser_id" });
    if (uErr) throw new Error(`google_advertisers yazılamadı: ${uErr.message}`);
  }
  if (out.length) {
    const { error: dErr } = await db().from("google_advertisers").delete().lt("updated_at", started);
    if (dErr) throw new Error(`google_advertisers temizlenemedi: ${dErr.message}`);
  }
  return matched;
}

export type GoogleAdvertiserRow = GoogleAdvertiser & { domain: string | null; kind: AdvertiserKind | null; updated_at: string };

/** smallOnly: yalnızca ürün satan küçük/orta e-ticaret reklamverenleri (büyük şirket, ajans ve hizmet sektörü hariç). */
export async function listGoogleAdvertisers(opts: { trOnly: boolean; matchedOnly: boolean; smallOnly: boolean; q: string; limit: number }): Promise<GoogleAdvertiserRow[]> {
  let q = db().from("google_advertisers").select("*");
  if (opts.trOnly) q = q.eq("location", "TR");
  if (opts.smallOnly) q = q.eq("kind", "kucuk");
  if (opts.matchedOnly) q = q.not("domain", "is", null);
  const term = opts.q.replace(/[%_*,()\\"']/g, " ").trim();
  if (term) q = q.or(`name.ilike.*${term}*,legal_name.ilike.*${term}*,domain.ilike.*${term}*`);
  const { data, error } = await q.order("new_30d", { ascending: false }).order("active_7d", { ascending: false }).limit(opts.limit);
  if (error) throw new Error(`google_advertisers okunamadı: ${error.message}`);
  return data as GoogleAdvertiserRow[];
}
