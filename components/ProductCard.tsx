import Link from "next/link";
import { quickTrack } from "@/app/actions";
import { TrackingForm } from "@/components/TrackingForm";
import { AdStageBadge } from "@/components/DetailSections";
import { ScoreRing, Stat, TimingBadge } from "@/components/ui";
import type { AdStage } from "@/dtc/adAnalysis";
import { WIDE_PENDING } from "@/dtc/verify";
import { ageLabel, availabilityLabel, countryLabel, formatPrice, launchLabel, rangeLabel } from "@/lib/format";
import type { ProductRow } from "@/lib/products";

export const STATUS: Record<ProductRow["dtc_status"], { label: string; cls: string; dot: string }> = {
  verified: { label: "Doğrulandı", cls: "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300", dot: "bg-emerald-500" },
  rejected_marketplace: { label: "Pazaryerinde", cls: "bg-red-500/12 text-red-700 ring-1 ring-red-500/25 dark:text-red-300", dot: "bg-red-500" },
  rejected_big_brand: { label: "Büyük marka", cls: "bg-orange-500/12 text-orange-700 ring-1 ring-orange-500/25 dark:text-orange-300", dot: "bg-orange-500" },
  unverified: { label: "Doğrulanmadı", cls: "bg-zinc-500/12 text-zinc-600 ring-1 ring-zinc-500/20 dark:text-zinc-300", dot: "bg-zinc-400" },
};

const TRACK: Record<string, { label: string; cls: string }> = {
  favorite: { label: "★ Favori", cls: "bg-amber-500 text-white" },
  review: { label: "İncelenecek", cls: "bg-sky-600 text-white" },
  rejected: { label: "Elendi", cls: "bg-zinc-600 text-white" },
};

export const SOURCE_NAMES: Record<string, string> = {
  coolthings: "Cool Things",
  thegadgeteer: "The Gadgeteer",
  theawesomer: "The Awesomer",
  thisiswhyimbroke: "This Is Why I'm Broke",
  yenimagaza: "Yeni mağaza keşfi",
};

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
/** Bu yükseliş skorunun üstündeki ürünlere "Yükselişte" rozeti. */
export const RISING_BADGE = 40;

/** Winner skorunun en çok katkı veren bileşenleri (kendi azami puanına oranla), kısa gerekçe etiketleri olarak. */
const WINNER_PARTS: { key: keyof NonNullable<ProductRow["winner_breakdown"]>["parts"]; max: number; label: (p: ProductRow) => string }[] = [
  { key: "talep", max: 25, label: (p) => (p.review_count ? `${p.review_count.toLocaleString("tr-TR")} yorum` : "Tedarikçide çok satıyor") },
  { key: "ivme", max: 20, label: () => "Satışı hızlanıyor" },
  { key: "trafik", max: 15, label: () => "Site trafiği" },
  { key: "gundem", max: 10, label: () => "Bloglarda gündemde" },
  { key: "fiyat", max: 10, label: () => "Uygun fiyat bandı" },
  { key: "tedarik", max: 20, label: (p) => (p.margin_ratio ? `Marj ${Number(p.margin_ratio).toLocaleString("tr-TR")}×` : "Toptancısı var") },
  { key: "reklam", max: 15, label: () => "Reklam veriyor" },
  { key: "hareket", max: 10, label: () => "📉 Stok hareketi" },
  { key: "kopya", max: 10, label: (p) => `${p.copy_count} rakip mağaza` },
];

function WinnerReasons({ p }: { p: ProductRow }) {
  const parts = p.winner_breakdown?.parts;
  if (!parts) return null;
  const top = WINNER_PARTS.map((w) => ({ ...w, ratio: Number(parts[w.key] ?? 0) / w.max }))
    .filter((w) => w.ratio >= 0.4)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
  if (top.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1" title="Winner skoruna en çok katkı veren bileşenler">
      {top.map((w) => (
        <span key={w.key} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-500/20 dark:text-amber-300">
          {w.label(p)}
        </span>
      ))}
    </div>
  );
}

