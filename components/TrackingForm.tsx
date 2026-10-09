import { saveTracking } from "@/app/actions";
import type { ProductRow } from "@/lib/products";

const input = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

/** Takip durumu, not ve Türkiye alanları. */
export function TrackingForm({ productId, t }: { productId: string; t: ProductRow["tracking"] }) {
  return (
    <form action={saveTracking} className="mt-2 space-y-2">
      <input type="hidden" name="product_id" value={productId} />
      <select name="status" defaultValue={t?.status ?? ""} className={input} aria-label="Takip durumu">
        <option value="">Takip yok</option>
        <option value="favorite">Favori</option>
        <option value="review">İncelenecek</option>
        <option value="rejected">Elendi</option>
      </select>
      <textarea name="note" defaultValue={t?.note ?? ""} rows={2} placeholder="Not" className={input} />
      <input name="tr_competitor" defaultValue={t?.tr_competitor ?? ""} placeholder="Türkiye'de rakip var mı?" className={input} />
      <input name="tr_est_cost" defaultValue={t?.tr_est_cost ?? ""} placeholder="Tahmini maliyet" className={input} />
      <textarea name="tr_note" defaultValue={t?.tr_note ?? ""} rows={2} placeholder="Türkiye notu" className={input} />
      <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">Kaydet</button>
    </form>
  );
}
