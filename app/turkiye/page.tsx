import Link from "next/link";
import { connection } from "next/server";
import { ageLabel, formatPrice } from "@/lib/format";
import { trProducts, trStores, type TrProduct } from "@/lib/turkey";

export const metadata = { title: "Türkiye" };

const tl = (n: number) => n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

function ProductRow({ p }: { p: TrProduct }) {
  const listings = p.tr_listings ?? [];
  const prices = listings.map((l) => l.price).filter((n): n is number => n !== null).sort((a, b) => a - b);
  return (
    <li className="flex gap-3 rounded-xl border border-line p-3">
      <Link href={`/p/${p.id}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-1 ring-line">
        {p.image_url && <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/p/${p.id}`} className="block truncate text-sm font-semibold hover:underline">
          {p.name}
        </Link>
        <p className="truncate text-xs text-muted">
          {p.brand_domain} · winner {Math.round(p.winner_score)}
          {p.price !== null ? ` · ${formatPrice(p.price, p.currency)}` : ""}
          {p.tr_checked_at ? ` · ${ageLabel(p.tr_checked_at)} önce arandı` : ""}
        </p>
        {listings.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {listings.slice(0, 4).map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="chip py-0.5 text-xs hover:border-amber-500/60" title={l.title}>
                {l.site}
                {l.price !== null ? ` · ${tl(l.price)}` : ""}
              </a>
            ))}
            {prices.length > 0 && <span className="text-xs text-muted">ortanca {tl(prices[Math.floor((prices.length - 1) / 2)])}</span>}
          </div>
        )}
      </div>
    </li>
  );
}

export default async function TurkeyPage() {
  await connection();
  const [{ sold, open, checked }, { stores, shipsToTr }] = await Promise.all([trProducts(), trStores()]);
  return (
    <main className="page">
      <p className="eyebrow">Türkiye pazarı</p>
      <h1 className="h1 mt-1">Türkiye&apos;de satılanlar ve fırsatlar</h1>
      <p className="lead">
        Doğrulanmış ve takip edilen ürünler Türk pazaryerlerinde (Trendyol, Hepsiburada, n11, Amazon TR, Çiçeksepeti, Pazarama, Akakçe, Cimri) aranır.
        Benzer ilanı olmayan winner&apos;lar Türkiye&apos;de henüz rakibi olmayan ürünlerdir. Şimdiye kadar {checked} ürün arandı; her gün yenileri eklenir.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="card-title">✅ Türkiye&apos;de rakibi yok ({open.length})</h2>
          <p className="card-note mb-4">Türk pazaryerlerinde benzer ilan bulunamayan ürünler, winner skoruna göre.</p>
          {open.length === 0 ? (
            <p className="text-sm text-muted">Henüz yok.</p>
          ) : (
            <ul className="space-y-2">
              {open.slice(0, 40).map((p) => (
                <ProductRow key={p.id} p={p} />
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="card-title">🇹🇷 Türkiye&apos;de satılıyor ({sold.length})</h2>
          <p className="card-note mb-4">Türk pazaryerlerinde benzer ilanı olan ürünler: fiyatları ve siteleri. Rakibin fiyatı kendi fiyatınız için referanstır.</p>
          {sold.length === 0 ? (
            <p className="text-sm text-muted">Henüz yok.</p>
          ) : (
            <ul className="space-y-2">
              {sold.slice(0, 40).map((p) => (
                <ProductRow key={p.id} p={p} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="card-title">Türk mağazaları ({stores.length})</h2>
          <Link href="/yeni?tr=1" className="link text-sm">
            Türkiye&apos;ye gönderen {shipsToTr} yeni mağaza →
          </Link>
        </div>
        <p className="card-note mb-4">Yeni mağaza keşfinde bulunan, ülkesi Türkiye ya da para birimi TL olan açık mağazalar.</p>
        {stores.length === 0 ? (
          <p className="text-sm text-muted">Henüz yok.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stores.map((s) => (
              <Link key={s.domain} href={`/m/${s.domain}`} className="flex gap-3 rounded-xl border border-line p-3 transition hover:border-amber-500/60">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-1 ring-line">
                  {s.hero_image && <img src={s.hero_image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-medium">{s.hero_title ?? s.shop_name ?? s.domain}</span>
                  <span className="block truncate text-xs text-muted">
                    {s.domain} · puan {Math.round(Number(s.total_score))}
                    {s.hero_price !== null ? ` · ${formatPrice(Number(s.hero_price), s.currency)}` : ""}
                    {s.first_product_at ? ` · ${ageLabel(s.first_product_at)} önce açıldı` : ""}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
