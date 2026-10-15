// Günlük işin "yeni mağaza" adımları: keşif → kontrol → kopyalanan ürünler → aday ürün, ve markaların yaşı.
import {
  COPY_HASH_PER_RUN,
  COPY_MIN_STORE_SCORE,
  DNS_CONCURRENCY,
  IMAGE_MATCH_MAX,
  MOVER_MIN_STOCK_DROPS,
  MOVER_STORES_PER_RUN,
  NRD_BOOTSTRAP_PER_RUN,
  STORE_CHECK_CONCURRENCY,
  STORE_CHECKS_PER_RUN,
  STORE_PROMOTE_MIN_SCORE,
  STORE_PROMOTE_PER_RUN,
} from "../config/limits.ts";
import { hashToHex } from "../dtc/copies.ts";
import { movementOrder } from "../dtc/storeSnapshot.ts";
import { imageHasher } from "../dtc/imageHash.ts";
import { registrationDate } from "../dtc/rdap.ts";
import { parseStoreProducts, probeStore } from "../dtc/storeProbe.ts";
import { saveHeroHash, storesToHash, updateCopies } from "../lib/copies.ts";
import { registrableDomain } from "../lib/domain.ts";
import { politeFetch, politeFetchBytes } from "../lib/http.ts";
import { findStoreDomains, NRD60_MAX_BYTES, NRD60_URL, parseDomainList, whoisdsUrl, type StorePlatform } from "../lib/nrd.ts";
import { probeTrStore } from "../dtc/trPlatform.ts";
import { saveCandidate } from "../lib/repo.ts";
import {
  brandsWithoutAge,
  getJobState,
  insertStores,
  markStorePromoted,
  saveBrandAge,
  saveStoreCheck,
  setJobState,
  setBrandCountry,
  storesForDetail,
  storesToCheck,
  storesToPromote,
  storesWithMovers,
} from "../lib/stores.ts";
import { unzipFirst } from "../lib/tranco.ts";

const isoDay = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(0);

/** Yeni kayıtlı alan adlarından Shopify mağazalarını bulur (son 3 günün WhoisDS listesi + ilk kurulumda son 60 gün). */
/** Bulunan mağazaları altyapısıyla ekler (Shopify, ikas, Ticimax). */
async function insertByPlatform(found: { domain: string; platform: StorePlatform }[], source: string, day: string | null): Promise<number> {
  let added = 0;
  for (const p of ["shopify", "ikas", "ticimax"] as const) {
    const ds = found.filter((f) => f.platform === p).map((f) => f.domain);
    if (ds.length) added += await insertStores(ds, source, day, p);
  }
  return added;
}

