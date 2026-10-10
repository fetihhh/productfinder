import Link from "next/link";
import { connection } from "next/server";
import { AdCard } from "@/components/AdCard";
import { IgPostCard } from "@/components/IgPostCard";
import { Toggle } from "@/components/ui";
import { NICHES } from "@/dtc/niche";
import { galleryAds } from "@/lib/adGallery";
import { topIgPosts, type InstagramState } from "@/lib/instagram";
import { getJobState } from "@/lib/stores";
import { db } from "@/lib/db";

export const metadata = { title: "Reklamlar" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";


function IgNotice({ state, empty }: { state: InstagramState | null; empty: boolean }) {
  if (state?.status === "ok" && !empty) return null;
  const box = "mt-5 rounded-2xl border p-4 text-sm";
  if (!state || state.status === "no_permission" || state.status === "no_account" || state.status === "no_token") {
    return (
      <div className={`${box} border-amber-400/60 bg-amber-500/5`}>
        <p className="font-semibold">Instagram gönderileri için bir kerelik kurulum gerekiyor</p>
        <p className="mt-1 text-muted">
          {state?.status === "no_account"
            ? "Meta anahtarınızın Facebook sayfalarına bağlı bir Instagram profesyonel hesabı bulunamadı."
            : state?.status === "no_permission"
              ? "Meta anahtarında Instagram izni yok."
              : "Instagram adımı henüz çalışmadı."}{" "}
          Resmi Instagram API&apos;si başka hesapların gönderilerini yalnızca sizin de bir Instagram profesyonel hesabınız varsa verir (ücretsiz):
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Instagram uygulaması → Ayarlar → Hesap türü → <b>Profesyonel hesaba geç</b> (İşletme ya da İçerik üreticisi).</li>
          <li>Bir Facebook sayfası açın (ücretsiz) ve Instagram hesabını bu sayfaya bağlayın (Sayfa ayarları → Bağlı hesaplar → Instagram).</li>
          <li>
            Graph API Explorer&apos;da uygulamanızı seçin → izinlere <code>instagram_basic</code>, <code>instagram_manage_insights</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>,{" "}
            <code>business_management</code> ekleyin → <b>Generate Access Token</b> → Access Token Debugger&apos;da <b>Extend</b>.
          </li>
          <li>
            Yeni anahtarı <code>META_ACCESS_TOKEN</code> olarak GitHub&apos;a kaydedin (reklam araması da aynı anahtarla çalışmaya devam eder).
          </li>
        </ol>
        {state?.reason && <p className="mt-2 text-xs text-muted">Son hata: {state.reason}</p>}
      </div>
    );
  }
  return (
    <p className={`${box} border-line bg-surface text-muted`}>
      Son çalıştırmada {state.checked ?? 0} Instagram hesabı okundu, {state.found ?? 0} tanesinde çok tutan gönderi var. Hesaplar mağaza ana sayfasındaki Instagram
      bağlantısından bulunur; mağazalar yeniden kontrol edildikçe liste büyür.
    </p>
  );
}

export default async function AdsGalleryPage({ searchParams }: PageProps<"/reklamlar">) {
  await connection();
  const sp = await searchParams;
  const tab = one(sp.tab) === "ig" ? "ig" : "meta";
  const niche = one(sp.niche).replace(/[^a-z]/g, "").slice(0, 20);
  const all = one(sp.all) === "1";
  const video = one(sp.video) === "1";
  const days = [30, 90, 365].includes(Number(one(sp.days))) ? Number(one(sp.days)) : 90;

  let nicheDomains: string[] | null = null;
  if (tab === "ig" && niche) {
    const { data } = await db().from("stores").select("domain").eq("niche", niche).not("instagram", "is", null).limit(2000);
    nicheDomains = (data ?? []).map((d) => d.domain as string);
  }
  const [ads, posts, igState] = await Promise.all([
    tab === "meta" ? galleryAds({ niche, activeOnly: !all, limit: 60 }) : Promise.resolve([]),
    tab === "ig" ? topIgPosts({ days, video, domains: nicheDomains, limit: 60 }) : Promise.resolve([]),
    getJobState<InstagramState>("instagram"),
  ]);
  const tabLink = (t: string) => `/reklamlar?tab=${t}${niche ? `&niche=${niche}` : ""}`;

  return (
    <main className="page">
      <p className="eyebrow">Kreatif araştırma</p>
      <h1 className="h1 mt-1">Çok tutan reklamlar</h1>
      <p className="lead">
        Meta Reklam Kütüphanesi&apos;nde uzun süredir yayında olan ve çok kopyalanan reklamlar ile mağazaların Instagram hesaplarında ortalamanın çok üstünde
        etkileşim alan gönderiler. Fikir ve açı bulmak için kullanın: başkasının görselini ya da videosunu olduğu gibi yayınlamak telif hakkını ihlal eder.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line bg-surface p-1">
          {[
            ["meta", "Meta reklamları"],
            ["ig", "Instagram gönderileri"],
          ].map(([k, l]) => (
            <Link key={k} href={tabLink(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${tab === k ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}>
              {l}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <select name="niche" defaultValue={niche} className="field w-48" aria-label="Niş">
            <option value="">Tüm nişler</option>
            {NICHES.map((n) => (
              <option key={n.key} value={n.key}>
                {n.label}
              </option>
            ))}
            <option value="other">Diğer</option>
          </select>
          {tab === "meta" ? (
            <Toggle name="all" checked={all} label="Durmuş reklamlar da" />
          ) : (
            <>
              <select name="days" defaultValue={String(days)} className="field w-36" aria-label="Dönem">
                <option value="30">Son 30 gün</option>
                <option value="90">Son 90 gün</option>
                <option value="365">Son 1 yıl</option>
              </select>
              <Toggle name="video" checked={video} label="Yalnızca video/Reels" />
            </>
          )}
          <button className="btn btn-sm btn-primary">Uygula</button>
        </form>
      </div>

      {tab === "meta" ? (
        <>
          <p className="mt-4 text-xs text-muted">
            Meta&apos;nın ücretsiz API&apos;si reklamın metnini, süresini ve erişimini verir ama görsel/video dosyasını vermez (facebook.com sayfaları otomatik
            okunamaz). Görselde reklamı verilen ürünün fotoğrafı gösterilir; reklamın kendisini &quot;Reklamı aç&quot; ile Reklam Kütüphanesi&apos;nde izleyebilirsiniz.
          </p>
          {ads.length === 0 ? (
            <p className="card mt-5 p-6 text-sm text-muted">Bu filtrede reklam yok.</p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {ads.map((a, i) => (
                <AdCard key={`${a.domain}-${a.adId ?? i}`} a={a} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <IgNotice state={igState} empty={posts.length === 0} />
          {posts.length > 0 ? (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {posts.map((p) => (
                <IgPostCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            igState?.status === "ok" && <p className="card mt-5 p-6 text-sm text-muted">Bu filtrede çok tutan gönderi yok.</p>
          )}
        </>
      )}
    </main>
  );
}
