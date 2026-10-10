// Günlük işin "yeni mağaza" adımları: keşif → kontrol → kopyalanan ürünler → aday ürün, ve markaların yaşı.
import {
  COPY_HASH_PER_RUN,
  COPY_MIN_STORE_SCORE,
  DNS_CONCURRENCY,
  IMAGE_MATCH_MAX,
  NRD_BOOTSTRAP_PER_RUN,
  STORE_CHECK_CONCURRENCY,
  STORE_CHECKS_PER_RUN,
  STORE_PROMOTE_MIN_SCORE,
  STORE_PROMOTE_PER_RUN,
} from "../config/limits.ts";
import { hashToHex } from "../dtc/copies.ts";
import { imageHasher } from "../dtc/imageHash.ts";
import { registrationDate } from "../dtc/rdap.ts";
import { parseStoreProducts, probeStore } from "../dtc/storeProbe.ts";
import { saveHeroHash, storesToHash, updateCopies } from "../lib/copies.ts";
import { registrableDomain } from "../lib/domain.ts";
import { politeFetch, politeFetchBytes } from "../lib/http.ts";
import { findShopifyDomains, NRD60_MAX_BYTES, NRD60_URL, parseDomainList, whoisdsUrl } from "../lib/nrd.ts";
import { saveCandidate } from "../lib/repo.ts";
import {
  brandsWithoutAge,
  getJobState,
  insertStores,
  markStorePromoted,
  saveBrandAge,
  saveStoreCheck,
  setJobState,
  storesToCheck,
  storesToPromote,
} from "../lib/stores.ts";
import { unzipFirst } from "../lib/tranco.ts";

const isoDay = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);
const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(0);

/** Yeni kayıtlı alan adlarından Shopify mağazalarını bulur (son 3 günün WhoisDS listesi + ilk kurulumda son 60 gün). */
export async function discoverStores(): Promise<boolean> {
  console.log("\n▶ Yeni mağaza keşfi (yeni kayıtlı alan adları → DNS → Shopify)");
  let ok = true;
  const done = (await getJobState<string[]>("whoisds_days")) ?? [];
  for (const day of [2, 1, 0].map((n) => isoDay(n * 86_400_000)).filter((d) => !done.includes(d))) {
    const res = await politeFetchBytes(whoisdsUrl(day), 30_000_000);
    if (!res.ok) {
      console.log(`  ${day}: liste henüz yok (${res.reason})`);
      continue;
    }
    try {
      const domains = parseDomainList(unzipFirst(res.bytes).data.toString("utf8"));
      const t0 = Date.now();
      const hits = await findShopifyDomains(domains, DNS_CONCURRENCY);
      const added = await insertStores(hits, "whoisds", day);
      console.log(`  ${day}: ${domains.length} alan adı → ${hits.length} Shopify mağazası, ${added} yeni (${secs(t0)} sn)`);
      done.push(day);
    } catch (err) {
      // Liste yerine HTML dönmüş olabilir (gün henüz yayımlanmadı); ertesi gün yeniden denenir.
      console.log(`  ${day}: liste okunamadı (${(err as Error).message})`);
    }
  }
  await setJobState("whoisds_days", done.slice(-30));

  const boot = (await getJobState<{ offset: number; done: boolean }>("nrd60")) ?? { offset: 0, done: false };
  if (!boot.done) {
    const res = await politeFetchBytes(NRD60_URL, NRD60_MAX_BYTES);
    if (!res.ok) {
      console.error(`  ✖ 60 günlük liste indirilemedi: ${res.reason}`);
      return false;
    }
    try {
      const all = parseDomainList(Buffer.from(res.bytes).toString("utf8"));
      const chunk = all.slice(boot.offset, boot.offset + NRD_BOOTSTRAP_PER_RUN);
      const t0 = Date.now();
      const hits = await findShopifyDomains(chunk, DNS_CONCURRENCY);
      const added = await insertStores(hits, "nrd60", null);
      const offset = boot.offset + chunk.length;
      await setJobState("nrd60", { offset, done: offset >= all.length, total: all.length });
      console.log(`  son 60 gün: ${boot.offset}–${offset} / ${all.length} → ${hits.length} Shopify mağazası, ${added} yeni (${secs(t0)} sn)`);
    } catch (err) {
      ok = false;
      console.error(`  ✖ ${(err as Error).message}`);
    }
  }
  return ok;
}

