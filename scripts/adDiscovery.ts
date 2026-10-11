// Günlük işin "reklamdan keşif" adımı: Meta Reklam Kütüphanesi'nde yayındaki reklamlarda ifade aranır, reklamlardaki
// site adresleri yeni mağaza olarak eklenir (kaynak "reklam"). Eklenen mağazalar aynı çalıştırmada kontrol edilir; açık ve
// yeni olanların reklamları reklam sinyali adımında analiz edilir.
import { AD_DISCOVERY_DAYS, AD_DISCOVERY_TERMS, AD_DISCOVERY_TERMS_PER_RUN } from "../config/adDiscovery.ts";
import { AD_COUNTRIES, GRAPH_API_VERSION } from "../config/limits.ts";
import { discoverySearchUrl, domainsFromAds, type DiscoveredStore } from "../dtc/adDiscovery.ts";
import { classifyGraphError, type ArchivedAd } from "../dtc/adLibrary.ts";
import { db } from "../lib/db.ts";
import { getJobState, insertStores, setJobState } from "../lib/stores.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AdDiscoveryState = { cursor: number; at: string; terms?: number; domains?: number; inserted?: number; reason?: string };

/** İsteğe bağlı adım: anahtar yoksa ya da API reddederse atlanır, işi başarısız saymaz. */
export async function discoverFromAds(): Promise<void> {
  console.log("\n▶ Reklamdan mağaza keşfi (Meta Reklam Kütüphanesi)");
  const token = process.env.META_ACCESS_TOKEN;
  const at = new Date().toISOString();
  const prev = await getJobState<AdDiscoveryState>("ad_discovery");
  const cursor = prev?.cursor ?? 0;
  if (!token) {
    console.log("  ! META_ACCESS_TOKEN yok: atlandı");
    return;
  }
  const terms = Array.from({ length: Math.min(AD_DISCOVERY_TERMS_PER_RUN, AD_DISCOVERY_TERMS.length) }, (_, i) => AD_DISCOVERY_TERMS[(cursor + i) % AD_DISCOVERY_TERMS.length]);
  const found = new Map<string, DiscoveredStore>();
  let searched = 0;
  let stopped: string | null = null;
  for (const term of terms) {
    if (searched > 0) await sleep(1000); // graph.facebook.com: saniyede en fazla 1 istek
    let body: { data?: ArchivedAd[]; error?: { message?: string; code?: number; error_subcode?: number } };
    let status = 0;
    try {
      const res = await fetch(discoverySearchUrl(term, AD_COUNTRIES, GRAPH_API_VERSION, AD_DISCOVERY_DAYS), {
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      status = res.status;
      body = (await res.json()) as typeof body;
    } catch (err) {
      console.log(`  ? "${term}": ${(err as Error).message}`);
      continue;
    }
    searched++;
    if (body.error || status >= 400) {
      const c = classifyGraphError(status, body.error);
      if (c.fatal) {
        stopped = c.reason;
        break;
      }
      console.log(`  ? "${term}": ${c.reason}`);
      continue;
    }
    for (const d of domainsFromAds(body.data ?? [])) {
      const e = found.get(d.domain);
      found.set(d.domain, e ? { ...e, ads: e.ads + d.ads } : d);
    }
  }

  // Bilinen mağazalar atlanır; yeni olanlar en çok reklamı olandan başlayarak eklenir.
  const candidates = [...found.values()].sort((a, b) => b.ads - a.ads);
  const known = new Set<string>();
  for (let i = 0; i < candidates.length; i += 200) {
    const { data, error } = await db().from("stores").select("domain").in("domain", candidates.slice(i, i + 200).map((c) => c.domain));
    if (error) throw new Error(`stores okunamadı: ${error.message}`);
    for (const r of data ?? []) known.add(r.domain as string);
  }
  const fresh = candidates.filter((c) => !known.has(c.domain));
  const inserted = fresh.length ? await insertStores(fresh.map((c) => c.domain), "reklam", null) : 0;
  for (const c of fresh.slice(0, 12)) console.log(`  📣 ${c.domain} — ${c.ads} reklam${c.pages.length ? ` · ${c.pages.join(", ")}` : ""}`);
  if (stopped) console.error(`  ✖ Aramalar durduruldu: ${stopped}`);
  console.log(`  özet: ${searched}/${terms.length} ifade arandı, ${found.size} reklamcı site, ${inserted} yeni mağaza eklendi`);
  await setJobState("ad_discovery", {
    cursor: (cursor + searched) % AD_DISCOVERY_TERMS.length,
    at,
    terms: searched,
    domains: found.size,
    inserted,
    reason: stopped ?? undefined,
  } satisfies AdDiscoveryState);
}
