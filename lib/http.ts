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
const robotsCache = new Map<string, Promise<RobotsRules>>();

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

/**
 * robots.txt kuralları. 2xx → ayrıştır; 404/410 gibi "yok" yanıtları → serbest;
 * 401/403/429/5xx ya da ağ hatası → ihtiyatlı davranıp tamamen yasak say.
 */
function robotsFor(origin: string): Promise<RobotsRules> {
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = (async () => {
      try {
        let url = new URL("/robots.txt", origin);
        for (let i = 0; i <= MAX_REDIRECTS; i++) {
          const res = await rawGet(url, "text/plain");
          if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
            url = new URL(res.headers.get("location")!, url);
            continue;
          }
          if (res.ok) return parseRobots(await res.text(), AGENT_TOKEN);
          if ([401, 403, 429].includes(res.status) || res.status >= 500) return DISALLOW_ALL;
          return ALLOW_ALL;
        }
        return DISALLOW_ALL;
      } catch {
        return DISALLOW_ALL;
      }
    })();
    robotsCache.set(origin, cached);
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
): Promise<FetchResult> {
  const r = await politeRequest(input, accept, MAX_BYTES, extra);
  if (!r.ok) return r;
  const text = await r.res.text();
  if (text.length > MAX_BYTES) return { ok: false, url: r.url.href, reason: "Yanıt çok büyük", retryable: false };
  return { ok: true, status: r.res.status, url: r.url.href, contentType: r.res.headers.get("content-type") ?? "", text };
}

/** İkili dosya indirme (ör. Tranco listesinin zip'i); aynı robots/hız kurallarıyla. */
export async function politeFetchBytes(input: string, maxBytes: number): Promise<Failure | { ok: true; url: string; bytes: Uint8Array }> {
  const r = await politeRequest(input, "application/zip,application/octet-stream,*/*;q=0.5", maxBytes);
  if (!r.ok) return r;
  const bytes = new Uint8Array(await r.res.arrayBuffer());
  if (bytes.length > maxBytes) return { ok: false, url: r.url.href, reason: "Yanıt çok büyük", retryable: false };
  return { ok: true, url: r.url.href, bytes };
}