/** Zamanı gelen mağazaları kontrol eder (farklı alan adları paralel; her alan adına 1 istek/sn). */
export async function checkStores(): Promise<boolean> {
  const list = await storesToCheck(STORE_CHECKS_PER_RUN);
  console.log(`\n▶ Mağaza kontrolü: ${list.length} mağaza`);
  const counts: Record<string, number> = {};
  let failures = 0;
  let next = 0;
  // Devre kesici: Shopify aynı IP'den çok istek gelince tüm mağazalar için 429 döner. Art arda bu kadar kısıtlama
  // gelirse kontroller durdurulur, kalan mağazalar ertesi güne kalır (siteleri zorlamamak ve yanlış "kapandı" dememek için).
  const THROTTLE_LIMIT = 25;
  let throttled = 0;
  let tripped = false;
  const t0 = Date.now();
  const worker = async () => {
    while (next < list.length && !tripped) {
      const s = list[next++];
      try {
        const probe = await probeStore(s.domain, politeFetch);
        if (probe.state === "error" && /429|robots\.txt geçici/.test(probe.why)) {
          if (++throttled >= THROTTLE_LIMIT) tripped = true;
        } else if (probe.state !== "error") throttled = 0;
        const { status, score } = await saveStoreCheck(s, probe);
        counts[status] = (counts[status] ?? 0) + 1;
        if (probe.state === "live" && score >= STORE_PROMOTE_MIN_SCORE) {
          console.log(`  ★ ${s.domain} — ${probe.productCount} ürün, puan ${score}: ${probe.hero?.title ?? "?"} (${probe.hero?.price ?? "?"} ${probe.currency ?? ""})`);
        }
      } catch (err) {
        failures++;
        if (failures <= 5) console.error(`  ! ${s.domain}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: STORE_CHECK_CONCURRENCY }, worker));
  console.log(`  durum: ${JSON.stringify(counts)}${failures ? `, hata ${failures}` : ""} (${secs(t0)} sn)`);
  if (tripped) console.log(`  ! Shopify art arda ${THROTTLE_LIMIT} kez "çok fazla istek" (429) döndü: kontroller durduruldu, ${list.length - next} mağaza yarına kaldı`);
  return failures < Math.max(10, list.length * 0.2);
}

/**
 * Kopyalanan ürünler: puanı ≥ 35 olan açık mağazaların öne çıkan ürün görselini özetler (yalnızca yeni ya da
 * değişmiş olanlar), sonra tüm mağazaları aynı fotoğraf / aynı AliExpress görseli üzerinden kümeler.
 */
export async function copyClusters(): Promise<boolean> {
  try {
    const list = await storesToHash(COPY_HASH_PER_RUN, COPY_MIN_STORE_SCORE);
    console.log(`\n▶ Kopyalanan ürünler: ${list.length} mağazanın öne çıkan ürün görseli özetlenecek`);
    const hash = imageHasher((url) => politeFetchBytes(url, 5_000_000, "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5"));
    const t0 = Date.now();
    let failed = 0;
    for (const s of list) {
      const h = await hash(s.hero_image);
      if (h === null) failed++;
      await saveHeroHash(s.domain, s.hero_image, h === null ? null : hashToHex(h));
    }
    const r = await updateCopies(IMAGE_MATCH_MAX);
    console.log(
      `  ${list.length - failed} görsel özetlendi${failed ? `, ${failed} okunamadı` : ""} (${secs(t0)} sn) · ` +
        `${r.groups} ürün birden çok mağazada (${r.stores} mağaza), ${r.changed} mağaza güncellendi`,
    );
    return true;
  } catch (err) {
    console.error(`  ✖ ${(err as Error).message}`);
    return false;
  }
}

/** Puanı yüksek yeni mağazaların öne çıkan ürününü aday olarak ekler (doğrulama ve toptancı araması bunlarla devam eder). */
export async function promoteStores(): Promise<boolean> {
  const list = await storesToPromote(STORE_PROMOTE_PER_RUN, STORE_PROMOTE_MIN_SCORE);
  console.log(`\n▶ Yeni mağazalardan aday: ${list.length}`);
  let ok = true;
  for (const s of list) {
    try {
      const { productId } = await saveCandidate({
        source: "yenimagaza",
        sourceItemId: s.domain,
        sourceUrl: `https://${s.domain}/`,
        title: s.shop_name ?? s.domain,
        productName: s.hero_title,
        brandDomain: registrableDomain(`https://${s.domain}/`) ?? s.domain,
        productUrl: `https://${s.domain}/products/${s.hero_handle}`,
        imageUrl: s.hero_image,
        category: null,
        postedAt: new Date(s.first_product_at ?? Date.now()),
        engagement: 0,
        comments: 0,
        marketplaceLinks: [],
      });
      await markStorePromoted(s.domain, productId);
      console.log(`  + ${s.hero_title}  [${s.domain}] puan ${s.store_score}`);
    } catch (err) {
      ok = false;
      console.error(`  ! ${s.domain}: ${(err as Error).message}`);
    }
  }
  return ok;
}

/** Markaların yaşı: RDAP kayıt tarihi + Shopify'daki ilk ürünün tarihi. */
export async function brandAges(limit = 80): Promise<boolean> {
  const list = await brandsWithoutAge(limit);
  console.log(`\n▶ Marka yaşı: ${list.length} marka`);
  let ok = true;
  for (const b of list) {
    try {
      const registered = await registrationDate(b.domain, politeFetch);
      let first: string | null = null;
      if (b.platform === "shopify" || b.platform === null) {
        const res = await politeFetch(`https://${b.domain}/products.json?limit=250`, "application/json");
        const products = res.ok ? parseStoreProducts(res.text) : null;
        first = products?.map((p) => p.createdAt).filter((d): d is string => Boolean(d)).sort()[0] ?? null;
      }
      await saveBrandAge(b.domain, registered, first);
    } catch (err) {
      ok = false;
      console.error(`  ! ${b.domain}: ${(err as Error).message}`);
    }
  }
  return ok;
}
