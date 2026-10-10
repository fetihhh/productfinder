import Link from "next/link";
import { connection } from "next/server";
import { Kpi } from "@/components/DetailSections";
import { ageLabel, formatPrice } from "@/lib/format";
import { getSummary, type SummaryProduct, type SummaryStore } from "@/lib/summary";

function Section({ title, note, href, children }: { title: string; note: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {href && (
          <Link href={href} className="shrink-0 text-sm text-blue-600 hover:underline dark:text-blue-400">
            Tümü →
          </Link>
        )}
      </div>
      <p className="mb-3 text-xs text-zinc-500">{note}</p>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500">{text}</p>;
}

function Row({ href, image, title, sub, right }: { href: string; image: string | null; title: string; sub: React.ReactNode; right: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
          {image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-zinc-500">{sub}</span>
        </span>
        <span className="shrink-0 text-right text-xs">{right}</span>
      </Link>
    </li>
  );
}

const storeSub = (s: SummaryStore) =>
  [s.domain, s.first_product_at ? `${ageLabel(s.first_product_at)} önce açıldı` : null, s.hero_price !== null ? formatPrice(Number(s.hero_price), s.currency) : null]
    .filter(Boolean)
    .join(" · ");

const productSub = (p: SummaryProduct) =>
  [
    p.brand_domain,
    p.supplier_min_usd !== null ? `toptan ${formatPrice(Number(p.supplier_min_usd), "USD")}${p.supplier_image_match ? " 📷" : ""}` : null,
    p.margin_ratio !== null ? `marj ≈ ${Number(p.margin_ratio).toLocaleString("tr-TR")}×` : null,
  ]
    .filter(Boolean)
    .join(" · ");

export default async function SummaryPage() {
  // Her istekte güncel veri (derleme anında önceden üretilmez).
  await connection();
  const s = await getSummary();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">← Ürünler</Link>
      <h1 className="mt-3 text-xl font-semibold">Özet</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Günlük işin en önemli sonuçları. Her satır ayrıntı sayfasına gider.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Son 24 saatte bulunan mağaza" value={s.counts.storesFound24h.toLocaleString("tr-TR")} sub="yeni kayıtlı alan adlarından" />
        <Kpi label="Son 7 günde açılan" value={s.counts.storesOpened7d.toLocaleString("tr-TR")} sub="ilk ürünü bu hafta" />
        <Kpi label="Açık yeni mağaza" value={s.counts.liveNew.toLocaleString("tr-TR")} sub="son 5 ayda açılmış" />
        <Kpi label="Son 24 saatte aday ürün" value={s.counts.candidates24h.toLocaleString("tr-TR")} sub="tüm kaynaklardan" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="En çok satış hareketi olan yeni mağazalar" note="Kontroller arasında stokta olan varyant sayısı en çok azalan mağazalar (satış işareti)." href="/yeni?sort=moving">
          {s.movers.length === 0 ? (
            <Empty text="Henüz yok: ürün bazında hareket ikinci kontrolden itibaren sayılır." />
          ) : (
            <ul className="space-y-1">
              {s.movers.map((m) => (
                <Row
                  key={m.domain}
                  href={`/m/${m.domain}`}
                  image={m.hero_image}
                  title={m.shop_name ?? m.domain}
                  sub={storeSub(m)}
                  right={
                    <span className="font-medium text-rose-700 dark:text-rose-400">
                      📉 {m.stock_drops}
                      <br />
                      <span className="text-zinc-500">{m.moving_products} ürün</span>
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Birden çok mağazanın sattığı ürünler" note="Aynı ürünü (aynı fotoğraf ya da AliExpress görseli) satan bağımsız yeni mağazalar. Aynı satıcının ağları hariç." href="/yeni?sort=copies">
          {s.copied.length === 0 ? (
            <Empty text="Henüz bağımsız rakip kümesi yok; veri biriktikçe çıkacak." />
          ) : (
            <ul className="space-y-1">
              {s.copied.map((m) => (
                <Row
                  key={m.domain}
                  href={`/yeni?group=${encodeURIComponent(m.copy_group ?? m.domain)}&age=150`}
                  image={m.hero_image}
                  title={m.hero_title ?? m.domain}
                  sub={storeSub(m)}
                  right={<span className="font-medium text-violet-700 dark:text-violet-400">{m.copy_count + 1} mağaza</span>}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="En yüksek winner skorlu ürünler" note="Doğrulanmış ürünler: talep, ivme, trafik, gündem, fiyat, tedarik, reklam, stok hareketi ve rakip mağaza." href="/?sort=winner">
          {s.winners.length === 0 ? (
            <Empty text="Henüz doğrulanmış ürün yok." />
          ) : (
            <ul className="space-y-1">
              {s.winners.map((p) => (
                <Row
                  key={p.id}
                  href={`/p/${p.id}`}
                  image={p.image_url}
                  title={p.name}
                  sub={productSub(p)}
                  right={<span className="rounded bg-amber-500 px-1.5 py-0.5 font-medium text-white">{Number(p.winner_score).toFixed(0)}</span>}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Toptancıda hızla satan ürünler" note="Asıl toptan ilanın (AliExpress) haftalık satış artışı; ürünü satan tüm mağazaların toplam talebi. Hız ikinci ölçümden (≥ 6 gün) sonra görünür.">
          {s.supplierHot.length === 0 ? (
            <Empty text="Henüz toptancı satış verisi yok." />
          ) : (
            <ul className="space-y-1">
              {s.supplierHot.map((p) => (
                <Row
                  key={p.id}
                  href={`/p/${p.id}`}
                  image={p.image_url}
                  title={p.name}
                  sub={productSub(p)}
                  right={
                    <span>
                      <strong>{(p.supplier_sold ?? 0).toLocaleString("tr-TR")}</strong> satış
                      {p.supplier_sold_per_week !== null && (
                        <>
                          <br />
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">+{Number(p.supplier_sold_per_week).toLocaleString("tr-TR")}/hafta</span>
                        </>
                      )}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Reklamı artan mağazalar" note="Son 14 günde yeni reklam açan mağazalar ve markalar (Meta Reklam Kütüphanesi).">
          {s.adsRising.length === 0 ? (
            <Empty text="Henüz veri yok: Meta anahtarı eklendikten sonra dolacak (README → Reklam sinyali)." />
          ) : (
            <ul className="space-y-1">
              {s.adsRising.map((a) => (
                <Row
                  key={a.domain}
                  href={`/?q=${encodeURIComponent(a.domain)}&status=all`}
                  image={null}
                  title={a.page_name ?? a.domain}
                  sub={`${a.domain}${a.longest_active_days !== null ? ` · en eski reklam ${a.longest_active_days} gün` : ""}`}
                  right={
                    <span>
                      <strong>+{a.new_ads_14d}</strong> yeni
                      <br />
                      <span className="text-zinc-500">{a.active_ads} yayında</span>
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
