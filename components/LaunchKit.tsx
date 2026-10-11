import { AdList } from "@/components/AdList";
import { CopyButton } from "@/components/CopyButton";
import { ANGLE_LABELS, anglesOf, turkishDrafts } from "@/dtc/adCopy";
import { turkeyTargeting } from "@/dtc/audience";
import type { ProductOffer } from "@/dtc/offers";
import type { AdItemView } from "@/dtc/adItems";
import type { AdSignalRow } from "@/lib/ads";
import { countryLabel } from "@/lib/format";

const PLATFORM: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network", threads: "Threads", whatsapp: "WhatsApp" };
const pct = (x: number) => `%${Math.round(x * 100)}`;

function Bar({ label, share, tone = "from-amber-400 to-orange-500" }: { label: string; share: number; tone?: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <span className={`block h-full rounded-full bg-linear-to-r ${tone}`} style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
      </span>
      <span className="text-right font-semibold tabular-nums">{pct(share)}</span>
    </div>
  );
}

/** Türkiye kampanyası için hedefleme: kazanan reklamların gerçek kitlesinden. */
function Targeting({ ads }: { ads: AdSignalRow }) {
  const a = ads.audience;
  if (!a) {
    return (
      <div className="rounded-2xl border border-line p-4 text-sm text-muted">
        Kitle dökümü henüz yok: reklamlar bir sonraki reklam aramasında yaş ve cinsiyet dökümüyle yeniden okunacak.
      </div>
    );
  }
  const t = turkeyTargeting(a);
  const known = a.female + a.male;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-line p-4">
        <h3 className="text-sm font-semibold">Kazanan reklamların kitlesi</h3>
        <p className="mt-0.5 text-xs text-muted">
          {a.ads} reklamın AB erişim dökümü · {a.total.toLocaleString("tr-TR")} kişi
        </p>
        {known > 0 && (
          <div className="mt-3 space-y-1.5">
            <Bar label="Kadın" share={a.female / known} tone="from-pink-400 to-rose-500" />
            <Bar label="Erkek" share={a.male / known} tone="from-sky-400 to-blue-500" />
          </div>
        )}
        <div className="mt-3 space-y-1.5">
          {a.ages.map((x) => (
            <Bar key={x.range} label={x.range} share={x.share} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {a.platforms.map((p) => (
            <span key={p.name} className="chip py-0.5">
              {PLATFORM[p.name] ?? p.name} {pct(p.share)}
            </span>
          ))}
        </div>
        {a.countries.length > 0 && (
          <p className="mt-2 text-xs text-muted">En çok: {a.countries.map((c) => `${countryLabel(c.code)} ${pct(c.share)}`).join(" · ")}</p>
        )}
      </div>
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <h3 className="text-sm font-semibold">🇹🇷 Reklam Yöneticisi ayarları (öneri)</h3>
        <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted">Konum</dt>
          <dd className="font-medium">Türkiye</dd>
          <dt className="text-muted">Yaş</dt>
          <dd className="font-medium">
            {t.ageMin}–{t.ageMax ?? "65+"}
            {a.core && <span className="ml-1 text-xs font-normal text-muted">(erişimin {pct(a.core.share)}&apos;i)</span>}
          </dd>
          <dt className="text-muted">Cinsiyet</dt>
          <dd>
            <span className="font-medium">{t.gender}</span>
            <span className="block text-xs text-muted">{t.genderNote}</span>
          </dd>
          <dt className="text-muted">Yerleşim</dt>
          <dd className="font-medium">{t.placements.join(", ")}</dd>
        </dl>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
          {t.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Ürün/mağaza sayfası: Türkiye lansman kiti (hedefleme + Türkçe reklam metinleri). */
export function LaunchKit({ ads, product, storeOffer }: { ads: AdSignalRow | null; product: string; storeOffer: ProductOffer | null }) {
  if (!ads || ads.total_ads === 0) return null;
  const texts = (ads.creatives ?? []).map((c) => [c.title, c.text].filter(Boolean).join(" "));
  const angles = anglesOf(texts);
  const drafts = turkishDrafts({ product, angles, adOffers: ads.ad_offers, storeOffer });
  return (
    <>
      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="card-title">Türkiye lansman kiti</h2>
          {angles.length > 0 && <span className="text-xs text-muted">Kazanan reklamların açısı: {angles.map((a) => ANGLE_LABELS[a]).join(", ")}</span>}
        </div>
        <p className="card-note mb-4">
          Rakibin AB&apos;de kazanan reklamlarının kime gösterildiğinden Türkiye hedeflemesi ve Türkçe reklam metni taslakları. Taslaklardaki [köşeli] yerleri
          ürünün gerçek faydasıyla doldurun; yalnızca gerçekten verdiğiniz teklifleri yazın.
        </p>
        <Targeting ads={ads} />

        {ads.copy_tr?.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-sm font-semibold">Kazanan reklamın Türkçesi (makine çevirisi)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {ads.copy_tr.map((c) => (
                <div key={c.text} className="flex flex-col rounded-2xl border border-line p-4">
                  <p className="text-sm whitespace-pre-line">{c.tr}</p>
                  <details className="mt-2 text-xs text-muted">
                    <summary className="cursor-pointer">Özgün metin ({c.lang})</summary>
                    <p className="mt-1 whitespace-pre-line">{c.text}</p>
                  </details>
                  <div className="mt-auto pt-3">
                    <CopyButton text={c.tr} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 className="mt-6 mb-2 text-sm font-semibold">Türkçe reklam metni taslakları</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {drafts.map((d) => (
            <div key={d.angle} className="flex flex-col rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="badge bg-surface-muted text-foreground">{d.label}</span>
                {angles.includes(d.angle as never) && <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">rakip bunu kullanıyor</span>}
              </div>
              <p className="mt-2 text-xs text-muted">
                İlk 3 saniye: <span className="font-medium text-foreground">{d.hook}</span>
              </p>
              <p className="mt-2 text-sm whitespace-pre-line">{d.primary}</p>
              <p className="mt-2 text-xs text-muted">
                Başlık: <span className="font-medium text-foreground">{d.headline}</span>
              </p>
              <div className="mt-auto flex gap-1.5 pt-3">
                <CopyButton text={d.primary} label="Metni kopyala" />
                <CopyButton text={d.headline} label="Başlığı kopyala" />
              </div>
            </div>
          ))}
        </div>
      </section>

    </>
  );
}

/** Sitenin tüm Meta reklamları (sıralanabilir liste). */
export function AdItemsSection({
  items,
  libraryUrl,
  title = "Bu sitenin reklamları",
  note,
}: {
  items: AdItemView[];
  libraryUrl: string;
  title?: string;
  note?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">
          {title} ({items.length})
        </h2>
        <a href={libraryUrl} target="_blank" rel="noopener noreferrer" className="link text-sm">
          Tümü Reklam Kütüphanesi&apos;nde ↗
        </a>
      </div>
      {note && <p className="mb-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm">{note}</p>}
      <p className="card-note mb-4">
        Son 150 günde AB&apos;de yayınlanan reklamlar. &quot;En çok tutan&quot; sırası: yayında olan reklam önce, yayında kalma süresi (kârsız reklam birkaç günde
        kapatılır), aynı metnin yayındaki kopya sayısı (ölçekleme) ve erişim. &quot;▶ Videoyu izle&quot; reklamın videosunu/görselini ekranın sağındaki izleme
        penceresinde açar (Facebook önizlemenin sayfaya gömülmesine izin vermez); sıradaki reklama basınca aynı pencere ona geçer.
      </p>
      <AdPages items={items} />
      <AdList items={items} />
    </section>
  );
}

/** Reklam veren Facebook sayfaları: dropshipping mağazaları reklamı çoğu zaman birden çok sayfadan yayınlar. */
function AdPages({ items }: { items: AdItemView[] }) {
  const by = new Map<string, { id: string | null; name: string; ads: number; active: number; first: string | null; last: string | null }>();
  for (const i of items) {
    const key = i.page_id ?? i.page_name ?? "?";
    const e = by.get(key) ?? { id: i.page_id, name: i.page_name ?? "Bilinmeyen sayfa", ads: 0, active: 0, first: null, last: null };
    e.ads++;
    if (i.active) e.active++;
    if (i.start_at && (!e.first || i.start_at < e.first)) e.first = i.start_at;
    if (i.start_at && (!e.last || i.start_at > e.last)) e.last = i.start_at;
    by.set(key, e);
  }
  const pages = [...by.values()].sort((a, b) => b.active - a.active || b.ads - a.ads);
  if (pages.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-semibold">Reklam veren sayfalar ({pages.length})</h3>
      <div className="flex flex-wrap gap-2">
        {pages.map((p) => (
          <a
            key={p.id ?? p.name}
            href={p.id ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(p.id)}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-line px-3 py-2 text-sm transition hover:border-amber-500/60"
          >
            <span className="font-medium">{p.name}</span>
            <span className="ml-2 text-xs text-muted">
              {p.active} yayında / {p.ads} reklam{p.first ? ` · ${p.first.slice(0, 10)} → ${p.last?.slice(0, 10)}` : ""}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
