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
