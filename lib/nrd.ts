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

const resolver = new Resolver({ timeout: 2500, tries: 1 });
export const systemResolve: DnsResolve = (d) => resolver.resolve4(d);

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
