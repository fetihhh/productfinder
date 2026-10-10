// Günlük işin "Instagram" adımı: mağazaların Instagram hesaplarındaki çok tutan gönderiler (resmi Business Discovery API).
import { GRAPH_API_VERSION, IG_CHECKS_PER_RUN } from "../config/limits.ts";
import { instagramClient, instagramHandle, rankPosts } from "../dtc/instagram.ts";
import { politeFetch } from "../lib/http.ts";
import { igTargets, saveIgAccount, saveIgError, setStoreInstagram, storesWithoutInstagram, type InstagramState } from "../lib/instagram.ts";
import { setJobState } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Instagram hesabı bilinmeyen mağazaların ana sayfasına bir kez bakılır (alan adı başına 1 istek, robots.txt'ye uyulur).
 * Normalde hesap mağaza kontrolünde bulunur; bu adım "instagram" modunda bekleyenleri hemen doldurur.
 * Shopify art arda 429 dönerse (IP kısıtlaması) durur.
 */
export async function findInstagramHandles(limit = 200, minScore = 50): Promise<void> {
  console.log("\n▶ Mağazaların Instagram hesapları (ana sayfa)");
  const domains = await storesWithoutInstagram(limit, minScore);
  console.log(`  ${domains.length} mağaza`);
  let found = 0;
  let throttled = 0;
  let errors = 0;
  for (const d of domains) {
    const r = await politeFetch(`https://${d}/`);
    if (!r.ok) {
      errors++;
      throttled = r.reason.includes("429") ? throttled + 1 : 0;
      if (throttled >= 10) {
        console.error("  ✖ Art arda 429: durduruldu (bir sonraki çalıştırmada devam eder)");
        break;
      }
      continue;
    }
    throttled = 0;
    const h = instagramHandle(r.text);
    await setStoreInstagram(d, h ?? "");
    if (h) found++;
  }
  console.log(`  özet: ${found} mağazada Instagram hesabı bulundu${errors ? `, ${errors} sayfa okunamadı` : ""}`);
}

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
  if (stopped) {
    console.error(`  ✖ Durduruldu: ${stopped}`);
    const granted = await ig.permissions();
    const need = ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"];
    console.error(`  anahtarın izinleri: ${granted.join(", ") || "okunamadı"}`);
    const missing = need.filter((p) => !granted.includes(p));
    if (missing.length) console.error(`  eksik izin: ${missing.join(", ")}`);
  }
  console.log(`  özet: ${checked} hesap okundu, ${found} tanesinde çok tutan gönderi var`);
  await setJobState("instagram", { status: stopped ? "stopped" : "ok", reason: stopped ?? undefined, checked, found, at } satisfies InstagramState);
  return true;
}
