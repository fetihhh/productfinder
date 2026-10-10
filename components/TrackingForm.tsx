import { saveTracking } from "@/app/actions";
import type { ProductRow } from "@/lib/products";

/** Takip durumu, not ve Türkiye alanları. */
export function TrackingForm({ productId, t }: { productId: string; t: ProductRow["tracking"] }) {
  return (
    <form action={saveTracking} className="mt-2 space-y-2">
      <input type="hidden" name="product_id" value={productId} />
      <select name="status" defaultValue={t?.status ?? ""} className="field" aria-label="Takip durumu">
        <option value="">Takip yok</option>
        <option value="favorite">Favori</option>
        <option value="review">İncelenecek</option>
        <option value="rejected">Elendi</option>
      </select>
      <textarea name="note" defaultValue={t?.note ?? ""} rows={2} placeholder="Not" className="field" />
      <input name="tr_competitor" defaultValue={t?.tr_competitor ?? ""} placeholder="Türkiye'de rakip var mı?" className="field" />
      <input name="tr_est_cost" defaultValue={t?.tr_est_cost ?? ""} placeholder="Tahmini maliyet" className="field" />
      <textarea name="tr_note" defaultValue={t?.tr_note ?? ""} rows={2} placeholder="Türkiye notu" className="field" />
      <button className="btn btn-sm w-full">Kaydet</button>
    </form>
  );
}
