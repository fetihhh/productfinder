// Kaba kuvvet koruması: hatalı giriş denemeleri IP'nin HMAC özetiyle (açık IP saklanmaz) sayılır. Aynı IP'den 15 dakikada
// 5 hatalı deneme ya da tüm IP'lerden saatte 50 hatalı deneme sonrası giriş geçici olarak kilitlenir.
import { db } from "./db.ts";

export const PER_IP_LIMIT = 5;
export const PER_IP_WINDOW_MIN = 15;
export const GLOBAL_LIMIT = 50;
export const GLOBAL_WINDOW_MIN = 60;

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return Buffer.from(sig).toString("hex").slice(0, 32);
}

/** İsteğin IP'si (Vercel: x-forwarded-for'un ilk adresi) → saklanacak özet. */
export async function attemptKey(forwardedFor: string | null, realIp: string | null, secret: string): Promise<string> {
  const ip = (forwardedFor?.split(",")[0] ?? realIp ?? "unknown").trim() || "unknown";
  return hmacHex(secret || "pf", `ip:${ip}`);
}

const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** Giriş kilitli mi: bu IP'nin ya da tüm IP'lerin hatalı deneme sayısı sınırı aştıysa true. Veritabanı hatasında açık bırakılmaz. */
export async function isLocked(key: string): Promise<boolean> {
  const [ip, all] = await Promise.all([
    db().from("login_attempts").select("key", { count: "exact", head: true }).eq("key", key).gte("at", since(PER_IP_WINDOW_MIN)),
    db().from("login_attempts").select("key", { count: "exact", head: true }).gte("at", since(GLOBAL_WINDOW_MIN)),
  ]);
  if (ip.error || all.error) return true;
  return (ip.count ?? 0) >= PER_IP_LIMIT || (all.count ?? 0) >= GLOBAL_LIMIT;
}

export async function recordFailure(key: string): Promise<void> {
  await db().from("login_attempts").insert({ key });
  // Eski kayıtlar temizlenir (tablo küçük kalsın).
  await db().from("login_attempts").delete().lt("at", since(24 * 60));
}

export async function clearFailures(key: string): Promise<void> {
  await db().from("login_attempts").delete().eq("key", key);
}
