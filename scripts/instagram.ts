// Günlük işin "Instagram" adımı: mağazaların Instagram hesaplarındaki çok tutan gönderiler (resmi Business Discovery API).
import { GRAPH_API_VERSION, IG_CHECKS_PER_RUN } from "../config/limits.ts";
import { instagramClient, rankPosts } from "../dtc/instagram.ts";
import { igTargets, saveIgAccount, saveIgError, type InstagramState } from "../lib/instagram.ts";
import { setJobState } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** İsteğe bağlı adım: izin ya da hesap yoksa atlanır ve işi başarısız saymaz. */
export async function instagramPosts(): Promise<boolean> {
  console.log("\n▶ Instagram (çok tutan gönderiler)");
  const at = new Date().toISOString();
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    console.log("  ! META_ACCESS_TOKEN yok: atlandı");
    await setJobState("instagram", { status: "no_token", at } satisfies InstagramState);
    return true;
  }
  const ig = instagramClient(token, GRAPH_API_VERSION);
  let igUserId = process.env.IG_USER_ID || null;
  if (!igUserId) {
    const own = await ig.ownAccountId();
    if (!own.ok) {
      console.log(`  ! Instagram izni yok, atlandı (README → Instagram): ${own.reason}`);
      await setJobState("instagram", { status: "no_permission", reason: own.reason, at } satisfies InstagramState);
      return true;
    }
    if (!own.data) {
      console.log("  ! Anahtarın sayfalarına bağlı Instagram profesyonel hesabı yok, atlandı (README → Instagram)");
      await setJobState("instagram", { status: "no_account", at } satisfies InstagramState);
      return true;
    }
    igUserId = own.data.id;
  }

  const targets = await igTargets(IG_CHECKS_PER_RUN);
  console.log(`  ${targets.length} hesap okunacak`);
  let checked = 0;
  let found = 0;
  let stopped: string | null = null;
  for (const t of targets) {
    if (checked > 0) await sleep(1000); // graph.facebook.com: saniyede en fazla 1 istek
    const r = await ig.discover(igUserId, t.username);
    checked++;
    if (!r.ok) {
      if (r.fatal) {
        stopped = r.reason;
        break;
      }
      await saveIgError(t, r.reason);
      continue;
    }
    const { posts, medianEngagement } = rankPosts(r.data.media?.data ?? []);
    await saveIgAccount(t, r.data, posts, medianEngagement);
    const hits = posts.filter((p) => p.outlier >= 2);
    if (hits.length) {
      found++;
      const best = hits[0];
      console.log(`  📸 @${t.username} (${t.domain}) — ${hits.length} çok tutan gönderi · en iyisi ${best.like_count ?? "?"} beğeni, ${best.comments_count ?? 0} yorum (${best.outlier}×)`);
    }
  }
  if (stopped) console.error(`  ✖ Durduruldu: ${stopped}`);
  console.log(`  özet: ${checked} hesap okundu, ${found} tanesinde çok tutan gönderi var`);
  await setJobState("instagram", { status: stopped ? "stopped" : "ok", reason: stopped ?? undefined, checked, found, at } satisfies InstagramState);
  return true;
}
