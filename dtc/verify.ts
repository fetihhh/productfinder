// DTC doğrulama: bir ürünün yalnızca markanın kendi sitesinde satılan fiziksel bir ürün olup olmadığına karar verir.
// Ağ erişimi bağımlılık olarak verilir (testlerde sahte fetch/arama kullanılır).
import { classifyDomain, registrableDomain } from "../lib/domain.ts";
import type { FetchResult } from "../lib/http.ts";
import { buildQuery, findMarketplaceListing, type SearchFn } from "./marketplaceSearch.ts";
import { modelCoverage, modelTokens } from "./match.ts";
import {
  detectPlatform,
  pageSignals,
  parseShopifyCatalog,
  parseShopifyProduct,
  shopifyProductJsonUrl,
  type Platform,
  type ShopifyListing,
} from "./signals.ts";

/** Katalogda blog başlığındaki model adına en çok benzeyen ürün (model belirteçlerinin ≥%60'ı). */
export function bestCatalogMatch(catalog: ShopifyListing[], brandDomain: string, productName: string): ShopifyListing | null {
  const model = modelTokens(brandDomain, productName);
  if (model.length === 0) return null;
  let best: { item: ShopifyListing; score: number } | null = null;
  for (const item of catalog) {
    const score = modelCoverage(model, item.title);
    // Eşitlikte fiziksel ve satışta olan ürün tercih edilir (rezervasyon/kapora kayıtları yerine).
    const rank = (x: ShopifyListing) => (x.requiresShipping ? 2 : 0) + (x.available ? 1 : 0);
    if (!best || score > best.score || (score === best.score && rank(item) > rank(best.item))) best = { item, score };
  }
  return best && best.score >= 0.6 ? best.item : null;
}

export type DtcStatus = "verified" | "rejected_marketplace" | "unverified";

export type VerifyInput = { brandDomain: string; productUrl: string | null; productName: string };

export type VerifyDeps = {
  fetchPage: (url: string, accept?: string) => Promise<FetchResult>;
  /** null → arama yapılamaz (kota bitti / anahtar yok). */
  searchMarketplaces: SearchFn | null;
};

export type VerifyResult = {
  status: DtcStatus;
  reason: string;
  /** true → kalıcı bir sonuç değil (kota, ağ hatası); sonraki çalıştırmada yeniden denenir. */
  retryable: boolean;
  platform: Platform | null;
  hasCheckout: boolean | null;
  physical: boolean | null;
  name: string | null;
  imageUrl: string | null;
  /** Blog ana sayfaya link verdiyse katalogda bulunan ürün sayfası. */
  productUrl: string | null;
};

const QUOTA_PREFIX = "Pazaryeri kontrolü yapılamadı";
const CATALOG_MAX_PAGES = 3;

