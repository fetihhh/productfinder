// Favori ve incelenecek ürünlerin CSV dökümü (Excel'de açılır): fiyat, toptancı, marj, satış ve bağlantılar.
import { IMAGE_MATCH_MAX } from "@/config/limits";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

const COLUMNS = [
  ["Takip", "status"],
  ["Ürün", "name"],
  ["Mağaza", "brand_domain"],
  ["Ürün bağlantısı", "product_url"],
  ["Fiyat", "price"],
  ["Para birimi", "currency"],
  ["Winner", "winner_score"],
  ["Toptan en düşük (USD)", "supplier_min_usd"],
  ["Marj (×)", "margin_ratio"],
  ["Fotoğrafla eşleşen toptancı", "supplier_image_match"],
  ["Toptancı satışı", "supplier_sold"],
  ["Toptancı satışı / hafta", "supplier_sold_per_week"],
  ["Rakip mağaza", "copy_count"],
  ["Yorum", "review_count"],
  ["Toptancı 1", "supplier_1"],
  ["Toptancı 1 fiyat", "supplier_1_price"],
  ["Toptancı 2", "supplier_2"],
  ["Toptancı 2 fiyat", "supplier_2_price"],
  ["Not", "note"],
  ["Ürün sayfası", "detail"],
] as const;

/** CSV alanı (sayılar Türkçe ondalıkla): ayırıcı/tırnak/satır sonu içerirse tırnakla; Excel formül enjeksiyonuna karşı =,+,-,@ ile başlayanların önüne ' koy. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  // Türkçe Excel ondalık ayırıcı olarak virgül bekler.
  let s = typeof v === "boolean" ? (v ? "evet" : "hayır") : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  await requireSession();
  const { data, error } = await db()
    .from("products")
    .select(
      "id, name, brand_domain, product_url, price, currency, winner_score, supplier_min_usd, margin_ratio, supplier_image_match, supplier_sold, supplier_sold_per_week, copy_count, review_count, tracking!inner(status, note), suppliers(url, price_min, currency, similarity, image_distance)",
    )
    .in("tracking.status", ["favorite", "review"])
    .order("winner_score", { ascending: false });
  if (error) return new Response(`Veritabanı hatası: ${error.message}`, { status: 500 });

  const origin = new URL(request.url).origin;
  type Row = Record<string, unknown> & {
    id: string;
    tracking: { status: string; note: string | null } | { status: string; note: string | null }[];
    suppliers: { url: string; price_min: number | null; currency: string | null; similarity: number; image_distance: number | null }[];
  };
  const rows = (data as unknown as Row[]).map((p) => {
    const t = Array.isArray(p.tracking) ? p.tracking[0] : p.tracking;
    const sup = [...(p.suppliers ?? [])].sort((a, b) => Number(b.image_distance !== null && b.image_distance <= IMAGE_MATCH_MAX) - Number(a.image_distance !== null && a.image_distance <= IMAGE_MATCH_MAX) || Number(b.similarity) - Number(a.similarity));
    const values: Record<string, unknown> = {
      ...p,
      status: t?.status === "favorite" ? "Favori" : "İncelenecek",
      note: t?.note,
      supplier_1: sup[0]?.url,
      supplier_1_price: sup[0]?.price_min !== undefined && sup[0]?.price_min !== null ? `${sup[0].price_min} ${sup[0].currency ?? ""}`.trim() : null,
      supplier_2: sup[1]?.url,
      supplier_2_price: sup[1]?.price_min !== undefined && sup[1]?.price_min !== null ? `${sup[1].price_min} ${sup[1].currency ?? ""}`.trim() : null,
      detail: `${origin}/p/${p.id}`,
    };
    return COLUMNS.map(([, key]) => cell(values[key])).join(";");
  });
  // Türkçe Excel için ";" ayırıcı ve UTF-8 BOM (ç, ğ, ş doğru görünsün).
  const csv = "﻿" + [COLUMNS.map(([h]) => cell(h)).join(";"), ...rows].join("\r\n");
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="product-finder-secilenler-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
