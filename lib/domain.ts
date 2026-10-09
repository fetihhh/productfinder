import { parse } from "tldts";
import { MARKETPLACES, NOT_OWN_DOMAIN_LABELS, type Marketplace } from "../config/marketplaces.ts";

export type DomainVerdict =
  | { ok: true; domain: string }
  | { ok: false; domain: string | null; kind: "invalid" | "marketplace" | "not_own_domain"; reason: string };

/** URL veya hostname'den kayıtlı alan adını (eTLD+1) döndürür: "https://shop.ebay.de/x" → "ebay.de". */
export function registrableDomain(input: string): string | null {
  const info = parse(input.trim().toLowerCase());
  if (info.isIp || !info.domain || !info.publicSuffix || !info.isIcann) return null;
  return info.domain;
}

/** Alan adının pazaryeri ya da başkasına ait bir barındırma alan adı olup olmadığına karar verir. */
export function classifyDomain(input: string): DomainVerdict {
  const info = parse(input.trim().toLowerCase());
  if (info.isIp || !info.domain || !info.domainWithoutSuffix || !info.isIcann) {
    return { ok: false, domain: null, kind: "invalid", reason: `Geçersiz alan adı: ${input}` };
  }
  const label = info.domainWithoutSuffix;
  const suffix = info.publicSuffix ?? "";
  // Marka TLD'leri de yakalanır: link.amazon → ".amazon"
  const marketplace = MARKETPLACES.find((m) => m.labels.includes(label) || m.labels.includes(suffix));
  if (marketplace) {
    return {
      ok: false,
      domain: info.domain,
      kind: "marketplace",
      reason: `Alan adı bir pazaryeri: ${marketplace.name} (${info.hostname})`,
    };
  }
  if (NOT_OWN_DOMAIN_LABELS.includes(label)) {
    return {
      ok: false,
      domain: info.domain,
      kind: "not_own_domain",
      reason: `Markanın kendi alan adı değil: ${info.hostname}`,
    };
  }
  return { ok: true, domain: info.domain };
}

/** URL bir pazaryerine aitse o pazaryerini döndürür. */
export function marketplaceFor(input: string): Marketplace | null {
  const info = parse(input.trim().toLowerCase());
  if (!info.domainWithoutSuffix) return null;
  const label = info.domainWithoutSuffix;
  const suffix = info.publicSuffix ?? "";
  return MARKETPLACES.find((m) => m.labels.includes(label) || m.labels.includes(suffix)) ?? null;
}

/** Pazaryeri aramasında kullanılacak alan adı listesi. */
/** Pazaryeri araması yapılacak alan adları (toptan/tedarik platformları hariç). */
export function marketplaceSearchDomains(): string[] {
  return MARKETPLACES.filter((m) => !m.wholesale).flatMap((m) => m.searchDomains);
}
