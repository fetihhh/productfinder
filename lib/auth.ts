// Tek kullanıcılı oturum: APP_PASSWORD ile giriş, AUTH_SECRET ile HMAC imzalı cookie.
// Yalnızca Web Crypto kullanır; proxy, server action ve Node testlerinde aynı kod çalışır.

export const SESSION_COOKIE = "pf_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Girilen şifreyi sabit zamanlı karşılaştırır (her iki tarafın HMAC'i karşılaştırılır). */
export async function passwordMatches(input: string, expected: string, secret: string): Promise<boolean> {
  if (!expected || !secret) return false;
  return timingSafeEqual(await hmac(secret, input), await hmac(secret, expected));
}

/** "<sonaErmeUnix>.<imza>" biçiminde oturum token'ı üretir. */
export async function createSessionToken(secret: string, nowMs = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SECONDS;
  return `${exp}.${toBase64Url(await hmac(secret, String(exp)))}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined, nowMs = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || !sig || exp < Math.floor(nowMs / 1000)) return false;
  const expected = toBase64Url(await hmac(secret, expStr));
  return timingSafeEqual(encoder.encode(sig), encoder.encode(expected));
}
