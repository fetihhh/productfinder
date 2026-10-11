// Günlük işin "ürünün Instagram gönderileri" adımı: ürün adından etiketler, resmi Hashtag Search API'siyle en popüler
// gönderiler. Instagram hesap başına 7 günde 30 farklı etiket sınırı: günde en fazla IG_TAGS_PER_DAY etiket.
import { GRAPH_API_VERSION } from "../config/limits.ts";
import { productHashtags, productWords, rankTagPosts, type TagPost } from "../dtc/hashtags.ts";
import { instagramClient } from "../dtc/instagram.ts";
import { productsForTags, saveTagPosts, type HashtagState } from "../lib/hashtags.ts";
import { tryConsumeQuota } from "../lib/repo.ts";
import { setJobState } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const IG_TAGS_PER_DAY = Number(process.env.IG_TAGS_PER_DAY) || 4;

const brandWords = (domain: string) => {
  const label = domain.split(".")[0].toLowerCase();
  return [label, label.replace(/^(get|try|shop|the|my)/, ""), label.replace(/(shop|store|official)$/, "")];
};

export async function productTagPosts(tagsPerDay = IG_TAGS_PER_DAY): Promise<void> {
  console.log("\n▶ Ürünlerin Instagram'da tutan gönderileri (Hashtag Search)");
  const at = new Date().toISOString();
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.log("  ! META_ACCESS_TOKEN yok: atlandı");
    return;
  }
  const ig = instagramClient(token, GRAPH_API_VERSION);
  let igUserId = process.env.IG_USER_ID || null;
  if (!igUserId) {
    const own = await ig.ownAccountId();
    igUserId = own.ok && own.data ? own.data.id : null;
  }
  if (!igUserId) {
    await setJobState("ig_hashtags", { status: "no_account", at } satisfies HashtagState);
    console.log("  ! Instagram profesyonel hesabı yok: atlandı");
    return;
  }
  const targets = await productsForTags(tagsPerDay);
  let used = 0;
  let saved = 0;
  for (const p of targets) {
    const tags = productHashtags(p.name, brandWords(p.brand_domain));
    if (tags.length === 0) {
      await saveTagPosts(p.id, [], []);
      continue;
    }
    const posts: TagPost[] = [];
    let failed = 0;
    for (const tag of tags) {
      if (used >= tagsPerDay || !(await tryConsumeQuota("ig_hashtags", tagsPerDay, 120))) break;
      used++;
      const h = await ig.hashtagId(igUserId, tag);
      if (!h.ok) {
        const perm = /permission|public content|10\)|\(#200\)|Yetki/i.test(h.reason);
        console.log(`  ✖ #${tag}: ${h.reason}`);
        await setJobState("ig_hashtags", { status: perm ? "no_permission" : "limit", reason: h.reason.slice(0, 300), at } satisfies HashtagState);
        console.log(`  özet: ${saved} ürün kaydedildi`);
        return;
      }
      if (!h.data) continue;
      await sleep(1000);
      const m = await ig.topMedia(h.data, igUserId);
      if (!m.ok) {
        failed++;
        console.log(`  ✖ #${tag} gönderileri: ${m.reason}`);
        continue;
      }
      posts.push(...rankTagPosts(tag, m.data, 12, productWords(p.name, brandWords(p.brand_domain))));
      await sleep(1000);
    }
    if (posts.length === 0 && failed > 0) {
      console.log(`  · ${p.name.slice(0, 50)}: gönderiler alınamadı, yarın yeniden denenecek`);
      if (used >= tagsPerDay) break;
      continue;
    }
    const ranked = posts.sort((a, b) => Number(b.media_type === "VIDEO") - Number(a.media_type === "VIDEO") || b.engagement - a.engagement).slice(0, 12);
    await saveTagPosts(p.id, tags, ranked);
    saved++;
    console.log(`  #${tags.join(" #")} — ${p.name.slice(0, 50)}: ${ranked.length} gönderi (${ranked.filter((x) => x.media_type === "VIDEO").length} video)`);
    if (used >= tagsPerDay) break;
  }
  await setJobState("ig_hashtags", { status: "ok", at } satisfies HashtagState);
  console.log(`  özet: ${saved} ürün, ${used} etiket arandı`);
}