/** Ek ölçümler: yorum, stok, yaş, ülke, Türkiye, tedarikçi satışı, rakip, reklam, trafik, satış tahmini. */
function SalesFacts({ p }: { p: ProductRow }) {
  const availability = availabilityLabel(p.availability);
  const country = p.brands?.country;
  const tr = p.brands?.ships_to_tr;
  const facts: [string, string, string?, boolean?][] = [];
  if (p.review_count !== null) {
    facts.push([
      "Yorum",
      p.review_count > 0 ? `★ ${p.rating !== null ? Number(p.rating).toFixed(1) : "–"} · ${p.review_count.toLocaleString("tr-TR")}` : "henüz yok",
      "Yorum sayısı satış hacmine en iyi yaklaşımdır",
    ]);
  }
  if (availability) facts.push(["Stok", availability]);
  const opened = [p.brands?.first_product_at, p.brands?.registered_at].filter((d): d is string => Boolean(d)).sort().at(-1) ?? null;
  if (opened) facts.push(["Mağaza yaşı", `${ageLabel(opened)} (${launchLabel(opened)})`, "Mağazadaki ilk ürün ya da alan adı kaydı (hangisi daha yeniyse)"]);
  if (country) facts.push(["Ülke", countryLabel(country)]);
  if (tr !== null && tr !== undefined) facts.push(["Türkiye", tr ? "Gönderim var" : "Gönderim yok", "Mağazanın gönderim ülkeleri listesinden", tr]);
  if (p.supplier_sold) {
    facts.push([
      "Tedarikçi",
      `${p.supplier_sold.toLocaleString("tr-TR")} satış${p.supplier_sold_per_week ? ` · +${Number(p.supplier_sold_per_week).toLocaleString("tr-TR")}/hafta` : ""}`,
      "Asıl toptan ilanın (AliExpress) toplam satışı ve haftalık artışı: ürünü satan tüm mağazaların talebi",
    ]);
  }
  if (p.copy_count > 0) facts.push(["Rakip", `${p.copy_count} yeni mağaza daha`, "Aynı ürün fotoğrafı ya da AliExpress görseliyle satan diğer yeni mağazalar"]);
  const ads = p.brands?.ads_active;
  if (ads) facts.push(["Reklam", `${ads} yayında`, "Meta Reklam Kütüphanesi (Facebook/Instagram, AB'de gösterilen reklamlar)", true]);
  const w = p.winner_breakdown;
  if (w?.visits) facts.push(["Trafik", `≈ ${rangeLabel(w.visits)}/ay`, `Tranco sırası #${w.rank?.toLocaleString("tr-TR")} → kaba tahmin`]);
  else if (w && p.brands?.tranco_rank === null) facts.push(["Trafik", "< ~100 B/ay", "Site Tranco ilk 1 milyonunda değil"]);
  if (w?.momentum?.reviewGrowth) facts.push(["Büyüme", `+%${Math.round(w.momentum.reviewGrowth * 100)} yorum/ay`, `Ayda ${w.reviewsPerMonth} yeni yorum`]);
  if (w?.salesPerMonth) facts.push(["Satış/ay", `≈ ${rangeLabel(w.salesPerMonth)} adet`, "Son 30 günde eklenen yorumlardan (yorum × 10–50)"]);
  else if (w?.sales) facts.push(["Satış", `≈ ${rangeLabel(w.sales)} adet`, "Yorum sayısı × 10–50 (alıcıların %2–10'u yorum bırakır)"]);
  if (facts.length === 0) return null;

  return (
    <dl className="facts">
      {facts.map(([k, v, title, good]) => (
        <div key={k} className="contents" title={title}>
          <dt>{k}</dt>
          <dd className={good ? "text-emerald-600 dark:text-emerald-400" : ""}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProductCard({ p, ad }: { p: ProductRow; ad?: { stage: AdStage; score: number } | null }) {
  const href = p.product_url ?? `https://${p.brand_domain}`;
  const b = p.score_breakdown;
  const w = p.winner_breakdown?.parts;
  const scoreTitle = [
    w
      ? `Winner: talep ${w.talep} + ivme ${w.ivme} + trafik ${w.trafik} + gündem ${w.gundem} + fiyat ${w.fiyat} + tedarik ${w.tedarik ?? 0} + reklam ${w.reklam ?? 0} + stok hareketi ${w.hareket ?? 0} + rakip ${w.kopya ?? 0}`
      : null,
    b ? `Trend ${Number(p.trend_score).toFixed(0)}: kaynak ${b.parts.kaynak} + artış ${b.parts.artis} + hacim ${b.parts.hacim} (${b.sources} kaynak · 7 gün ${b.m7} · 30 gün ${b.m30})` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const t = p.tracking;
  const price = formatPrice(p.price, p.currency);
  const partial = p.dtc_status === "verified" && p.dtc_reason?.startsWith(WIDE_PENDING);

  return (
    <article className="card card-hover group flex flex-col overflow-hidden">
      <div className="relative">
        <Link href={`/p/${p.id}`} className="block aspect-[4/3] overflow-hidden bg-surface-muted">
          {p.image_url ? (
            <img
              src={p.image_url}
              alt={p.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <span className="grid h-full place-items-center text-sm text-muted">Görsel yok</span>
          )}
        </Link>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <div className="flex flex-col items-start gap-1">
            <span className="badge bg-white/90 text-zinc-800 shadow-sm backdrop-blur dark:bg-zinc-900/85 dark:text-zinc-100">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS[p.dtc_status].dot}`} />
              {STATUS[p.dtc_status].label}
            </span>
            {partial && (
              <span title={WIDE_PENDING} className="badge pointer-events-auto bg-amber-100/95 text-amber-900 shadow-sm backdrop-blur dark:bg-amber-950/90 dark:text-amber-200">
                Kısmi kontrol
              </span>
            )}
            {ad && ad.stage !== "none" && <AdStageBadge stage={ad.stage} score={ad.score} />}
            <TimingBadge timing={p.timing} reason={p.timing_reason} hideUnproven />
            {Number(p.momentum_score) >= RISING_BADGE && (
              <span className="badge bg-rose-500 text-white shadow-sm">↗ Yükselişte {Number(p.momentum_score).toFixed(0)}</span>
            )}
          </div>
          <span className="pointer-events-auto">
            <ScoreRing score={Number(p.winner_score)} title={scoreTitle} />
          </span>
        </div>
        {t?.status && <span className={`badge absolute bottom-2.5 left-2.5 shadow-sm ${TRACK[t.status].cls}`}>{TRACK[t.status].label}</span>}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="line-clamp-2 leading-snug font-semibold tracking-tight">
            <Link href={`/p/${p.id}`} className="hover:text-brand-strong">
              {p.name}
            </Link>
          </h2>
          <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-muted hover:text-foreground">
            <span className="truncate">{p.brand_domain}</span>
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Fiyat" value={price ?? "—"} sub={p.variant_count && p.variant_count > 1 ? `${p.variant_count} varyant` : undefined} />
          <Stat
            label="Toptan"
            value={p.supplier_min_usd !== null ? formatPrice(p.supplier_min_usd, "USD")! : "—"}
            sub={p.supplier_min_usd !== null ? (p.supplier_image_match ? "📷 aynı foto" : `${p.supplier_count} ilan`) : p.supplier_checked_at ? "bulunamadı" : "aranacak"}
          />
          <Stat label="Marj" value={p.margin_ratio !== null ? `${Number(p.margin_ratio).toLocaleString("tr-TR")}×` : "—"} good={Number(p.margin_ratio) >= 3} sub="kargo hariç" />
        </div>

        <WinnerReasons p={p} />
        <SalesFacts p={p} />

        {p.dtc_reason && !partial && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer select-none hover:text-foreground">Doğrulama gerekçesi</summary>
            <p className="mt-1 leading-relaxed">{p.dtc_reason}</p>
          </details>
        )}

        {p.mentions.length > 0 && (
          <p className="flex flex-wrap gap-x-2 text-[11px] text-muted">
            {p.mentions.map((m) => (
              <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" title={m.title ?? undefined} className="hover:text-foreground">
                {SOURCE_NAMES[m.source] ?? m.source} · {dateFmt.format(new Date(m.posted_at))}
              </a>
            ))}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
          <form action={quickTrack} className="flex gap-1">
            <input type="hidden" name="product_id" value={p.id} />
            <input type="hidden" name="current" value={t?.status ?? ""} />
            {(
              [
                ["favorite", "★", "Favori", "bg-amber-500 text-white border-amber-500"],
                ["review", "İncele", "İncelenecek", "bg-sky-600 text-white border-sky-600"],
                ["rejected", "✕", "Ele", "bg-zinc-700 text-white border-zinc-700"],
              ] as const
            ).map(([value, label, title, on]) => (
              <button
                key={value}
                name="status"
                value={value}
                title={t?.status === value ? `${title} — kaldırmak için tekrar basın` : title}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  t?.status === value ? on : "border-line text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </form>
          <Link href={`/p/${p.id}`} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-strong hover:gap-1.5 transition-all">
            Detay
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 12h14m-5-5 5 5-5 5" />
            </svg>
          </Link>
        </div>

        <details className="-mt-1 text-xs">
          <summary className="cursor-pointer text-muted select-none hover:text-foreground">
            Not ve Türkiye notu{t?.note || t?.tr_competitor || t?.tr_est_cost || t?.tr_note ? " •" : ""}
          </summary>
          <TrackingForm productId={p.id} t={t} />
        </details>
      </div>
    </article>
  );
}
