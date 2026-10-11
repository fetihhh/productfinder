import { CopyButton } from "@/components/CopyButton";
import { ageLabel, compact } from "@/lib/format";
import { isGiveaway } from "@/dtc/instagram";
import type { IgPostRow } from "@/lib/instagram";

/** Instagram gönderisi: görsel/video, beğeni, yorum, hesabın ortancasına göre kaç kat tuttuğu, indirme ve açma. */
export function IgPostCard({ p, showStore = true }: { p: IgPostRow; showStore?: boolean }) {
  const video = p.media_type === "VIDEO";
  const preview = video ? (p.thumb_url ?? null) : p.media_url;
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[4/5] bg-surface-muted">
        {video && p.media_url ? (
          <video src={p.media_url} poster={preview ?? undefined} controls preload="none" playsInline className="h-full w-full object-cover" />
        ) : preview ? (
          <img src={preview} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">Önizleme yok</div>
        )}
        <span className="absolute top-2 left-2 badge bg-black/70 text-white shadow-sm">
          {video ? (p.product_type === "REELS" ? "▶ Reels" : "▶ Video") : p.media_type === "CAROUSEL_ALBUM" ? "▦ Albüm" : "◻ Görsel"}
        </span>
        {isGiveaway(p.caption) && (
          <span className="absolute top-10 left-2 badge bg-violet-600 text-white shadow-sm" title="Çekiliş: yorumlar katılım koşulu, gerçek ilgiyi abartır">
            🎁 Çekiliş
          </span>
        )}
        {p.outlier >= 2 && (
          <span className="absolute top-2 right-2 badge bg-orange-600 text-white shadow-sm" title="Hesabın ortalama (ortanca) gönderisine göre kaç kat etkileşim aldı">
            🔥 {p.outlier.toLocaleString("tr-TR")}×
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-center gap-3 text-sm font-semibold tabular-nums">
          <span title="Beğeni">♥ {p.likes !== null ? compact(p.likes) : "gizli"}</span>
          <span title="Yorum">💬 {p.comments !== null ? compact(p.comments) : "—"}</span>
          {p.followers ? <span className="text-xs font-normal text-muted">{compact(p.followers)} takipçi</span> : null}
        </div>
        {showStore && (
          <div className="mt-1 truncate text-xs text-muted">
            <a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noopener noreferrer" className="hover:underline">
              @{p.username}
            </a>
            {p.domain && (
              <>
                {" · "}
                <a href={`/m/${p.domain}`} className="hover:underline">
                  {p.domain}
                </a>
              </>
            )}
            {p.posted_at && ` · ${ageLabel(p.posted_at)} önce`}
          </div>
        )}
        {p.caption && <p className="mt-2 line-clamp-3 text-sm">{p.caption}</p>}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {p.media_url && (
            <a href={`/medya/${p.id}`} className="btn btn-sm btn-primary" title="Görseli/videoyu indir">
              İndir
            </a>
          )}
          {p.permalink && (
            <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              Instagram&apos;da aç ↗
            </a>
          )}
          {p.caption && <CopyButton text={p.caption} />}
        </div>
      </div>
    </article>
  );
}

/** Mağaza/ürün sayfası: mağazanın Instagram hesabındaki en çok etkileşim alan gönderiler. */
export function InstagramSection({ data }: { data: { account: { username: string; followers: number | null; error: string | null } | null; posts: IgPostRow[] } }) {
  if (!data.account) return null;
  const { account, posts } = data;
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Instagram gönderileri</h2>
        <a href={`https://www.instagram.com/${account.username}/`} target="_blank" rel="noopener noreferrer" className="link text-sm">
          @{account.username}
          {account.followers ? ` · ${compact(account.followers)} takipçi` : ""} ↗
        </a>
      </div>
      <p className="card-note mb-4">Hesabın görsel gönderileri etkileşime göre (beğeni + 3 × yorum; videolar yukarıda). 🔥 = hesabın ortalama gönderisinin kaç katı.</p>
      {posts.length === 0 ? (
        <p className="text-sm text-muted">{account.error ? `Okunamadı: ${account.error}` : "Gönderi yok."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {posts.map((p) => (
            <IgPostCard key={p.id} p={p} showStore={false} />
          ))}
        </div>
      )}
    </section>
  );
}
