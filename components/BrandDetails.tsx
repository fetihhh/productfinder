import { weightLabel, type ProductDetail } from "@/dtc/productDetail";
import { ageLabel, countryLabel, formatPrice } from "@/lib/format";
import type { StoreExtras } from "@/lib/newStores";
import type { NetworkStore } from "@/lib/stores";


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function Chips({ items, tone = "" }: { items: string[]; tone?: string }) {
  if (items.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((x) => (
        <span key={x} className={`chip py-0.5 ${tone}`}>
          {x}
        </span>
      ))}
    </span>
  );
}

const SOURCE: Record<string, string> = { whoisds: "Yeni kayıtlı alan adı listesi", nrd60: "Yeni kayıtlı alan adı listesi", reklam: "Meta Reklam Kütüphanesi (reklamından)" };

/** Marka künyesi: kuruluş, katalog, reklam kanalları (izleme kodları), uygulamalar, ödeme, iletişim, kargo/iade vaadi. */
export function BrandCard({ s }: { s: StoreExtras }) {
  const t = s.tech;
  const adChannels = (t?.pixels ?? []).filter((p) => !/Analytics|Hotjar|Clarity|Klaviyo/.test(p));
  const insight = [
    adChannels.length > 0 && `Reklam kanalları: ${adChannels.map((p) => p.replace(/ pikseli| etiketi/, "")).join(", ")}`,
    t?.shippingDays && t.shippingDays[1] >= 10 && `teslimat ${t.shippingDays[0]}–${t.shippingDays[1]} gün (Çin'den gönderim işareti)`,
    (t?.cod.length || t?.codText) && "kapıda ödeme sunuyor",
    t?.upsell.length && `paket/upsell uygulaması (${t.upsell.join(", ")})`,
    t?.reviews.length && `yorumlar ${t.reviews.join(", ")} ile`,
  ].filter(Boolean);
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Marka künyesi</h2>
        {s.tech_at && <span className="text-xs text-muted">Ana sayfa {ageLabel(s.tech_at)} önce okundu</span>}
      </div>
      <p className="card-note mb-4">
        Mağazanın ana sayfasından: hangi reklam ve izleme kodları kurulu (o kanalda reklam veriyor ya da vermeye hazırlanıyor), hangi uygulamaları
        kullanıyor, nasıl ödeme alıyor, ne vaat ediyor. Kendi mağazanızı kurarken aynı araçları ve vaatleri örnek alabilirsiniz.
      </p>
      {insight.length > 0 && <p className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm">{insight.join(" · ")}.</p>}
      <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
        <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <Row label="Mağaza">{s.shop_name ?? s.domain}</Row>
          <Row label="Ülke / para">{[s.country ? countryLabel(s.country) : null, s.currency].filter(Boolean).join(" · ") || "—"}</Row>
          <Row label="Alan adı kaydı">
            {s.registered_on ? `${s.registered_on} (${ageLabel(s.registered_on)} önce)` : "—"}
            {s.registrar ? <span className="block text-xs text-muted">{s.registrar}</span> : null}
          </Row>
          <Row label="İlk ürün">{s.first_product_at ? `${s.first_product_at.slice(0, 10)} (${ageLabel(s.first_product_at)} önce)` : "—"}</Row>
          <Row label="Katalog">
            {s.product_count ?? "?"} ürün
            {s.min_price !== null && s.max_price !== null ? ` · ${formatPrice(Number(s.min_price), s.currency)}–${formatPrice(Number(s.max_price), s.currency)}` : ""}
          </Row>
          <Row label="Nasıl bulundu">{(s.source && SOURCE[s.source]) ?? s.source ?? "—"}</Row>
          <Row label="Tema">{t?.theme ?? "—"}</Row>
          <Row label="Diller">{t?.languages.length ? t.languages.join(", ").toUpperCase() : "—"}</Row>
          <Row label="Sosyal">
            <Chips items={t?.socials ?? []} />
          </Row>
        </dl>
        <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <Row label="Reklam / izleme">
            <Chips items={t?.pixels ?? []} tone="border-sky-500/40" />
          </Row>
          <Row label="Yorum uygulaması">
            <Chips items={t?.reviews ?? []} />
          </Row>
          <Row label="Kapıda ödeme">{t?.cod.length ? <Chips items={t.cod} /> : t?.codText ? "Metinde geçiyor" : "—"}</Row>
          <Row label="Upsell / paket">
            <Chips items={t?.upsell ?? []} />
          </Row>
          <Row label="Ödeme">
            <Chips items={t?.payments ?? []} />
          </Row>
          <Row label="Canlı destek">
            <Chips items={t?.chat ?? []} />
          </Row>
          <Row label="Teslimat vaadi">{t?.shippingDays ? `${t.shippingDays[0]}–${t.shippingDays[1]} gün` : "—"}</Row>
          <Row label="İade vaadi">{t?.returnDays ? `${t.returnDays} gün` : "—"}</Row>
          <Row label="İletişim">
            {[t?.email, t?.phone, t?.whatsapp ? `WhatsApp +${t.whatsapp}` : null].filter(Boolean).join(" · ") || "—"}
          </Row>
        </dl>
      </div>
      {!t && <p className="mt-3 text-xs text-muted">Ana sayfa henüz okunmadı; bir sonraki kontrolde ya da &quot;detay&quot; çalıştırmasında dolar.</p>}
    </section>
  );
}

