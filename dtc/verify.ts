// DTC doğrulama: bir ürünün yalnızca markanın kendi sitesinde satılan fiziksel bir ürün olup olmadığına karar verir.
// Yol üstünde mağaza ülkesi, Türkiye'ye satış ve satışa dair işaretleri (fiyat, yorum, stok, çıkış tarihi) de toplar.
// Ağ erişimi bağımlılık olarak verilir (testlerde sahte fetch/arama kullanılır).
import { parse } from "tldts";
import { BIG_BRAND_MAX_RANK, BRAND_RECHECK_DAYS, STRICT_BRAND_CHECK, VERIFY_WITH_DIRECT_ONLY } from "../config/limits.ts";
import { classifyDomain, registrableDomain } from "../lib/domain.ts";
import { normalizeName } from "../lib/productName.ts";
import type { FetchResult } from "../lib/http.ts";
import { visitsFromRank } from "../lib/winner.ts";
import { buildBrandQuery, buildQuery, findBrandListing, findMarketplaceListing, type SearchFn } from "./marketplaceSearch.ts";
import { directQuery } from "./directSearch.ts";
import { modelCoverage, modelTokens, tokens } from "./match.ts";
import { readRating } from "./sales.ts";
import {
  countryFromTld,
  detectPlatform,
  pageSignals,
  parseShopifyCatalog,
  parseShopifyMeta,
  parseShopifyProduct,
  shopifyProductJsonUrl,
  type Platform,
  type ShopifyListing,
  type ShopifyMeta,
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

export type DtcStatus = "verified" | "rejected_marketplace" | "rejected_big_brand" | "unverified";

/** Marka düzeyi pazaryeri kontrolünün önbelleği (brands tablosu). */
export type BrandState = {
  marketplaceStatus: "clean" | "found" | null;
  marketplaceEvidence: string | null;
  marketplaceCheckedAt: string | null;
  /** Tranco dünya sıralaması (null: ilk 1 milyonda değil ya da henüz bakılmadı). */
  trancoRank?: number | null;
};

/** Sitesi dünya sıralamasında üst sıralarda olan marka büyük markadır (küçük markaların ürünleri aranıyor). */
export function isBigBrand(rank: number | null | undefined): rank is number {
  return typeof rank === "number" && rank > 0 && rank <= BIG_BRAND_MAX_RANK;
}

export function bigBrandReason(rank: number): string {
  const v = visitsFromRank(rank);
  const fmt = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
  return `Büyük marka: site dünya sıralamasında #${rank.toLocaleString("tr-TR")} (≈ ${fmt.format(v.mid)} ziyaret/ay; sınır #${BIG_BRAND_MAX_RANK.toLocaleString("tr-TR")})`;
}

export type VerifyInput = {
  brandDomain: string;
  productUrl: string | null;
  productName: string;
  brand?: BrandState | null;
  /** false → ürün adı markayla başlamıyor (yeni mağaza keşfi); marka = mağaza adı + alan adı. Varsayılan: blog başlığı, ilk sözcük marka. */
  nameStartsWithBrand?: boolean;
};

export type VerifyDeps = {
  fetchPage: (url: string, accept?: string) => Promise<FetchResult>;
  /** Geniş arama (Tavily). null → arama yapılamaz (kota bitti / anahtar yok). */
  searchMarketplaces: SearchFn | null;
  /** Kotasız doğrudan pazaryeri araması (dtc/directSearch.ts); yoksa atlanır. */
  directSearch?: SearchFn | null;
  now?: number;
};

/** Yalnızca doğrudan kontrollerle doğrulanan ürünün gerekçesi (arayüz "kısmi kontrol" rozeti gösterir). */
export const WIDE_PENDING = "Geniş arama bekliyor (Tavily kotası doldu); ertesi gün yeniden kontrol edilecek";

export type SalesInfo = {
  price: number | null;
  currency: string | null;
  reviewCount: number | null;
  rating: number | null;
  reviewSource: string | null;
  availability: string | null;
  launchedAt: string | null;
  variantCount: number | null;
};

export type StoreInfo = {
  brandName: string | null;
  country: string | null;
  city: string | null;
  shipsToTr: boolean | null;
  productCount: number | null;
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
  /** Shopify ürün türü (toptancı aramasında kullanılır). */
  productType: string | null;
  sales: SalesInfo;
  store: StoreInfo;
  /** Bu çalıştırmada yapılan marka düzeyi kontrolün sonucu (önbelleğe yazılır). */
  brandCheck: { status: "clean" | "found"; evidence: string } | null;
};

const QUOTA_PREFIX = "Pazaryeri kontrolü yapılamadı";
const CATALOG_MAX_PAGES = 3;

const emptySales = (): SalesInfo => ({
  price: null, currency: null, reviewCount: null, rating: null, reviewSource: null,
  availability: null, launchedAt: null, variantCount: null,
});
const emptyStore = (): StoreInfo => ({ brandName: null, country: null, city: null, shipsToTr: null, productCount: null });

function isFresh(checkedAt: string | null, now: number): boolean {
  return Boolean(checkedAt) && now - Date.parse(checkedAt!) < BRAND_RECHECK_DAYS * 86_400_000;
}

/**
 * Ürün düzeyi eşleşme. Yeni mağaza ürünlerinde marka mağaza adıdır; ama mağaza başka bir markanın ürününü de satıyor
 * olabilir ("Wacaco Prestina Portable Coffee Press" @ furtherfield.co). Bu yüzden ürün adının ilk kelimesini marka sayan
 * aramayla da bakılır. Ürün düzeyi eşleşme katıdır (model kelimelerinin ilki ve en az %60'ı ilanda geçmeli).
 */
export function findProductListing(
  results: Parameters<typeof findMarketplaceListing>[0],
  brandDomain: string,
  productName: string,
  brandWords: string[] | undefined,
): ReturnType<typeof findMarketplaceListing> {
  const own = findMarketplaceListing(results, brandDomain, productName, brandWords);
  if (own || !brandWords) return own;
  // İlk kelime yalnızca marka gibi yazılmışsa marka sayılır: mağazada ™/® ile ("Wacaco™ …") ya da pazaryeri başlığında
  // tamamen büyük harfle ("WACACO Prestina …"). Genel kelimeler ("Lumen Lamp", "Calendario de Adviento") böylece eleme sebebi olmaz.
  const first = productName.trim().split(/\s+/)[0]?.replace(/[™®©]+$/, "") ?? "";
  if (first.length < 3) return null;
  const marked = new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[™®]`).test(productName.trim());
  const upper = first.toUpperCase();
  const brandLike = (title: string) => marked || (first.length >= 4 && title.split(/[^\p{L}\p{N}]+/u).includes(upper));
  const other = findMarketplaceListing(results.filter((r) => brandLike(r.title)), brandDomain, productName);
  return other ? { url: other.url, why: `${other.why}, ürün başka bir markanın` } : null;
}
export async function verifyProduct(input: VerifyInput, deps: VerifyDeps): Promise<VerifyResult> {
  const now = deps.now ?? Date.now();
  const evidence: string[] = [];
  const r: Omit<VerifyResult, "status" | "reason" | "retryable"> = {
    platform: null, hasCheckout: null, physical: null, name: null, imageUrl: null, productUrl: null, productType: null,
    sales: emptySales(), store: emptyStore(), brandCheck: null,
  };
  const done = (status: DtcStatus, why: string, retryable = false): VerifyResult => ({
    ...r,
    status,
    retryable,
    reason: [...evidence, why].filter(Boolean).join(" · "),
  });

  // 1) Alan adı engel listesinde mi?
  const domainVerdict = classifyDomain(input.brandDomain);
  if (!domainVerdict.ok) {
    return done(domainVerdict.kind === "marketplace" ? "rejected_marketplace" : "unverified", domainVerdict.reason);
  }

  // 1b) Büyük marka (Tranco sırası) → ağa çıkmadan ele.
  if (isBigBrand(input.brand?.trancoRank)) return done("rejected_big_brand", bigBrandReason(input.brand.trancoRank));

  // 2) Marka daha önce bir pazaryerinde/perakendecide bulunduysa (ve kayıt tazeyse) hiç ağa çıkmadan ele.
  if (STRICT_BRAND_CHECK && input.brand?.marketplaceStatus === "found" && isFresh(input.brand.marketplaceCheckedAt, now)) {
    return done("rejected_marketplace", `Marka pazaryerinde satıyor (önceki kontrol): ${input.brand.marketplaceEvidence ?? ""}`);
  }

  // 3) Marka sayfası
  const pageUrl = input.productUrl ?? `https://${input.brandDomain}/`;
  const page = await deps.fetchPage(pageUrl);
  if (!page.ok) return done("unverified", `Marka sitesi okunamadı: ${page.reason}`, page.retryable);

  const finalVerdict = classifyDomain(page.url);
  if (!finalVerdict.ok && finalVerdict.kind === "marketplace") {
    return done("rejected_marketplace", `Marka linki pazaryerine yönlendiriyor: ${page.url}`);
  }
  const finalDomain = registrableDomain(page.url);
  if (finalDomain && finalDomain !== input.brandDomain) evidence.push(`Yönlendirme: ${finalDomain}`);

  const platform = detectPlatform(page.text);
  const signals = pageSignals(page.text);
  const origin = new URL(page.url).origin;
  r.platform = platform;
  r.name = signals.productName;
  r.imageUrl = signals.productImage;
  evidence.push(`Platform: ${platform}`);

  // 4) Shopify: mağaza bilgisi (/meta.json), ürün JSON'u veya katalog eşleşmesi.
  let meta: ShopifyMeta | null = null;
  let shopifyShipping: boolean | null = null;
  let shopifyProductId = signals.shopifyProductId;
  let fromCatalog = false;
  let catalogAvailable: boolean | null = null;
  if (platform === "shopify") {
    const metaRes = await deps.fetchPage(`${origin}/meta.json`, "application/json");
    meta = metaRes.ok ? parseShopifyMeta(metaRes.text) : null;

    const jsonUrl = shopifyProductJsonUrl(page.url);
    if (jsonUrl) {
      const res = await deps.fetchPage(jsonUrl, "application/json");
      const product = res.ok ? parseShopifyProduct(res.text) : null;
      if (product) {
        shopifyShipping = product.requiresShipping;
        shopifyProductId = product.id ?? shopifyProductId;
        r.name = product.title ?? r.name;
        r.imageUrl = product.image ?? r.imageUrl;
        r.sales.price = product.price;
        r.sales.launchedAt = product.publishedAt;
        r.sales.variantCount = product.variantCount;
        r.productType = product.productType;
      }
    } else {
      const catalog: ShopifyListing[] = [];
      for (let pageNo = 1; pageNo <= CATALOG_MAX_PAGES; pageNo++) {
        const suffix = pageNo === 1 ? "" : `&page=${pageNo}`;
        const res = await deps.fetchPage(`${origin}/products.json?limit=250${suffix}`, "application/json");
        const items = res.ok ? parseShopifyCatalog(res.text) : [];
        catalog.push(...items);
        if (items.length < 250) break;
      }
      const match = bestCatalogMatch(catalog, input.brandDomain, input.productName);
      if (match) {
        r.productUrl = `${origin}/products/${match.handle}`;
        evidence.push(`Katalog eşleşmesi: ${r.productUrl}`);
        shopifyShipping = match.requiresShipping;
        shopifyProductId = match.id ?? shopifyProductId;
        r.name = match.title;
        r.imageUrl = match.image ?? r.imageUrl;
        r.sales.price = match.price;
        r.sales.launchedAt = match.publishedAt;
        r.sales.variantCount = match.variantCount;
        r.productType = match.productType;
        r.sales.availability = match.available === null ? null : match.available ? "InStock" : "OutOfStock";
        fromCatalog = true;
        catalogAvailable = match.available;
      }
    }
  }

  // 5) Mağaza ve satış işaretleri (karar vermese de karta yazılır).
  const suffix = parse(page.url).publicSuffix ?? "";
  r.store = {
    brandName: meta?.name ?? signals.siteName,
    country: meta?.country ?? signals.orgCountry ?? countryFromTld(suffix),
    city: meta?.city ?? null,
    shipsToTr: meta?.shipsTo ? meta.shipsTo.includes("TR") : null,
    productCount: meta?.productCount ?? null,
  };
  if (r.sales.price === null && signals.offer) r.sales.price = Number(signals.offer.price);
  r.sales.currency = signals.offer?.currency ?? meta?.currency ?? null;
  if (!fromCatalog) r.sales.availability = signals.offer?.availability ?? null;

  const rating = await readRating(signals, shopifyProductId, deps.fetchPage);
  if (rating) {
    r.sales.reviewCount = rating.count;
    r.sales.rating = rating.value;
    r.sales.reviewSource = rating.source;
  }

  // 6) Ürün sayfası bulunabildi mi?
  if (platform === "shopify" && !shopifyProductJsonUrl(page.url) && !fromCatalog) {
    return done("unverified", "Blog marka ana sayfasına link veriyor; ürün mağaza kataloğunda bulunamadı");
  }
  if (platform !== "shopify" && !signals.hasProductSchema && !signals.offer && new URL(page.url).pathname.length <= 1) {
    return done("unverified", "Blog marka ana sayfasına link veriyor; ürün sayfası bulunamadı");
  }

  // 7) Satın alma özelliği. Katalogdan bulunan üründe ana sayfadaki butonlar başka ürünlere ait olabilir → yalnızca katalog.
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
  if (!purchase) {
    r.hasCheckout = false;
    return done("unverified", "Sitede satın alma özelliği bulunamadı");
  }
  r.hasCheckout = true;
  evidence.push(`Satın alma: ${purchase}`);

  // 8) Fiziksel ürün mü?
  if (shopifyShipping === false) {
    r.physical = false;
    return done("unverified", "Dijital ürün (Shopify: requires_shipping=false)");
  } else if (signals.digitalType) {
    r.physical = false;
    return done("unverified", `Dijital/hizmet ürünü (schema.org ${signals.digitalType})`);
  } else if (shopifyShipping === true) {
    evidence.push("Fiziksel: Shopify kargo gerektiriyor");
  } else if (signals.shippingDetails) {
    evidence.push("Fiziksel: kargo/ağırlık bilgisi");
  } else if (signals.hasProductSchema && signals.offer) {
    evidence.push("Fiziksel: schema.org Product");
  } else {
    return done("unverified", "Fiziksel ürün kanıtı bulunamadı");
  }
  r.physical = true;

  // 9) Doğrudan pazaryeri araması (Amazon.com, AliExpress, Otto; kotasız): ürün ve marka.
  const brandName = r.store.brandName ?? input.brandDomain.split(".")[0];
  const compactName = normalizeName(brandName).replace(/\s+/g, "");
  const brandWords =
    input.nameStartsWithBrand === false
      ? [...new Set([normalizeName(input.brandDomain.split(".")[0]).replace(/\s+/g, ""), compactName].filter((w) => w.length >= 3))]
      : undefined;
  // Yeni mağaza ürünlerinde marka düzeyi eşleşme için üründen bir kelime de gerekir (mağaza adları başka markalarla çakışır).
  const productWords = brandWords ? tokens(input.productName).filter((t) => t.length >= 4 && !brandWords.includes(t)) : undefined;
  let directComplete = false;
  if (deps.directSearch) {
    const d = await deps.directSearch(directQuery(brandName, input.productName));
    if (d.ok) {
      const listing = findProductListing(d.results, input.brandDomain, input.productName, brandWords);
      if (listing) {
        if (STRICT_BRAND_CHECK) r.brandCheck = { status: "found", evidence: `${listing.why}: ${listing.url}` };
        return done("rejected_marketplace", `Pazaryerinde bulundu (${listing.why}, doğrudan arama): ${listing.url}`);
      }
      let complete = !d.incomplete;
      const failed = [...(d.failed ?? [])];
      if (STRICT_BRAND_CHECK) {
        const b = await deps.directSearch(directQuery(brandName, ""));
        if (b.ok) {
          const brandListing = findBrandListing(b.results, brandName, input.brandDomain, input.productName, productWords);
          if (brandListing) {
            r.brandCheck = { status: "found", evidence: `${brandListing.why}: ${brandListing.url}` };
            return done("rejected_marketplace", `${brandListing.why} (doğrudan arama): ${brandListing.url}`);
          }
          complete &&= !b.incomplete;
          for (const f of b.failed ?? []) if (!failed.includes(f)) failed.push(f);
        } else complete = false;
      }
      directComplete = complete;
      evidence.push(`Doğrudan arama: ${(d.checked ?? []).join(", ") || "—"} temiz${failed.length ? ` (okunamadı: ${failed.join(", ")})` : ""}`);
    }
  }

  // 10) Geniş arama (Tavily, ~126 pazaryeri/perakendeci): ürün düzeyi
  const search = deps.searchMarketplaces;
  if (!search) {
    // Kota bitti: doğrudan kontrol tamsa ürün "kısmi doğrulanmış" listelenir ve ertesi gün geniş aramayla yeniden denenir.
    if (directComplete && VERIFY_WITH_DIRECT_ONLY) return done("verified", WIDE_PENDING, true);
    return done("unverified", `${QUOTA_PREFIX} (günlük/aylık arama kotası doldu)`, true);
  }
  // Arama/eşleştirme için blog başlığından gelen kısa ad kullanılır; marka sayfasındaki adlar çoğu zaman
  // pazarlama ekleriyle uzundur ("… with 5 Lights & 10 Configurations") ve eşleşmeyi bozar.
  const outcome = await search(buildQuery(input.brandDomain, input.productName));
  if (!outcome.ok) {
    if (outcome.quota && directComplete && VERIFY_WITH_DIRECT_ONLY) return done("verified", WIDE_PENDING, true);
    return done("unverified", `${QUOTA_PREFIX}: ${outcome.reason}`, true);
  }
  const listing = findProductListing(outcome.results, input.brandDomain, input.productName, brandWords);
  if (listing) {
    // Markanın bir ürünü pazaryerinde → katı modda marka da "found" (aynı markanın diğer ürünleri de elenir).
    if (STRICT_BRAND_CHECK) r.brandCheck = { status: "found", evidence: `${listing.why}: ${listing.url}` };
    return done("rejected_marketplace", `Pazaryerinde bulundu (${listing.why}): ${listing.url}`);
  }
  evidence.push(`Ürün araması: ${outcome.results.length} sonuç, eşleşme yok`);

  // 11) Geniş marka düzeyi kontrol (katı mod): marka herhangi bir pazaryerinde/büyük perakendecide satıyorsa ele.
  if (!STRICT_BRAND_CHECK) return done("verified", "");
  if (input.brand?.marketplaceStatus === "clean" && isFresh(input.brand.marketplaceCheckedAt, now)) {
    return done("verified", "Marka araması: temiz (önceki kontrol)");
  }
  const brandOutcome = await search(buildBrandQuery(brandName));
  if (!brandOutcome.ok) {
    if (brandOutcome.quota && directComplete && VERIFY_WITH_DIRECT_ONLY) return done("verified", WIDE_PENDING, true);
    return done("unverified", `${QUOTA_PREFIX} (marka araması): ${brandOutcome.reason}`, true);
  }
  const brandListing = findBrandListing(brandOutcome.results, brandName, input.brandDomain, input.productName, productWords);
  if (brandListing) {
    r.brandCheck = { status: "found", evidence: `${brandListing.why}: ${brandListing.url}` };
    return done("rejected_marketplace", `${brandListing.why}: ${brandListing.url}`);
  }
  r.brandCheck = { status: "clean", evidence: `"${brandName}" araması: ${brandOutcome.results.length} sonuç, eşleşme yok` };
  return done("verified", `Marka araması: ${brandOutcome.results.length} sonuç, eşleşme yok`);
}