const platformSummary = (found: { platform: StorePlatform }[]) => {
  const n = (p: StorePlatform) => found.filter((f) => f.platform === p).length;
  return `${n("shopify")} Shopify${n("ikas") ? `, ${n("ikas")} ikas` : ""}${n("ticimax") ? `, ${n("ticimax")} Ticimax` : ""} mağazası`;
};

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
      const found = await findStoreDomains(domains, DNS_CONCURRENCY);
      const added = await insertByPlatform(found, "whoisds", day);
      console.log(`  ${day}: ${domains.length} alan adı → ${platformSummary(found)}, ${added} yeni (${secs(t0)} sn)`);
      done.push(day);
    } catch (err) {
      // Liste yerine HTML dönmüş olabilir (gün henüz yayımlanmadı); ertesi gün yeniden denenir.
      console.log(`  ${day}: liste okunamadı (${(err as Error).message})`);
    }
  }
  await setJobState("whoisds_days", done.slice(-30));

  const boot = (await getJobState<{ offset: number; done: boolean }>("nrd60")) ?? { offset: 0, done: false };
  // Yeniden tarama: eski DNS ayarı eşzamanlı sorgularda zaman aşımına düşüp mağazaları sessizce kaçırıyordu ve Türk
  // altyapıları (ikas, Ticimax) yoktu. Listenin tamamı düzeltilmiş DNS ile bir kez daha taranır (çalıştırma başına
  // RESCAN_PER_RUN alan adı; bilinen mağazalar tekrar eklenmez).
  const RESCAN_PER_RUN = 500_000;
  const tr = (await getJobState<{ offset: number; total?: number }>("nrd60_rescan")) ?? { offset: 0 };
  const rescanPending = tr.total === undefined || tr.offset < tr.total;
  if (!boot.done || rescanPending) {
    const res = await politeFetchBytes(NRD60_URL, NRD60_MAX_BYTES);
    if (!res.ok) {
      console.error(`  ✖ 60 günlük liste indirilemedi: ${res.reason}`);
      return false;
    }
    try {
      const all = parseDomainList(Buffer.from(res.bytes).toString("utf8"));
      if (!boot.done) {
        const chunk = all.slice(boot.offset, boot.offset + NRD_BOOTSTRAP_PER_RUN);
        const t0 = Date.now();
        const found = await findStoreDomains(chunk, DNS_CONCURRENCY);
        const added = await insertByPlatform(found, "nrd60", null);
        const offset = boot.offset + chunk.length;
        await setJobState("nrd60", { offset, done: offset >= all.length, total: all.length });
        console.log(`  son 60 gün: ${boot.offset}–${offset} / ${all.length} → ${platformSummary(found)}, ${added} yeni (${secs(t0)} sn)`);
      }
      if (rescanPending && tr.offset < all.length) {
        const end = Math.min(all.length, tr.offset + RESCAN_PER_RUN);
        const t0 = Date.now();
        const found = await findStoreDomains(all.slice(tr.offset, end), DNS_CONCURRENCY);
        const added = await insertByPlatform(found, "nrd60", null);
        await setJobState("nrd60_rescan", { offset: end, total: all.length });
        console.log(`  yeniden tarama (düzeltilmiş DNS): ${tr.offset}–${end} / ${all.length} → ${platformSummary(found)}, ${added} yeni (${secs(t0)} sn)`);
      }
    } catch (err) {
      ok = false;
      console.error(`  ✖ ${(err as Error).message}`);
    }
  }
  return ok;
}

/**
 * Zamanı gelen mağazaları kontrol eder (farklı alan adları paralel; her alan adına 1 istek/sn). source: yalnızca bu
 * kaynaktakiler; "detay": aday ürünü ya da reklamı olan açık mağazalar zamanı beklemeden.
 */
/** Son mağaza kontrolü Shopify kısıtlaması yüzünden yarıda kaldı mı (çalıştırmanın sonunda ikinci tur için). */
let lastThrottled = false;
export const storeChecksThrottled = () => lastThrottled;

