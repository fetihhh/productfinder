// Görsel eşleştirme: algısal özet (dHash, 256 bit). Dropshipping mağazaları çoğunlukla tedarikçinin fotoğrafını kullanır;
// aynı fotoğraf farklı boyutta, sıkıştırmada ya da beyaz kenar boşluğuyla yayımlansa da özetler neredeyse aynı kalır.
// Kenarlardaki düz arka plan kırpılır, görsel 17×16 gri tonlamaya küçültülür, yan yana pikseller karşılaştırılır.
// 8×8 özet aynı boş tişört kalıbının farklı baskılı fotoğraflarını "aynı" sayıyordu (fark 12/64); 16×16'da bu çift
// 84/256 fark verirken aynı fotoğrafın büyütülmüş/sıkıştırılmış/kenar boşluklu hâli 4/256 veriyor.
import sharp, { type Sharp } from "sharp";
export { closestDistance, hamming } from "./imageDistance.ts";

const SIZE = 16;

async function hashPixels(img: Sharp): Promise<bigint> {
  const { data, info } = await img.resize(SIZE + 1, SIZE, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let h = 0n;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * (SIZE + 1) + x) * ch;
      h = (h << 1n) | (data[i] > data[i + ch] ? 1n : 0n);
    }
  }
  return h;
}

/** Görselin dHash özeti; çözülemeyen dosyada null. */
export async function dHash(bytes: Uint8Array): Promise<bigint | null> {
  const base = () => sharp(bytes, { failOn: "none", limitInputPixels: 40_000_000 }).flatten({ background: "#ffffff" });
  try {
    // Düz renkli kenarları kırp (tamamen düz görselde trim hata verir → kırpmadan devam).
    const trimmed = await base().trim({ threshold: 20 }).png().toBuffer().catch(() => null);
    return await hashPixels(trimmed ? sharp(trimmed) : base());
  } catch {
    return null;
  }
}


/** Shopify CDN görselleri küçük boyutta istenir (özet için 300 px yeter, bant genişliği azalır). */
export function thumbnailUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "cdn.shopify.com" || u.pathname.includes("/cdn/shop/")) u.searchParams.set("width", "300");
    return u.href;
  } catch {
    return url;
  }
}

const https = (u: string) => (u.startsWith("//") ? `https:${u}` : u);

/** Shopify ürün JSON'undaki (/products/<handle>.js) görseller. */
export function parseShopifyImages(text: string): string[] {
  try {
    const data = JSON.parse(text) as { images?: unknown[] };
    return (data.images ?? []).filter((u): u is string => typeof u === "string" && u.length > 0).map(https);
  } catch {
    return [];
  }
}

/**
 * Karşılaştırılacak ürün görselleri: kayıtlı ana görsel + Shopify ürününün ilk 4 görseli (tedarikçi fotoğrafı
 * çoğunlukla ilk görsellerdendir). Shopify dışı sitelerde yalnızca ana görsel.
 */
export async function productImageUrls(
  imageUrl: string | null,
  productUrl: string | null,
  fetchPage: (url: string, accept?: string) => Promise<{ ok: true; text: string } | { ok: false }>,
): Promise<string[]> {
  const urls = imageUrl ? [https(imageUrl)] : [];
  if (productUrl && /\/products\/[^/?#]+/.test(productUrl)) {
    const u = new URL(productUrl);
    u.search = "";
    u.hash = "";
    const res = await fetchPage(`${u.href.replace(/\/$/, "")}.js`, "application/json");
    if (res.ok) urls.push(...parseShopifyImages(res.text).slice(0, 4));
  }
  const seen = new Set<string>();
  return urls.filter((u) => {
    const key = thumbnailUrl(u).replace(/[?&]v=\d+/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type FetchBytes =(url: string) => Promise<{ ok: true; bytes: Uint8Array } | { ok: false }>;

/** Aynı çalıştırmada aynı görsel bir kez indirilir ve özetlenir. */
export function imageHasher(fetchBytes: FetchBytes): (url: string | null) => Promise<bigint | null> {
  const cache = new Map<string, Promise<bigint | null>>();
  return (url) => {
    if (!url) return Promise.resolve(null);
    const key = thumbnailUrl(url);
    let p = cache.get(key);
    if (!p) {
      p = fetchBytes(key).then((r) => (r.ok ? dHash(r.bytes) : null)).catch(() => null);
      cache.set(key, p);
    }
    return p;
  };
}
