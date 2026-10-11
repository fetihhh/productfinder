// Reklam önizlemesi: Meta Reklam Kütüphanesi API'sinin resmi önizleme sayfasına (render_ad: reklamın görseli/videosu)
// yönlendirir. Sayfa kullanıcının tarayıcısında açılır; sunucu facebook.com'u okumaz. Anahtar yalnızca giriş yapmış
// kullanıcının tarayıcısına, yönlendirme adresinde gider; kodda ve veritabanında tutulmaz.
import { requireSession } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/reklam/[id]">) {
  await requireSession();
  const { id } = await ctx.params;
  if (!/^\d{5,25}$/.test(id)) return new Response("Geçersiz reklam kimliği", { status: 400 });
  const token = process.env.META_ACCESS_TOKEN || process.env.META_ACCES_TOKEN;
  if (!token) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:16px;color:#555">Önizleme için Vercel'e META_ACCESS_TOKEN eklenmeli (README → Reklam önizlemesi). <a href="https://www.facebook.com/ads/library/?id=${id}" target="_blank" rel="noopener noreferrer">Reklam Kütüphanesi'nde aç</a></body>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  const url = `https://www.facebook.com/ads/archive/render_ad/?${new URLSearchParams({ id, access_token: token })}`;
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
