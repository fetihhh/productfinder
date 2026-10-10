// Görsel özetlerinin karşılaştırılması (saf fonksiyonlar; sharp gerektirmez, arayüz paketine de girebilir).

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

/** Ürün görsellerinden herhangi biriyle en küçük fark (karşılaştırılamazsa null). */
export function closestDistance(productHashes: bigint[], offerHash: bigint | null): number | null {
  if (offerHash === null || productHashes.length === 0) return null;
  return Math.min(...productHashes.map((h) => hamming(h, offerHash)));
}