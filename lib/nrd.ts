// Yeni kayıtlı alan adları (NRD) ve DNS ile Shopify mağazası tespiti.
//   WhoisDS ücretsiz günlük liste (~70 bin alan adı/gün; "ücretsiz, ticari dahil yeniden kullanılabilir"):
//     https://www.whoisds.com/whois-database/newly-registered-domains/<base64("YYYY-MM-DD.zip")>/nrd
//   cenk/nrd (WhoisDS listelerinin 60 günlük birikimi; ilk kurulumda geriye dönük tarama için):
//     https://dl.cenk.app/nrd/nrd-last-60-days.txt
// Shopify'a bağlanan özel alan adları 23.227.38.x adresine çözülür (doğrudan A kaydı ya da shops.myshopify.com CNAME'i).
// DNS sorgusu sitelere istek göndermez; mağaza sayfaları ancak sonraki adımda, robots.txt'ye uyularak okunur.
import { Resolver } from "node:dns/promises";

export const NRD60_URL = "https://dl.cenk.app/nrd/nrd-last-60-days.txt";
export const NRD60_MAX_BYTES = 150_000_000;

export function whoisdsUrl(day: string): string {
  return `https://www.whoisds.com/whois-database/newly-registered-domains/${Buffer.from(`${day}.zip`).toString("base64")}/nrd`;
}

/** Dropshipping mağazalarının çoğunun kullandığı uzantılar (spam ağırlıklı .xyz/.top vb. elenir). */
export const STORE_TLDS = new Set(["com", "shop", "store", "co", "us", "net", "online", "uk", "ca", "au", "de", "fr", "nl", "eu", "io", "boutique", "life", "style"]);

/** Satır başına bir alan adı; yorum satırları (#) ve uygunsuz uzantılar atlanır. */
export function parseDomainList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const d = raw.trim().toLowerCase();
    if (!d || d.startsWith("#") || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) continue;
    const tld = d.slice(d.lastIndexOf(".") + 1);
    // xn-- (IDN) ve çok uzun/çok kısımlı adlar çoğunlukla mağaza değildir.
    if (!STORE_TLDS.has(tld) || d.startsWith("xn--") || d.length > 40 || d.split(".").length > 3) continue;
    out.push(d);
  }
  return out;
}

export function isShopifyIp(ip: string): boolean {
  return ip.startsWith("23.227.38.");
}

export type DnsResolve = (domain: string) => Promise<string[]>;

// Çok sayıda eşzamanlı sorguda çözümleyici zaman aşımına düşebilir (ETIMEOUT); eskiden alan adı sessizce "mağaza değil"
// sayılırdı. Önce sistemin çözümleyicisi (GitHub'da hızlı), zaman aşımında ücretsiz genel çözümleyiciler (Cloudflare,
// Google, Quad9) denenir.
const resolver = new Resolver({ timeout: 3000, tries: 2 });
const backup = new Resolver({ timeout: 5000, tries: 2 });
backup.setServers(["1.1.1.1", "8.8.8.8", "9.9.9.9"]);

async function withRetry<T>(f: (r: Resolver) => Promise<T>): Promise<T> {
  try {
    return await f(resolver);
  } catch (err) {
    if ((err as { code?: string }).code !== "ETIMEOUT") throw err;
    return f(backup);
  }
}

export const systemResolve: DnsResolve = (d) => withRetry((r) => r.resolve4(d));

/** Alan adlarından Shopify'a çözülenleri döndürür (paralel DNS sorgusu). */
export async function findShopifyDomains(domains: string[], concurrency: number, resolve: DnsResolve = systemResolve): Promise<string[]> {
  const hits: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < domains.length) {
      const d = domains[next++];
      try {
        if ((await resolve(d)).some(isShopifyIp)) hits.push(d);
      } catch {
        // kayıt yok / zaman aşımı: mağaza değil
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));
  return hits;
}

export type StorePlatform = "shopify" | "ikas" | "ticimax";
export type DnsCname = (host: string) => Promise<string[]>;
export const systemCname: DnsCname = (h) => withRetry((r) => r.resolveCname(h));

/** Cloudflare adres blokları: Türk altyapıları (ikas, Ticimax) alan adlarını Cloudflare üzerinden yayınlar. */
export function isCloudflareIp(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (a === 104 && b >= 16 && b <= 31) || (a === 172 && b >= 64 && b <= 71) || (a === 162 && b === 159);
}

/** www alt alan adının CNAME hedefinden Türk altyapısı: ikas (*.myikas.com), Ticimax (*.ticimax.cloud). */
export function platformFromCname(targets: string[]): StorePlatform | null {
  for (const t of targets.map((x) => x.toLowerCase().replace(/\.$/, ""))) {
    if (t === "myikas.com" || t.endsWith(".myikas.com")) return "ikas";
    if (t === "ticimax.cloud" || t.endsWith(".ticimax.cloud")) return "ticimax";
  }
  return null;
}

/**
 * Alan adlarından mağazalar ve altyapıları: Shopify (23.227.38.x) ya da Cloudflare'e çözülen alan adlarında www CNAME'i
 * ikas/Ticimax olanlar. Yalnızca DNS sorgusu; sitelere istek gönderilmez.
 */
export async function findStoreDomains(
  domains: string[],
  concurrency: number,
  resolve: DnsResolve = systemResolve,
  cname: DnsCname = systemCname,
): Promise<{ domain: string; platform: StorePlatform }[]> {
  const hits: { domain: string; platform: StorePlatform }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < domains.length) {
      const d = domains[next++];
      try {
        const ips = await resolve(d);
        if (ips.some(isShopifyIp)) {
          hits.push({ domain: d, platform: "shopify" });
          continue;
        }
        if (!ips.some(isCloudflareIp)) continue;
        const p = platformFromCname(await cname(`www.${d}`).catch(() => []));
        if (p) hits.push({ domain: d, platform: p });
      } catch {
        // kayıt yok / zaman aşımı: mağaza değil
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));
  return hits;
}
