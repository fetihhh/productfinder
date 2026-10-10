"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

const TRACK_STATUSES = new Set(["favorite", "review", "rejected"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string, max: number): string | null {
  const v = String(formData.get(key) ?? "").trim().slice(0, max);
  return v || null;
}

/** Karttaki hızlı düğmeler: yalnızca takip durumunu değiştirir (notlar korunur). Aynı duruma tekrar basmak kaldırır. */
export async function quickTrack(formData: FormData) {
  await requireSession();
  const productId = String(formData.get("product_id") ?? "");
  if (!UUID.test(productId)) throw new Error("Geçersiz ürün");
  const status = String(formData.get("status") ?? "");
  const current = String(formData.get("current") ?? "");
  const next = TRACK_STATUSES.has(status) && status !== current ? status : null;
  const { error } = await db()
    .from("tracking")
    .upsert({ product_id: productId, status: next, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
  if (error) throw new Error(`Kaydedilemedi: ${error.message}`);
  refresh();
}

/** Takip durumu, not ve Türkiye uygunluk alanlarını kaydeder. */
export async function saveTracking(formData: FormData) {
  await requireSession();
  const productId = String(formData.get("product_id") ?? "");
  if (!UUID.test(productId)) throw new Error("Geçersiz ürün");

  const status = String(formData.get("status") ?? "");
  const { error } = await db()
    .from("tracking")
    .upsert(
      {
        product_id: productId,
        status: TRACK_STATUSES.has(status) ? status : null,
        note: text(formData, "note", 2000),
        tr_competitor: text(formData, "tr_competitor", 300),
        tr_est_cost: text(formData, "tr_est_cost", 100),
        tr_note: text(formData, "tr_note", 2000),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id" },
    );
  if (error) throw new Error(`Kaydedilemedi: ${error.message}`);
  refresh();
}
