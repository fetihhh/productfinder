// Ürün etiket gönderilerinin veritabanı katmanı.
import type { TagPost } from "../dtc/hashtags.ts";
import { db } from "./db.ts";

const DAY = 86_400_000;
export const TAG_RECHECK_DAYS = 21;

export type TagTarget = { id: string; name: string; brand_domain: string };

/** Önce takip edilenler, sonra reklamı tutan (kanıtlanmış/ölçeklenen) ve doğrulanmış ürünler; 21 günde bir. */
export async function productsForTags(limit: number): Promise<TagTarget[]> {
  const stale = new Date(Date.now() - TAG_RECHECK_DAYS * DAY).toISOString();
  const due = `ig_tag_checked_at.is.null,ig_tag_checked_at.lt.${stale}`;
  const cols = "id, name, brand_domain";
  const [tracked, advertised, verified] = await Promise.all([
    db().from("products").select(`${cols}, tracking!inner(status)`).in("tracking.status", ["favorite", "review"]).or(due).limit(limit),
    db().from("ad_signals").select("domain").in("ad_stage", ["proven", "scaling"]).order("ad_score", { ascending: false }).limit(200),
    db().from("products").select(cols).eq("dtc_status", "verified").or(due).order("winner_score", { ascending: false }).limit(limit * 3),
  ]);
  if (verified.error) throw new Error(`products okunamadı: ${verified.error.message}`);
  const adDomains = new Set((advertised.data ?? []).map((a) => a.domain as string));
  const { data: adProducts } = adDomains.size
    ? await db().from("products").select(cols).in("brand_domain", [...adDomains]).or(due).limit(limit * 3)
    : { data: [] };
  const rows = [...((tracked.data ?? []) as TagTarget[]), ...((adProducts ?? []) as TagTarget[]), ...(verified.data as TagTarget[])];
  const seen = new Set<string>();
  const picked = rows.filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, limit);
  const { data: tr } = picked.length
    ? await db().from("translations").select("text, translated, source_lang").in("text", picked.map((p) => p.name.trim()))
    : { data: [] };
  const en = new Map(((tr ?? []) as { text: string; translated: string; source_lang: string }[]).filter((t) => !t.source_lang.includes(">")).map((t) => [t.text, t.translated]));
  return picked.map(({ id, name, brand_domain }) => ({ id, name: en.get(name.trim()) ?? name, brand_domain }));
}

export async function saveTagPosts(id: string, tags: string[], posts: TagPost[]): Promise<void> {
  const { error } = await db().from("products").update({ ig_tags: tags, ig_tag_posts: posts, ig_tag_checked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`products güncellenemedi: ${error.message}`);
}

export type HashtagState = { status: "ok" | "no_permission" | "no_account" | "limit"; reason?: string; at: string };
