import Link from "next/link";
import { AdPlayer, ViewerButton } from "@/components/AdPlayer";
import { CopyButton } from "@/components/CopyButton";
import { AdStageBadge } from "@/components/DetailSections";
import { TimingBadge } from "@/components/ui";
import { adLibraryAdUrl } from "@/dtc/adLibrary";
import { nicheLabel } from "@/dtc/niche";
import type { GalleryAd } from "@/lib/adGallery";
import { compact } from "@/lib/format";

const PLATFORM: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network", threads: "Threads", whatsapp: "WhatsApp" };

/** Çok tutan bir Meta reklam metni: yayındaki kopya, süre, erişim, platformlar; Reklam Kütüphanesi bağlantısı ve kopyalama. */
export function AdCard({ a }: { a: GalleryAd }) {
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="flex gap-3 border-b border-line p-3.5">
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-muted ring-1 ring-line">
          {a.image && <img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/m/${a.domain}`} className="block truncate text-sm font-semibold hover:underline">
            {a.productTitle ?? a.shopName ?? a.domain}
          </Link>
          <div className="truncate text-xs text-muted">
            {a.domain}
            {a.niche && a.niche !== "other" ? ` · ${nicheLabel(a.niche)}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <AdStageBadge stage={a.stage} score={a.adScore} />
            <TimingBadge timing={a.timing} hideUnproven />
          </div>
        </div>
      </div>
      {a.media && (
        <div className="border-b border-line bg-surface-muted p-2">
          <AdPlayer m={a.media} className="max-h-[520px]" />
          <p className="mt-1 px-1 text-[11px] text-muted">Instagram&apos;daki aynı gönderi · metin %{Math.round(a.media.match * 100)} eşleşiyor</p>
        </div>
      )}
      <div className="flex flex-1 flex-col p-3.5">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl bg-surface-muted px-2 py-1.5" title="Bu metinle yayında olan reklam (kopya) sayısı">
            <div className="text-[10px] tracking-wide text-muted uppercase">Yayında</div>
            <div className="text-sm font-semibold tabular-nums">
              {a.active}/{a.count}
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-2 py-1.5" title="Bu metnin ilk yayına girdiğinden beri geçen süre">
            <div className="text-[10px] tracking-wide text-muted uppercase">Süre</div>
            <div className="text-sm font-semibold tabular-nums">{a.days !== null ? `${a.days} gün` : "—"}</div>
          </div>
          <div className="rounded-xl bg-surface-muted px-2 py-1.5" title="AB'deki toplam erişim">
            <div className="text-[10px] tracking-wide text-muted uppercase">Erişim</div>
            <div className="text-sm font-semibold tabular-nums">{a.reach ? compact(a.reach) : "—"}</div>
          </div>
        </div>
        {a.title && <p className="mt-3 text-sm font-semibold">{a.title}</p>}
        <p className="mt-1 line-clamp-5 text-sm whitespace-pre-line">{a.text}</p>
        {a.platforms.length > 0 && <p className="mt-2 text-xs text-muted">{a.platforms.map((p) => PLATFORM[p] ?? p).join(" · ")}</p>}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {a.media?.url && (
            <a href={`/medya/${encodeURIComponent(a.media.postId)}`} className="btn btn-sm btn-primary" title="Videoyu/görseli indir">
              ⬇ İndir
            </a>
          )}
          {a.adId && <ViewerButton adId={a.adId} primary={!a.media} label={a.media ? "▶ Meta önizlemesi" : "▶ Videoyu izle"} />}
          {a.adId && (
            <a href={adLibraryAdUrl(a.adId)} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              Kütüphane ↗
            </a>
          )}
          <CopyButton text={[a.title, a.text].filter(Boolean).join("\n\n")} />
          {a.productUrl && (
            <a href={a.productUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              Ürün sayfası ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