export async function checkStores(source?: string): Promise<boolean> {
  const list = source === "detay" ? await storesForDetail(400) : await storesToCheck(STORE_CHECKS_PER_RUN, source);
  console.log(`\n▶ Mağaza kontrolü: ${list.length} mağaza`);
  const counts: Record<string, number> = {};
  let failures = 0;
  let next = 0;
  // Kısıtlamaya uyum: Shopify aynı IP'den çok istek gelince tüm mağazalar için 429 döner. Art arda bu kadar kısıtlama
  // gelirse durulmaz; önce beklenir (90, 180 sn) ve paralellik yarıya indirilir, kısıtlanan mağaza bir kez daha denenir.
  // İki beklemeden sonra hâlâ kısıtlanıyorsa kontroller durur (siteleri zorlamamak ve yanlış "kapandı" dememek için);
  // kalanlar aynı çalıştırmanın sonunda ikinci turda, olmazsa sonraki çalıştırmada denenir.
  const THROTTLE_LIMIT = 25;
  const MAX_PAUSES = 2;
  let throttled = 0;
  let tripped = false;
  let pauses = 0;
  let pauseUntil = 0;
  let allowed = STORE_CHECK_CONCURRENCY;
  const retried = new Set<string>();
  const reasons: Record<string, number> = {};
  const t0 = Date.now();
  const worker = async (id: number) => {
    while (next < list.length && !tripped) {
      if (id >= allowed) return;
      const wait = pauseUntil - Date.now();
      if (wait > 0) {
        await sleep(wait);
        continue;
      }
      const s = list[next++];
      try {
        const probe =
          s.platform === "ikas" || s.platform === "ticimax" ? await probeTrStore(s.domain, s.platform, politeFetch) : await probeStore(s.domain, politeFetch);
        if (probe.state === "error") reasons[probe.why.slice(0, 80)] = (reasons[probe.why.slice(0, 80)] ?? 0) + 1;
        // Yalnızca gerçek "çok fazla istek" yanıtı kısıtlama sayılır; ağ hatası (kapanmış alan adı, zaman aşımı) sayılmaz.
        if (probe.state === "error" && /HTTP 429/.test(probe.why)) {
          if (++throttled >= THROTTLE_LIMIT) {
            throttled = 0;
            if (pauses >= MAX_PAUSES) tripped = true;
            else {
              pauses++;
              pauseUntil = Date.now() + 90_000 * pauses;
              allowed = Math.max(2, Math.floor(allowed / 2));
              console.log(`  ! Shopify "çok fazla istek" (429): ${90 * pauses} sn bekleniyor, paralellik ${allowed}`);
            }
          }
          // Kısıtlanan mağaza kaydedilmeden sona eklenir (bir kez); ikinci kez kısıtlanırsa normal kaydedilir.
          if (!retried.has(s.domain)) {
            retried.add(s.domain);
            list.push(s);
            continue;
          }
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
  await Promise.all(Array.from({ length: STORE_CHECK_CONCURRENCY }, (_, i) => worker(i)));
  console.log(`  durum: ${JSON.stringify(counts)}${failures ? `, hata ${failures}` : ""} (${secs(t0)} sn)`);
  if (Object.keys(reasons).length) console.log(`  hata nedenleri: ${JSON.stringify(reasons)}`);
  lastThrottled = tripped;
  if (tripped) console.log(`  ! Shopify ${MAX_PAUSES} beklemeden sonra da "çok fazla istek" (429) döndü: kontroller durduruldu, ${list.length - next} mağaza sonraki tura kaldı`);
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
        priority: Number(s.store_score),
        comments: 0,
        marketplaceLinks: [],
      });
      await markStorePromoted(s.domain, productId);
      await setBrandCountry(registrableDomain(`https://${s.domain}/`) ?? s.domain, s.country, s.currency);
      console.log(`  + ${s.hero_title}  [${s.domain}] puan ${s.store_score}${s.country === "TR" || s.currency === "TRY" ? " 🇹🇷" : ""}`);
    } catch (err) {
      ok = false;
      console.error(`  ! ${s.domain}: ${(err as Error).message}`);
    }
  }
  return ok;
}

/**
 * Mağazanın asıl satan ürünleri: öne çıkan ürün dışında stoğu en az 2 kez azalan ürünler de aday olur (mağaza başına en
 * fazla 2). Öne çıkan ürün mağazanın vitrinidir; satış hareketi gösteren ürün çoğu zaman asıl "winner"dır.
 */
export async function promoteMovers(): Promise<boolean> {
  const stores = await storesWithMovers(MOVER_STORES_PER_RUN, MOVER_MIN_STOCK_DROPS);
  let created = 0;
  let ok = true;
  for (const s of stores) {
    const movers = s.products_snapshot
      .filter((i) => i.so >= MOVER_MIN_STOCK_DROPS && i.h !== s.hero_handle)
      .sort(movementOrder)
      .slice(0, 2);
    for (const i of movers) {
      try {
        const r = await saveCandidate({
          source: "yenimagaza",
          sourceItemId: `${s.domain}/${i.h}`,
          sourceUrl: `https://${s.domain}/`,
          title: s.shop_name ?? s.domain,
          productName: i.t,
          brandDomain: registrableDomain(`https://${s.domain}/`) ?? s.domain,
          productUrl: `https://${s.domain}/products/${i.h}`,
          imageUrl: i.img,
          category: null,
          postedAt: new Date(i.c ?? Date.now()),
          engagement: i.so,
          comments: 0,
          marketplaceLinks: [],
          priority: Math.min(100, 70 + 5 * i.so),
        });
        if (r.created) {
          created++;
          console.log(`  + ${i.t}  [${s.domain}] ${i.so} kez stok azaldı`);
        }
      } catch (err) {
        ok = false;
        console.error(`  ! ${s.domain}/${i.h}: ${(err as Error).message}`);
      }
    }
  }
  console.log(`\n▶ Satış hareketi olan ürünlerden aday: ${created} yeni (${stores.length} mağaza tarandı)`);
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
