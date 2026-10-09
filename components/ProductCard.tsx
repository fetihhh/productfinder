import Link from "next/link";
import { TrackingForm } from "@/components/TrackingForm";
import { WIDE_PENDING } from "@/dtc/verify";
import { availabilityLabel, countryLabel, formatPrice, launchLabel, rangeLabel } from "@/lib/format";
import type { ProductRow } from "@/lib/products";

export const STATUS: Record<ProductRow["dtc_status"], { label: string; cls: string }> = {
  verified: { label: "Doğrulandı", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected_marketplace: { label: "Pazaryerinde", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  rejected_big_brand: { label: "Büyük marka", cls: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  unverified: { label: "Doğrulanmadı", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

const TRACK: Record<string, { label: string; cls: string }> = {
  favorite: { label: "★ Favori", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  review: { label: "İncelenecek", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  rejected: { label: "Elendi", cls: "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-800" },
};

export const SOURCE_NAMES: Record<string, string> = {
  coolthings: "Cool Things",
  thegadgeteer: "The Gadgeteer",
  theawesomer: "The Awesomer",
  thisiswhyimbroke: "This Is Why I'm Broke",
};

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
const badge = "rounded px-1.5 py-0.5 text-xs font-medium";
/** Bu yükseliş skorunun üstündeki ürünlere "Yükselişte" rozeti. */
export const RISING_BADGE = 40;

/** Satışa dair işaretler: fiyat, yorum, stok, çıkış tarihi, mağaza ülkesi, Türkiye'ye gönderim. */
function SalesFacts({ p }: { p: ProductRow }) {
  const price = formatPrice(p.price, p.currency);
  const availability = availabilityLabel(p.availability);
  const launch = launchLabel(p.launched_at);
  const country = p.brands?.country;
  const tr = p.brands?.ships_to_tr;
  const facts: [string, string, string?][] = [];
  if (price) facts.push(["Fiyat", p.variant_count && p.variant_count > 1 ? `${price}'den` : price]);
  if (p.review_count !== null) {
    facts.push([
      "Yorum",
      p.review_count > 0 ? `★ ${p.rating !== null ? Number(p.rating).toFixed(1) : "–"} · ${p.review_count.toLocaleString("tr-TR")}` : "henüz yok",
      "Yorum sayısı satış hacmine en iyi yaklaşımdır",
    ]);
  }
  if (availability) facts.push(["Stok", availability]);
  if (launch) facts.push(["Satışta", launch, "Mağazada yayınlanma tarihi"]);
  if (country) facts.push(["Mağaza", countryLabel(country)]);
  if (tr !== null && tr !== undefined) facts.push(["Türkiye", tr ? "Gönderim var" : "Gönderim yok", "Mağazanın gönderim ülkeleri listesinden"]);
  if (p.supplier_count !== null) {
    facts.push(
      p.supplier_min_usd !== null
        ? ["Toptan", `${formatPrice(p.supplier_min_usd, "USD")}'den · ${p.supplier_count} ilan`, "AliExpress / Alibaba / Made-in-China'da benzer ürünlerin en düşük birim fiyatı"]
        : ["Toptan", p.supplier_count ? `${p.supplier_count} benzer ilan (fiyat yok)` : "benzeri bulunamadı", "Toptancı araması"],
    );
  }
  if (p.margin_ratio !== null) facts.push(["Marj", `≈ ${Number(p.margin_ratio).toLocaleString("tr-TR")}×`, "Perakende fiyat / en düşük toptan fiyat (kargo, gümrük ve vergi hariç)"]);
  const w = p.winner_breakdown;
  if (w?.visits) facts.push(["Trafik", `≈ ${rangeLabel(w.visits)} ziyaret/ay`, `Tranco sırası #${w.rank?.toLocaleString("tr-TR")} → kaba tahmin`]);
  else if (w && p.brands?.tranco_rank === null) facts.push(["Trafik", "< ~100 B ziyaret/ay", "Site Tranco ilk 1 milyonunda değil"]);
  if (w?.momentum?.reviewGrowth) {
    facts.push(["Büyüme", `+%${Math.round(w.momentum.reviewGrowth * 100)} yorum/ay`, `Ayda ${w.reviewsPerMonth} yeni yorum`]);
  }
  if (w?.salesPerMonth) facts.push(["Satış/ay", `≈ ${rangeLabel(w.salesPerMonth)} adet`, "Son 30 günde eklenen yorumlardan (yorum × 10–50)"]);
  else if (w?.sales) facts.push(["Satış", `≈ ${rangeLabel(w.sales)} adet (toplam)`, "Yorum sayısı × 10–50 (alıcıların %2–10'u yorum bırakır)"]);
  if (facts.length === 0) return null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {facts.map(([k, v, title]) => (
        <div key={k} className="contents" title={title}>
          <dt className="text-zinc-500">{k}</dt>
          <dd
            className={
              (k === "Türkiye" && tr) || (k === "Marj" && Number(p.margin_ratio) >= 3)
                ? "font-medium text-emerald-700 dark:text-emerald-400"
                : ""
            }
          >
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProductCard({ p }: { p: ProductRow }) {
  const href = p.product_url ?? `https://${p.brand_domain}`;
  const b = p.score_breakdown;
  const w = p.winner_breakdown?.parts;
  const scoreTitle = [
    w ? `Winner: talep ${w.talep} + ivme ${w.ivme} + trafik ${w.trafik} + gündem ${w.gundem} + fiyat ${w.fiyat}` : null,
    b ? `Trend ${Number(p.trend_score).toFixed(0)}: kaynak ${b.parts.kaynak} + artış ${b.parts.artis} + hacim ${b.parts.hacim} (${b.sources} kaynak · 7 gün ${b.m7} · 30 gün ${b.m30})` : null,
  ].filter(Boolean).join("\n");
  const t = p.tracking;

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <a href={href} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {p.image_url && (
          <img src={p.image_url} alt={p.name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${badge} ${STATUS[p.dtc_status].cls}`}>{STATUS[p.dtc_status].label}</span>
          {p.brands?.platform && p.brands.platform !== "unknown" && (
            <span className={`${badge} bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300`}>{p.brands.platform}</span>
          )}
          {t?.status && <span className={`${badge} ${TRACK[t.status].cls}`}>{TRACK[t.status].label}</span>}
          {p.dtc_status === "verified" && p.dtc_reason?.startsWith(WIDE_PENDING) && (
            <span title={WIDE_PENDING} className={`${badge} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`}>Kısmi kontrol</span>
          )}
          {Number(p.momentum_score) >= RISING_BADGE && (
            <span title="Yükseliş skoru: yorum artış hızı + trafik sırası iyileşmesi + bu haftaki blog gündemi" className={`${badge} bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300`}>
              ↗ Yükselişte {Number(p.momentum_score).toFixed(0)}
            </span>
          )}
          <span title={scoreTitle} className={`${badge} ml-auto cursor-help bg-amber-500 text-white dark:bg-amber-400 dark:text-zinc-900`}>
            Winner {Number(p.winner_score).toFixed(0)}
          </span>
        </div>

        <h2 className="font-medium leading-snug">
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.name}</a>
        </h2>
        <a href={`https://${p.brand_domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {p.brand_domain} ↗
        </a>

        <SalesFacts p={p} />
        <Link href={`/p/${p.id}`} className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">
          Grafikler ve detay →
        </Link>

        {p.dtc_reason && (
          <p title={p.dtc_reason} className="line-clamp-3 text-xs text-zinc-500">{p.dtc_reason}</p>
        )}

        <p className="text-xs text-zinc-500">
          {p.mentions.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" title={m.title ?? undefined} className="mr-2 hover:underline">
              {SOURCE_NAMES[m.source] ?? m.source} · {dateFmt.format(new Date(m.posted_at))}
            </a>
          ))}
        </p>

        <details className="mt-auto border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400">
            Takip ve Türkiye notu{t?.note || t?.tr_competitor || t?.tr_est_cost || t?.tr_note ? " •" : ""}
          </summary>
          <TrackingForm productId={p.id} t={t} />
        </details>
      </div>
    </article>
  );
}
