import { IgPostCard } from "@/components/IgPostCard";
import { TikTokEmbed } from "@/components/TikTokEmbed";
import type { IgPostRow } from "@/lib/instagram";
import type { TagPost } from "@/dtc/hashtags";
import type { HashtagState } from "@/lib/hashtags";
import { ageLabel, compact } from "@/lib/format";

/**
 * Ürün/mağaza sayfası: mağazanın videoları sitenin içinde oynatılır. Instagram videoları resmi Business Discovery
 * API'sinden (indirilebilir), TikTok videoları TikTok'un resmi profil gömmesiyle gelir.
 */
export function VideosSection({ data }: { data: { instagram: string | null; igVideos: IgPostRow[]; tiktok: string | null } }) {
  const { instagram, igVideos, tiktok } = data;
  if (igVideos.length === 0 && !tiktok) return null;
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Mağazanın kendi videoları (Instagram / TikTok)</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {instagram && (
            <a href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noopener noreferrer" className="link">
              Instagram @{instagram} ↗
            </a>
          )}
          {tiktok && (
            <a href={`https://www.tiktok.com/@${tiktok}`} target="_blank" rel="noopener noreferrer" className="link">
              TikTok @{tiktok} ↗
            </a>
          )}
        </div>
      </div>
      <p className="card-note mb-4">
        Mağazanın Instagram ve TikTok videoları; reklam videoları çoğu zaman burada da paylaşılır. Instagram videoları etkileşime göre sıralıdır ve
        indirilebilir (dosyası gelmeyenler Instagram oynatıcısıyla oynar). Fikir ve açı için kullanın: başkasının videosunu olduğu gibi yayınlamak telif hakkını ihlal eder.
      </p>

      {igVideos.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold">Instagram</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {igVideos.map((p) => (
              <IgPostCard key={p.id} p={p} showStore={false} />
            ))}
          </div>
        </>
      )}

      {tiktok && (
        <>
          <h3 className={`mb-2 text-sm font-semibold ${igVideos.length ? "mt-6" : ""}`}>TikTok</h3>
          <TikTokEmbed handle={tiktok} />
        </>
      )}
    </section>
  );
}

/** Bir etiket gönderisi: video sayfada oynar (dosya yoksa Instagram'ın resmi oynatıcısı), beğeni/yorum, etiket. */
function TagPostCard({ p }: { p: TagPost }) {
  const video = p.media_type === "VIDEO";
  const embed = !p.media_url && p.permalink ? `${p.permalink.replace(/\/$/, "")}/embed/` : null;
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className={`relative bg-surface-muted ${embed ? "h-[640px] bg-white" : "aspect-[4/5]"}`}>
        {embed ? (
          <iframe src={embed} title="Instagram gönderisi" loading="lazy" allowFullScreen scrolling="no" className="block h-full w-full border-0" />
        ) : video && p.media_url ? (
          <video src={p.media_url} controls preload="metadata" playsInline className="h-full w-full object-cover" />
        ) : p.media_url ? (
          <img src={p.media_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">Önizleme yok</div>
        )}
        {!embed && (
          <span className="absolute top-2 left-2 badge bg-black/70 text-white shadow-sm">{video ? "▶ Reels / video" : p.media_type === "CAROUSEL_ALBUM" ? "▦ Albüm" : "◻ Görsel"}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-center gap-3 text-sm font-semibold tabular-nums">
          <span title="Beğeni">♥ {p.likes !== null ? compact(p.likes) : "gizli"}</span>
          <span title="Yorum">💬 {p.comments !== null ? compact(p.comments) : "—"}</span>
          <span className="text-xs font-normal text-muted">#{p.tag}</span>
        </div>
        {p.posted_at && <span className="mt-0.5 text-xs text-muted">{ageLabel(p.posted_at)} önce</span>}
        {p.caption && <p className="mt-2 line-clamp-3 text-sm">{p.caption}</p>}
        {p.permalink && (
          <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="btn btn-sm mt-auto self-start">
            Instagram&apos;da aç ↗
          </a>
        )}
      </div>
    </article>
  );
}

/** Ürün sayfası: ürünün Instagram'da en çok tutan Reels'leri ve gönderileri (mağazadan bağımsız, tüm hesaplar). */
export function ProductTagPosts({ tags, posts, checkedAt, state }: { tags: string[] | null; posts: TagPost[] | null; checkedAt: string | null; state: HashtagState | null }) {
  const list = posts ?? [];
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Instagram&apos;da bu ürünün tutan Reels ve videoları</h2>
        {tags?.length ? (
          <span className="flex flex-wrap gap-2 text-sm">
            {tags.map((t) => (
              <a key={t} href={`https://www.instagram.com/explore/tags/${t}/`} target="_blank" rel="noopener noreferrer" className="link">
                #{t} ↗
              </a>
            ))}
          </span>
        ) : null}
      </div>
      <p className="card-note mb-4">
        Ürünün etiketlerinde Instagram&apos;ın en popüler gönderileri (tüm hesaplar: mağazalar, içerik üreticileri, reklam videoları). Videolar önce, etkileşime
        göre. Fikir ve açı için kullanın; başkasının videosunu olduğu gibi yayınlamak telif hakkını ihlal eder.
        {checkedAt ? ` Son arama ${ageLabel(checkedAt)} önce.` : ""}
      </p>
      {list.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <TagPostCard key={p.id} p={p} />
          ))}
        </div>
      ) : state?.status === "no_permission" ? (
        <div className="rounded-xl border border-amber-400/60 bg-amber-500/5 p-4 text-sm">
          <p className="font-semibold">Instagram etiket araması için Meta&apos;dan bir izin gerekiyor</p>
          <p className="mt-1 text-muted">
            Ürün etiketlerindeki popüler gönderileri veren Hashtag Search API&apos;si için Meta uygulamasında ek izin gerekiyor. İzin verilince bu bölüm
            kendiliğinden dolar.
          </p>
          {state.reason && <p className="mt-2 text-xs text-muted">Meta&apos;nın yanıtı: {state.reason}</p>}
        </div>
      ) : checkedAt ? (
        <p className="text-sm text-muted">Bu ürünün etiketlerinde gönderi bulunamadı{tags?.length ? "" : " (ürün adından etiket çıkarılamadı)"}.</p>
      ) : (
        <p className="text-sm text-muted">
          Henüz aranmadı. Instagram hesap başına haftada 30 etiket aramaya izin verdiği için ürünler sırayla aranır: önce favoriler ve reklamı tutan ürünler.
        </p>
      )}
    </section>
  );
}
