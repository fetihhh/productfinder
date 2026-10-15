// Etik HTTP istemcisi: robots.txt'ye uyar, alan adı başına saniyede en fazla 1 istek gönderir,
// User-Agent'ta uygulama adını belirtir. Yönlendirmeleri elle izler; her adımda robots yeniden kontrol edilir.
import { ALLOW_ALL, DISALLOW_ALL, isAllowed, parseRobots, type RobotsRules } from "./robots.ts";

export const USER_AGENT = "ProductFinderBot/0.1 (personal, non-commercial product research; 1 req/s)";
const AGENT_TOKEN = "ProductFinderBot";
const MIN_INTERVAL_MS = 1000;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 3_000_000;

export type FetchResult =
  | { ok: true; status: number; url: string; contentType: string; text: string }
  | { ok: false; url: string; reason: string; /** geçici hata mı (ağ, zaman aşımı, 429, 5xx) */ retryable: boolean };

const nextSlot = new Map<string, number>();
const robotsCache = new Map<string, Promise<RobotsRules | { transient: string }>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(host: string): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + MIN_INTERVAL_MS);
  if (slot > now) await sleep(slot - now);
}

async function rawGet(url: URL, accept: string, extra: Record<string, string> = {}): Promise<Response> {
  await throttle(url.host);
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { ...extra, "User-Agent": USER_AGENT, Accept: accept },
  });
}

/** robots.txt geçici olarak okunamadı (429/5xx/ağ hatası): istek yapılmaz, ama site "yasak" da sayılmaz. */
type RobotsTransient = { transient: string };

/**
 * robots.txt kuralları. 2xx → ayrıştır; 404/410 gibi "yok" yanıtları → serbest; 401/403 → ihtiyatlı davranıp tamamen yasak say.
 * 429/5xx ya da ağ hatası → geçici: o siteye istek yapılmaz, sonuç önbelleğe alınmaz (sonraki çağrıda yeniden denenir).
 */
function robotsFor(origin: string): Promise<RobotsRules | RobotsTransient> {
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = (async (): Promise<RobotsRules | RobotsTransient> => {
      try {
        let url = new URL("/robots.txt", origin);
        for (let i = 0; i <= MAX_REDIRECTS; i++) {
          const res = await rawGet(url, "text/plain");
          if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
            url = new URL(res.headers.get("location")!, url);
            continue;
          }
          if (res.ok) return parseRobots(await res.text(), AGENT_TOKEN);
          if (res.status === 429 || res.status >= 500) return { transient: `HTTP ${res.status}` };
          if (res.status === 401 || res.status === 403) return DISALLOW_ALL;
          return ALLOW_ALL;
        }
        return DISALLOW_ALL;
      } catch (err) {
        return { transient: `ağ hatası: ${(err as Error).message}` };
      }
    })();
    robotsCache.set(origin, cached);
    void cached.then((r) => {
      if ("transient" in r) robotsCache.delete(origin);
    });
  }
  return cached;
}

type Failure = Extract<FetchResult, { ok: false }>;

/** robots.txt ve hız sınırına uyarak isteği yapar, yönlendirmeleri izler; gövdeyi okumaz. */
async function politeRequest(
  input: string,
  accept: string,
  maxBytes: number,
  extra: Record<string, string> = {},
): Promise<Failure | { ok: true; url: URL; res: Response }> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, url: input, reason: "Geçersiz URL", retryable: false };
  }

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, url: url.href, reason: `Desteklenmeyen protokol: ${url.protocol}`, retryable: false };
    }
    const rules = await robotsFor(url.origin);
    if ("transient" in rules) {
      return { ok: false, url: url.href, reason: `robots.txt geçici olarak okunamadı (${rules.transient})`, retryable: true };
    }
    if (!isAllowed(rules, url.pathname + url.search)) {
      return { ok: false, url: url.href, reason: "robots.txt izin vermiyor", retryable: false };
    }

    let res: Response;
    try {
      res = await rawGet(url, accept, extra);
    } catch (err) {
      return { ok: false, url: url.href, reason: `Ağ hatası: ${(err as Error).message}`, retryable: true };
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) {
      const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      return { ok: false, url: url.href, reason: `HTTP ${res.status}`, retryable };
    }

    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > maxBytes) return { ok: false, url: url.href, reason: "Yanıt çok büyük", retryable: false };
    return { ok: true, url, res };
  }
  return { ok: false, url: url.href, reason: "Çok fazla yönlendirme", retryable: false };
}

/** extra: dil/para birimi tercihi gibi ek başlıklar (User-Agent değiştirilemez). */
export async function politeFetch(
  input: string,
  accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  extra: Record<string, string> = {},
  maxBytes = MAX_BYTES,
): Promise<FetchResult> {
  const r = await politeRequest(input, accept, maxBytes, extra);
  if (!r.ok) return r;
  const text = await r.res.text();
  if (text.length > maxBytes) return { ok: false, url: r.url.href, reason: "Yanıt çok büyük", retryable: false };
  return { ok: true, status: r.res.status, url: r.url.href, contentType: r.res.headers.get("content-type") ?? "", text };
}

/**
 * Mağaza kontrolü için: Shopify'ın /products.json?limit=250 yanıtı uzun ürün açıklamalarıyla 3 MB'ı sık aşıyor (kontrollerin
 * ~%23'ü "Yanıt çok büyük" diye düşüyordu). Bu istekler için sınır 25 MB.
 */
export const politeFetchLarge = (input: string, accept?: string) => politeFetch(input, accept, {}, 25_000_000);

/** İkili dosya indirme (ör. Tranco listesinin zip'i, ürün görselleri); aynı robots/hız kurallarıyla. */
export async function politeFetchBytes(
  input: string,
  maxBytes: number,
  accept = "application/zip,application/octet-stream,*/*;q=0.5",
): Promise<Failure | { ok: true; url: string; bytes: Uint8Array }> {
  const r = await politeRequest(input, accept, maxBytes);
  if (!r.ok) return r;
  const bytes = new Uint8Array(await r.res.arrayBuffer());
  if (bytes.length > maxBytes) return { ok: false, url: r.url.href, reason: "Yanıt çok büyük", retryable: false };
  return { ok: true, url: r.url.href, bytes };
}
