// Mağazanın ürün listesinin anlık görüntüsü ve ürün bazında hareket: hangi üründe stok azalıyor, hangisinin fiyatı
// değişti, hangisi yeni eklendi. Mağaza toplamı yerine mağazanın asıl sattığı ürünü bulmak için.
// Anlık görüntü yalnızca puanı belirli bir seviyenin üstündeki mağazalarda tutulur (veritabanı boyutu).
import { clip } from "../lib/text.ts";
import type { StoreProduct } from "./storeProbe.ts";

/** Kısa anahtarlar: mağaza başına en fazla 60 ürün jsonb'de saklanır. */
export type SnapItem = {
  h: string; // handle
  t: string; // başlık
  img: string | null;
  p: number | null; // fiyat
  cp: number | null; // indirim öncesi fiyat
  c: string | null; // mağazaya eklenme
  a: number; // stokta olan varyant
  v: number; // toplam varyant
  ali: boolean; // AliExpress görseli
  f: string; // ilk görüldüğü gün
  so: number; // stok azalma sayısı (iki kontrol arasında stokta olan varyant azaldı)
  pc: number; // fiyat değişim sayısı
  pp: number | null; // önceki fiyat
  ld: string | null; // son hareket günü
};

export type SnapEvents = { newProducts: number; stockDrops: number; priceChanges: number };

export const SNAPSHOT_LIMIT = 60;

/** Hareket sırası: stok azalması, fiyat değişimi, en yeni ürün. */
export function movementOrder(a: SnapItem, b: SnapItem): number {
  return b.so - a.so || b.pc - a.pc || (b.ld ?? "").localeCompare(a.ld ?? "") || (b.c ?? "").localeCompare(a.c ?? "");
}

export function mergeSnapshot(prev: SnapItem[] | null, products: StoreProduct[], day: string): { items: SnapItem[]; events: SnapEvents } {
  const old = new Map((prev ?? []).map((i) => [i.h, i]));
  const events: SnapEvents = { newProducts: 0, stockDrops: 0, priceChanges: 0 };
  const items = products.map((p): SnapItem => {
    const o = old.get(p.handle);
    const base: SnapItem = {
      h: p.handle,
      t: clip(p.title, 160),
      img: p.image,
      p: p.price,
      cp: p.compareAt,
      c: p.createdAt,
      a: p.availableVariants,
      v: p.totalVariants,
      ali: Boolean(p.aliImageId),
      f: o?.f ?? (prev ? day : (p.createdAt?.slice(0, 10) ?? day)),
      so: o?.so ?? 0,
      pc: o?.pc ?? 0,
      pp: o?.pp ?? null,
      ld: o?.ld ?? null,
    };
    if (!o) {
      if (prev) {
        events.newProducts++;
        base.ld = day;
      }
      return base;
    }
    // Aynı varyant yapısında stokta olan varyant azaldıysa satış işareti.
    if (o.v === p.totalVariants && p.availableVariants < o.a) {
      base.so++;
      base.ld = day;
      events.stockDrops++;
    }
    if (o.p !== null && p.price !== null && Math.abs(o.p - p.price) >= 0.01) {
      base.pc++;
      base.pp = o.p;
      base.ld = day;
      events.priceChanges++;
    }
    return base;
  });
  return { items: items.sort(movementOrder).slice(0, SNAPSHOT_LIMIT), events };
}
