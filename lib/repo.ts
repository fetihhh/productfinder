// Toplama işinin veritabanı yazma katmanı (yalnızca sunucu/cron).
import { REVERIFY_AFTER_DAYS } from "../config/limits.ts";
import type { VerifyResult } from "../dtc/verify.ts";
import type { Candidate, SeenItem } from "../sources/types.ts";
import { db } from "./db.ts";
import { normalizeName } from "./productName.ts";
import { trendScore, type MentionLite } from "./score.ts";

export async function filterNewItemIds(source: string, ids: string[]): Promise<Set<string>> {
  const fresh = new Set(ids);
  if (ids.length === 0) return fresh;
  const { data, error } = await db().from("seen_items").select("source_item_id").eq("source", source).in("source_item_id", ids);
  if (error) throw new Error(`seen_items okunamadı: ${error.message}`);
  for (const row of data) fresh.delete(row.source_item_id);
  return fresh;
}

export async function markSeen(source: string, items: SeenItem[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await db()
    .from("seen_items")
    .upsert(
      items.map((i) => ({ source, source_item_id: i.sourceItemId, outcome: i.outcome })),
      { onConflict: "source,source_item_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`seen_items yazılamadı: ${error.message}`);
}

/** Aynı markada aynı ürün sayfasına işaret eden kayıt varsa onu kullanır (farklı blog başlıklarını birleştirir). */
async function findByProductUrl(brandDomain: string, productUrl: string): Promise<string | null> {
  if (new URL(productUrl).pathname.length <= 1) return null;
  const { data, error } = await db()
    .from("products")
    .select("id")
    .eq("brand_domain", brandDomain)
    .eq("product_url", productUrl)
    .limit(1);
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  return data[0]?.id ?? null;
}

export async function saveCandidate(c: Candidate): Promise<{ productId: string; created: boolean }> {
  const { error: brandErr } = await db().from("brands").upsert({ domain: c.brandDomain }, { onConflict: "domain", ignoreDuplicates: true });
  if (brandErr) throw new Error(`brands yazılamadı: ${brandErr.message}`);

  const now = new Date().toISOString();
  const marketplaceEvidence =
    c.marketplaceLinks.length > 0
      ? {
          dtc_status: "rejected_marketplace",
          dtc_reason: `Kaynak yazı ürünü pazaryerinde gösteriyor: ${c.marketplaceLinks[0]}`,
          dtc_checked_at: now,
        }
      : {};

  let productId = await findByProductUrl(c.brandDomain, c.productUrl);
  const created = productId === null;
  if (productId) {
    const { error } = await db()
      .from("products")
      .update({ last_seen_at: now, ...marketplaceEvidence })
      .eq("id", productId);
    if (error) throw new Error(`products güncellenemedi: ${error.message}`);
  } else {
    const { data, error } = await db()
      .from("products")
      .upsert(
        {
          brand_domain: c.brandDomain,
          name: c.productName,
          normalized_name: normalizeName(c.productName),
          product_url: c.productUrl,
          image_url: c.imageUrl,
          category: c.category,
          last_seen_at: now,
          ...marketplaceEvidence,
        },
        { onConflict: "brand_domain,normalized_name" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`products yazılamadı: ${error.message}`);
    productId = data.id as string;
  }

  const { error: mentionErr } = await db().from("mentions").upsert(
    {
      product_id: productId,
      source: c.source,
      source_item_id: c.sourceItemId,
      url: c.sourceUrl,
      title: c.title,
      engagement: c.engagement,
      comments: c.comments,
      posted_at: c.postedAt.toISOString(),
    },
    { onConflict: "source,source_item_id", ignoreDuplicates: true },
  );
  if (mentionErr) throw new Error(`mentions yazılamadı: ${mentionErr.message}`);

  return { productId: productId!, created };
}

export type ProductToVerify = { id: string; name: string; brand_domain: string; product_url: string | null };

/** Hiç kontrol edilmemiş (veya geçici hatayla kalmış) ürünler + süresi dolan "verified" ürünler. */
export async function productsToVerify(limit: number): Promise<ProductToVerify[]> {
  const stale = new Date(Date.now() - REVERIFY_AFTER_DAYS * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("products")
    .select("id, name, brand_domain, product_url")
    .or(`dtc_checked_at.is.null,and(dtc_status.eq.verified,dtc_checked_at.lt.${stale})`)
    .order("dtc_checked_at", { ascending: true, nullsFirst: true })
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  return data as ProductToVerify[];
}

export async function saveVerification(p: ProductToVerify, r: VerifyResult): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    dtc_status: r.status,
    dtc_reason: r.reason,
    // Geçici sonuçlarda (kota, ağ hatası) tarih boş kalır → sonraki çalıştırmada yeniden denenir.
    dtc_checked_at: r.retryable ? null : now,
  };
  if (r.name && r.name.length >= 3 && r.name.length <= 150) update.name = r.name;
  if (r.productUrl) update.product_url = r.productUrl;
  if (r.imageUrl && /^https?:\/\//.test(r.imageUrl)) update.image_url = r.imageUrl;
  else if (r.imageUrl?.startsWith("//")) update.image_url = `https:${r.imageUrl}`;

  const { error } = await db().from("products").update(update).eq("id", p.id);
  if (error) throw new Error(`products güncellenemedi: ${error.message}`);

  if (r.platform) {
    const { error: brandErr } = await db()
      .from("brands")
      .update({ platform: r.platform, has_checkout: r.hasCheckout, check_reason: r.reason, checked_at: now })
      .eq("domain", p.brand_domain);
    if (brandErr) throw new Error(`brands güncellenemedi: ${brandErr.message}`);
  }
}

/** Atomik kota sayacı: limit aşılacaksa false döner ve sayaç artmaz. */
export async function tryConsumeQuota(provider: string, daily: number, monthly: number): Promise<boolean> {
  const { data, error } = await db().rpc("try_consume_api_quota", {
    p_provider: provider,
    p_daily_limit: daily,
    p_monthly_limit: monthly,
  });
  if (error) throw new Error(`kota okunamadı: ${error.message}`);
  return data === true;
}

/** Tüm ürünlerin trend skorunu bahsedilmelerden yeniden hesaplar; yalnızca değişenleri yazar. */
export async function updateTrendScores(): Promise<{ updated: number; total: number }> {
  const { data, error } = await db().from("products").select("id, trend_score, mentions(source, posted_at)");
  if (error) throw new Error(`products okunamadı: ${error.message}`);
  let updated = 0;
  for (const p of data as { id: string; trend_score: number; mentions: MentionLite[] }[]) {
    const { score, breakdown } = trendScore(p.mentions);
    const { error: upErr } = await db().from("products").update({ trend_score: score, score_breakdown: breakdown }).eq("id", p.id);
    if (upErr) throw new Error(`skor yazılamadı: ${upErr.message}`);
    if (Number(p.trend_score) !== score) updated++;
  }
  return { updated, total: data.length };
}