export async function verifyProduct(input: VerifyInput, deps: VerifyDeps): Promise<VerifyResult> {
  const evidence: string[] = [];
  const base = { platform: null, hasCheckout: null, physical: null, name: null, imageUrl: null, productUrl: null };
  const done = (status: DtcStatus, why: string, extra: Partial<VerifyResult> = {}): VerifyResult => ({
    ...base,
    retryable: false,
    ...extra,
    status,
    reason: [...evidence, why].filter(Boolean).join(" · "),
  });

  // 1) Alan adı engel listesinde mi?
  const domainVerdict = classifyDomain(input.brandDomain);
  if (!domainVerdict.ok) {
    return done(domainVerdict.kind === "marketplace" ? "rejected_marketplace" : "unverified", domainVerdict.reason);
  }

  // 2) Marka sayfası
  const pageUrl = input.productUrl ?? `https://${input.brandDomain}/`;
  const page = await deps.fetchPage(pageUrl);
  if (!page.ok) return done("unverified", `Marka sitesi okunamadı: ${page.reason}`, { retryable: page.retryable });

  const finalVerdict = classifyDomain(page.url);
  if (!finalVerdict.ok && finalVerdict.kind === "marketplace") {
    return done("rejected_marketplace", `Marka linki pazaryerine yönlendiriyor: ${page.url}`);
  }
  const finalDomain = registrableDomain(page.url);
  if (finalDomain && finalDomain !== input.brandDomain) evidence.push(`Yönlendirme: ${finalDomain}`);

  const platform = detectPlatform(page.text);
  const signals = pageSignals(page.text);
  evidence.push(`Platform: ${platform}`);

  // 3) Shopify: ürün JSON'u (fiziksel ürün kanıtı: requires_shipping).
  //    Blog ürün sayfası yerine ana sayfaya link verdiyse mağaza kataloğunda ürünü adıyla ara.
  let shopifyShipping: boolean | null = null;
  let fromCatalog = false;
  let catalogAvailable: boolean | null = null;
  let productUrl: string | null = null;
  let name = signals.productName;
  let image = signals.productImage;
  if (platform === "shopify") {
    const jsonUrl = shopifyProductJsonUrl(page.url);
    if (jsonUrl) {
      const res = await deps.fetchPage(jsonUrl, "application/json");
      const product = res.ok ? parseShopifyProduct(res.text) : null;
      if (product) {
        shopifyShipping = product.requiresShipping;
        name = product.title ?? name;
        image = product.image ?? image;
      }
    } else {
      const origin = new URL(page.url).origin;
      const catalog: ShopifyListing[] = [];
      for (let pageNo = 1; pageNo <= CATALOG_MAX_PAGES; pageNo++) {
        const suffix = pageNo === 1 ? "" : `&page=${pageNo}`;
        const res = await deps.fetchPage(`${origin}/products.json?limit=250${suffix}`, "application/json");
        const items = res.ok ? parseShopifyCatalog(res.text) : [];
        catalog.push(...items);
        if (items.length < 250) break;
      }
      const match = bestCatalogMatch(catalog, input.brandDomain, input.productName);
      if (!match) {
        return done("unverified", "Blog marka ana sayfasına link veriyor; ürün mağaza kataloğunda bulunamadı", { platform });
      }
      productUrl = `${origin}/products/${match.handle}`;
      evidence.push(`Katalog eşleşmesi: ${productUrl}`);
      shopifyShipping = match.requiresShipping;
      name = match.title;
      image = match.image ?? image;
      fromCatalog = true;
      catalogAvailable = match.available;
    }
  } else if (!signals.hasProductSchema && !signals.offer && new URL(page.url).pathname.length <= 1) {
    return done("unverified", "Blog marka ana sayfasına link veriyor; ürün sayfası bulunamadı", { platform });
  }
  const extra = { platform, name, imageUrl: image, productUrl };

  // 4) Satın alma özelliği. Katalogdan bulunan üründe ana sayfadaki butonlar başka ürünlere ait olabilir → yalnızca katalog.
  let purchase: string | null;
  if (fromCatalog) {
    purchase = catalogAvailable === false ? null : "Shopify kataloğunda satışta";
  } else if (signals.hasCartForm) {
    purchase = "sepete ekle formu";
  } else if (signals.offer) {
    const o = signals.offer;
    purchase = `fiyat ${o.price}${o.currency ? " " + o.currency : ""}${o.availability ? ` (${o.availability})` : ""}`;
  } else {
    purchase = signals.hasBuyButton ? "satın al butonu" : null;
  }
  if (!purchase) return done("unverified", "Sitede satın alma özelliği bulunamadı", { ...extra, hasCheckout: false });
  evidence.push(`Satın alma: ${purchase}`);

  // 5) Fiziksel ürün mü?
  let physical: boolean | null;
  if (shopifyShipping === false) {
    return done("unverified", "Dijital ürün (Shopify: requires_shipping=false)", { ...extra, hasCheckout: true, physical: false });
  } else if (signals.digitalType) {
    return done("unverified", `Dijital/hizmet ürünü (schema.org ${signals.digitalType})`, { ...extra, hasCheckout: true, physical: false });
  } else if (shopifyShipping === true) {
    physical = true;
    evidence.push("Fiziksel: Shopify kargo gerektiriyor");
  } else if (signals.shippingDetails) {
    physical = true;
    evidence.push("Fiziksel: kargo/ağırlık bilgisi");
  } else if (signals.hasProductSchema && signals.offer) {
    physical = true;
    evidence.push("Fiziksel: schema.org Product");
  } else {
    return done("unverified", "Fiziksel ürün kanıtı bulunamadı", { ...extra, hasCheckout: true, physical: null });
  }
  const ready = { ...extra, hasCheckout: true, physical };

  // 6) Pazaryeri araması
  if (!deps.searchMarketplaces) {
    return done("unverified", `${QUOTA_PREFIX} (günlük/aylık arama kotası doldu)`, { ...ready, retryable: true });
  }
  // Arama/eşleştirme için blog başlığından gelen kısa ad kullanılır; marka sayfasındaki adlar çoğu zaman
  // pazarlama ekleriyle uzundur ("… with 5 Lights & 10 Configurations") ve eşleşmeyi bozar.
  const productName = input.productName;
  const outcome = await deps.searchMarketplaces(buildQuery(input.brandDomain, productName));
  if (!outcome.ok) {
    return done("unverified", `${QUOTA_PREFIX}: ${outcome.reason}`, { ...ready, retryable: true });
  }
  const listing = findMarketplaceListing(outcome.results, input.brandDomain, productName);
  if (listing) {
    return done("rejected_marketplace", `Pazaryerinde bulundu (${listing.why}): ${listing.url}`, ready);
  }
  return done("verified", `Pazaryeri araması: ${outcome.results.length} sonuç, eşleşme yok`, ready);
}