/** Ürün ayrıntıları: fotoğraflar, seçenekler, varyant tablosu (fiyat, stok, ağırlık, tükendiği gün), açıklama maddeleri. */
export function ProductDetailsCard({ d, currency, url }: { d: ProductDetail; currency: string | null; url: string | null }) {
  const sold = d.soldOut ?? {};
  const grams = d.variants.map((v) => v.grams).filter((g): g is number => g !== null);
  const avail = d.variants.filter((v) => v.available).length;
  const soldList = Object.entries(sold).sort((a, b) => a[1].localeCompare(b[1]));
  const translate = d.text ? `https://translate.google.com/?sl=auto&tl=tr&op=translate&text=${encodeURIComponent(d.text.slice(0, 1800))}` : null;
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Ürün ayrıntıları</h2>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="link text-sm">
            Ürün sayfası ↗
          </a>
        )}
      </div>
      <p className="card-note mb-4">
        Mağazanın ürün verisinden. Kontroller arasında stoğu biten varyant &quot;tükendi&quot; olarak işaretlenir: ilk tükenen renk/beden genelde en çok
        satandır.
        {d.first ? ` İzleme ${d.first} tarihinden beri.` : ""}
      </p>

      {d.images.length > 0 && (
        <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
          {d.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-muted">
              <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              Stokta <b>{avail}</b>/{d.variants.length} varyant
            </span>
            {grams.length > 0 && (
              <span>
                Ağırlık <b>{weightLabel(Math.min(...grams))}</b>
                {Math.max(...grams) !== Math.min(...grams) ? `–${weightLabel(Math.max(...grams))}` : ""}
              </span>
            )}
            {d.options.map((o) => (
              <span key={o.name} className="text-muted">
                {o.name}: {o.values.length}
              </span>
            ))}
          </div>
          {soldList.length > 0 && (
            <p className="mb-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm">
              🔥 Tükenen: {soldList.map(([t, day]) => `${t} (${day.slice(5)})`).join(", ")}
            </p>
          )}
          <div className="max-h-80 overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 font-medium">Varyant</th>
                  <th className="px-3 py-2 font-medium">Fiyat</th>
                  <th className="px-3 py-2 font-medium">Stok</th>
                  <th className="px-3 py-2 font-medium">Ağırlık</th>
                </tr>
              </thead>
              <tbody>
                {d.variants.map((v, i) => (
                  <tr key={`${v.title}-${i}`} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5">{v.title || "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {v.price !== null ? formatPrice(v.price, currency) : "—"}
                      {v.compareAt !== null && <span className="ml-1 text-xs text-muted line-through">{formatPrice(v.compareAt, currency)}</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {v.available ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Var</span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400">Tükendi{sold[v.title] ? ` · ${sold[v.title].slice(5)}` : ""}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted tabular-nums">{weightLabel(v.grams) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Açıklamada öne çıkanlar</h3>
          {d.bullets.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {d.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Madde bulunamadı.</p>
          )}
          {translate && (
            <a href={translate} target="_blank" rel="noopener noreferrer" className="btn btn-sm mt-3">
              Açıklamayı Türkçeye çevir ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/** Aynı satıcının diğer mağazaları: aynı reklam pikseli, Google Ads/GTM, e-posta ya da WhatsApp. */
export function SellerNetwork({ stores }: { stores: NetworkStore[] }) {
  if (stores.length === 0) return null;
  return (
    <section className="card mt-5 p-5">
      <h2 className="card-title">Aynı satıcının diğer mağazaları ({stores.length})</h2>
      <p className="card-note mb-4">
        Ana sayfasında aynı reklam pikseli, Google Ads/Etiket Yöneticisi kimliği, e-posta ya da WhatsApp numarası olan mağazalar. Kazanan bir satıcının
        test ettiği diğer ürünler buradadır; kapanan mağazalar tutmayan testlerdir.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stores.map((s) => (
          <a key={s.domain} href={`/m/${s.domain}`} className="flex gap-3 rounded-xl border border-line p-3 transition hover:border-amber-500/60">
            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-1 ring-line">
              {s.hero_image && <img src={s.hero_image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium">{s.hero_title ?? s.shop_name ?? s.domain}</span>
              <span className="block truncate text-xs text-muted">
                {s.domain} · {s.status === "live" ? "açık" : s.status === "dead" || s.status === "closed" ? "kapandı" : s.status}
                {s.total_score !== null ? ` · puan ${Math.round(Number(s.total_score))}` : ""}
                {s.first_product_at ? ` · ${ageLabel(s.first_product_at)} önce açıldı` : ""}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {s.reasons.map((r) => (
                  <span key={r} className="badge bg-violet-600/15 text-violet-700 dark:text-violet-300">
                    {r}
                  </span>
                ))}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
