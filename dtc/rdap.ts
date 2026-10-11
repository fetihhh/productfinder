// Alan adı kayıt tarihi: RDAP (WHOIS'in resmi, ücretsiz, JSON halefi). rdap.org isteği ilgili kayıt kuruluşuna
// yönlendirir (ör. .com → rdap.verisign.com). Kişisel veri istenmez; yalnızca "registration" olayının tarihi okunur.
import type { FetchResult } from "../lib/http.ts";

type FetchPage = (url: string, accept?: string) => Promise<FetchResult>;

export function parseRdapRegistration(text: string): string | null {
  try {
    const events = (JSON.parse(text) as { events?: { eventAction?: string; eventDate?: string }[] }).events ?? [];
    const reg = events.find((e) => e.eventAction === "registration")?.eventDate;
    return reg && !Number.isNaN(Date.parse(reg)) ? reg.slice(0, 10) : null;
  } catch {
    return null;
  }
}

export async function registrationDate(domain: string, fetchPage: FetchPage): Promise<string | null> {
  const res = await fetchPage(`https://rdap.org/domain/${encodeURIComponent(domain)}`, "application/rdap+json, application/json");
  return res.ok ? parseRdapRegistration(res.text) : null;
}

export type RdapInfo = { registered: string | null; expires: string | null; registrar: string | null };

type Rdap = {
  events?: { eventAction?: string; eventDate?: string }[];
  entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, unknown][]] }[];
};

export const rdapUrl = (domain: string) => `https://rdap.org/domain/${encodeURIComponent(domain)}`;

/** Kayıt ve bitiş tarihi ile kayıt firması (registrar varlığının vCard "fn" alanı; kişisel veri okunmaz). */
export function parseRdap(text: string): RdapInfo | null {
  let j: Rdap;
  try {
    j = JSON.parse(text) as Rdap;
  } catch {
    return null;
  }
  const ev = (a: string) => j.events?.find((e) => e.eventAction === a)?.eventDate ?? null;
  const reg = j.entities?.find((e) => e.roles?.includes("registrar"));
  const fn = reg?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3];
  const registered = ev("registration");
  if (!registered && !fn) return null;
  return { registered, expires: ev("expiration"), registrar: typeof fn === "string" ? fn.slice(0, 120) : null };
}
