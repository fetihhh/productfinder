import { IgPostCard } from "@/components/IgPostCard";
import { TikTokEmbed } from "@/components/TikTokEmbed";
import type { IgPostRow } from "@/lib/instagram";

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
        <h2 className="card-title">Videolar</h2>
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
        indirilebilir. Fikir ve açı için kullanın: başkasının videosunu olduğu gibi yayınlamak telif hakkını ihlal eder.
      </p>

      {igVideos.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold">Instagram</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
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
