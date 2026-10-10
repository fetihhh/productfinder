// Instagram gönderisinin görselini/videosunu indirir. Adres yalnızca veritabanındaki kayıttan alınır (Business Discovery
// API'sinin döndürdüğü CDN adresi); dışarıdan adres kabul edilmez. Yalnızca kullanıcı tıkladığında tek istek atılır.
import { igMedia } from "@/lib/instagram";
import { requireSession } from "@/lib/session";

const ALLOWED = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

export async function GET(_req: Request, ctx: RouteContext<"/medya/[id]">) {
  await requireSession();
  const { id } = await ctx.params;
  if (!/^\d{5,30}$/.test(id)) return new Response("Geçersiz kimlik", { status: 400 });
  const m = await igMedia(id);
  if (!m) return new Response("Gönderi bulunamadı", { status: 404 });
  let host: string;
  try {
    host = new URL(m.url).hostname;
  } catch {
    return new Response("Geçersiz adres", { status: 400 });
  }
  if (!ALLOWED.test(host)) return new Response("İzin verilmeyen adres", { status: 400 });
  const upstream = await fetch(m.url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "ProductFinder/1.0" } });
  if (!upstream.ok || !upstream.body) {
    return new Response("Dosya alınamadı (bağlantının süresi dolmuş olabilir; bir sonraki günlük işte yenilenir).", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const type = upstream.headers.get("content-type") ?? (m.video ? "video/mp4" : "image/jpeg");
  const ext = type.includes("mp4") ? "mp4" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : m.video ? "mp4" : "jpg";
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${m.username.replace(/[^\w.-]/g, "_")}-${id}.${ext}"`,
    "Cache-Control": "private, no-store",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(upstream.body, { headers });
}
