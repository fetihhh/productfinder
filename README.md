# Product Finder

**Küçük markaların** yalnızca kendi sitelerinde satılan (pazaryerlerinde ve büyük perakendecilerde olmayan) fiziksel trend ürünlerini bulan, ardından aynısının/muadilinin **toptancısını** (AliExpress, Alibaba, Made-in-China) ve kâr marjını gösteren tek kullanıcılı araç. Amaç: toptan alıp Türkiye'de satılabilecek ürünler. Aylık maliyet: **0 $**.

## Nasıl çalışır

```
GitHub Actions (her gün 05:00 UTC)  →  npm run ingest
  1) Ürün bloglarının RSS beslemeleri → aday ürünler (marka alan adı + ürün sayfası)
  1b) Tranco trafik sırası → büyük markalar (sıra ≤ #150.000) ağa çıkmadan elenir
  2) DTC doğrulama: platform, satın alma, fiziksel ürün, kotasız doğrudan pazaryeri araması (Amazon.com, AliExpress, Otto)
     + Tavily ile ~126 pazaryeri/perakendecide geniş arama (ürün + marka)
  3) Mağaza ülkesi, Türkiye'ye gönderim, fiyat, yorum sayısı/puanı, stok, çıkış tarihi
  4) Doğrulanmış ürünlerin günlük fiyat/yorum/stok ölçümü
  4b) Toptancı araması: AliExpress, Alibaba, Made-in-China → benzer ilanlar, toptan fiyat, MOQ, kâr marjı
  5) Trend, winner ve yükseliş skorları
Next.js (Vercel Hobby)  →  şifreli arayüz: arama, filtreler, kartlar, grafikli ürün sayfası, siteler/trafik tablosu, takip listesi
Supabase (Postgres)     →  tüm veriler; yalnızca sunucu tarafından gizli anahtarla erişilir
```

## Kurulum (yerel)

Gereksinimler: Node.js ≥ 22.18 (TypeScript ek araç olmadan doğrudan `node` ile çalışır), ücretsiz Supabase projesi, ücretsiz Tavily hesabı.

```bash
npm install
cp .env.example .env.local   # değerleri doldurun
```

1. Supabase SQL Editor'de `supabase/migrations/` altındaki dosyaları sırayla çalıştırın (`0001` → `0006`).
2. `.env.local` değişkenlerini doldurun (aşağıdaki tablo).
3. `npm run ingest` → ilk veriyi çeker ve doğrular.
4. `npm run dev` → http://localhost:3000 → `APP_PASSWORD` ile giriş.

### Ortam değişkenleri

| Değişken | Nerede | Açıklama |
|---|---|---|
| `APP_PASSWORD` | Vercel, yerel | Giriş şifresi |
| `AUTH_SECRET` | Vercel, yerel | Oturum imzası için uzun rastgele değer: `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` |
| `SUPABASE_URL` | Vercel, GitHub, yerel | Supabase → Project Settings → API |
| `SUPABASE_SECRET_KEY` | Vercel, GitHub, yerel | Supabase → API Keys → **secret** (`sb_secret_…`). RLS'i aşar, asla `NEXT_PUBLIC_` önekiyle tanımlamayın |
| `TAVILY_API_KEY` | GitHub, yerel | tavily.com ücretsiz hesap (kart istemez) |
| `TAVILY_DAILY_LIMIT` | isteğe bağlı | Tek seferlik toplu kontroller için günlük sınırı geçici olarak değiştirir (aylık 950 sınırı sabit) |
| `REDDIT_CLIENT_ID/SECRET` | — | Kullanılmıyor; Reddit API onayı alınırsa ileride |

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm test` | Birim testleri (`node --test`) |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run ingest` | Toplama + DTC doğrulama + trafik + satış ölçümü + skorlar (günlük iş) |
| `npm run ingest -- verify` | Toplama hariç hepsi |
| `npm run ingest -- recheck` | Ayrıca tüm `verified` ürünleri tarihe bakmadan yeniden kontrol eder (doğrulama kuralları değişince) |

## Ücretsiz katman limitleri

| Servis | Ücretsiz limit | Bu projedeki kullanım |
|---|---|---|
| **Supabase Free** | 500 MB veritabanı, 5 GB çıkış/ay, 2 aktif proje. 7 gün işlem olmazsa proje duraklar | Birkaç MB. Günlük iş projeyi aktif tutar |
| **GitHub Actions** (private repo) | 2.000 dakika/ay (public repoda sınırsız) | ~3–5 dk/gün ≈ 150 dk/ay. Public repolarda 60 gün commit olmazsa zamanlanmış iş durur |
| **Vercel Hobby** | 100 GB veri aktarımı, 1M fonksiyon çağrısı, 4 CPU-saat/ay; fonksiyon süresi 300 sn. **Yalnızca kişisel, ticari olmayan kullanım** | Tek kullanıcı, çok düşük trafik |
| **Tavily Free** | 1.000 kredi/ay, kart istemez (basic arama = 1 kredi) | Kod sınırı: günde 30, ayda 950. Kota dolarsa ürün ertesi güne kalır, ücretli kullanıma **asla** geçilmez |
| **Tranco top-1M listesi** (tranco-list.eu) | Ücretsiz, anahtar gerekmez; günlük ~10 MB zip | Günde 1 indirme. robots.txt `/api` ve `/list/` yollarını yasaklar, yalnızca izinli `/top-1m.csv.zip` kullanılır |
| **Doğrudan pazaryeri araması** (amazon.com, otto.de arama sayfaları) ve **toptancı araması** (aliexpress.com, alibaba.com/showroom, made-in-china.com) | Ücretsiz, anahtar ve kota yok | robots.txt bu arama yollarına izin veriyor; site başına 1 istek/sn. CAPTCHA/503 dönerse atlatılmaz, o site "okunamadı" sayılır |
| **RSS beslemeleri, Shopify `meta.json` / `products.json`, Yotpo yorum özeti** | Herkese açık, ücretsiz | robots.txt'ye uyularak, alan adı başına 1 istek/sn |

> Ürün ticari bir hizmete dönüşürse Vercel Hobby (ticari kullanım yasak), Tavily ve Product Hunt benzeri kaynakların koşulları değişir; bu durumda yeniden değerlendirilmeli.

## Deploy

### 1. GitHub (otomatik günlük iş)

```bash
gh auth login                          # bir kez
gh repo create productfinder --private --source . --push
gh secret set SUPABASE_URL             # değeri yapıştırın
gh secret set SUPABASE_SECRET_KEY
gh secret set TAVILY_API_KEY
```

İş akışı: `.github/workflows/daily-ingest.yml` (her gün 05:00 UTC = 08:00 TR). Elle çalıştırmak için GitHub → Actions → "Günlük toplama ve doğrulama" → **Run workflow**.

### 2. Vercel (arayüz)

1. vercel.com → **Add New Project** → GitHub'daki `productfinder` reposunu seçin (Hobby plan, kart gerekmez).
2. **Environment Variables:** `APP_PASSWORD`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
3. **Deploy.** Sonraki her `git push` otomatik deploy olur.

Toplama işi Vercel'de değil GitHub Actions'ta çalışır: alan adı başına 1 istek/sn kuralı nedeniyle iş dakikalar sürebilir.

## Veri kaynakları

Fiziksel ürün inceleyen blogların herkese açık RSS beslemeleri (`config/sources.ts`): Cool Things, The Gadgeteer, The Awesomer, This Is Why I'm Broke (küçük markalar ağırlıklı).

- Yazıdaki dış linklerden markanın kendi alan adı bulunur. Affiliate linklerinde hedef adres URL parametresinden okunur; yönlendirmeye istek atılmaz.
- Aynı blogun yazılarının en az %30'unda (en az 3 yazı) geçen alan adları site geneli (menü/sponsor) sayılıp atlanır.
- Yazı ürünü bir pazaryerinde gösteriyorsa ürün doğrudan `rejected_marketplace` olur.
- İşlenen yazılar `seen_items` tablosunda tutulur, tekrar açılmaz.
- Tüm istekler `lib/http.ts` üzerinden: robots.txt'ye uyulur (401/403/429/5xx ihtiyaten "yasak" sayılır), alan adı başına saniyede en fazla 1 istek, User-Agent `ProductFinderBot/0.1`. Giriş gerektiren sayfalara ve CAPTCHA'lara dokunulmaz.

Kullanılmayan kaynaklar ve nedenleri: Gear Patrol ve Cool Material (robots.txt yasak), Uncrate / Bless This Stuff / Dude I Want That (besleme yok), Gadget Flow (haber ağırlıklı, büyük markalar), Design Milk (mimari/iç mekân), Reddit (robots.txt `Disallow: /`, API elle onaya bağlı), Kickstarter/Indiegogo (botlara 403), Product Hunt/HN (yazılım ağırlıklı), Google Custom Search (yeni müşteri almıyor), Brave Search (kart istiyor), Okendo/Loox yorum API'leri (robots yasak), Werd gibi "en iyi X" liste blogları (yazı başına 10–20 marka çıkarır; ücretsiz Tavily kotasını birkaç günde bitirir).

## DTC doğrulama (`dtc/verify.ts`)

Her ürün sırayla şu adımlardan geçer; ilk başarısız adımda durur ve gerekçe `products.dtc_reason`'a yazılır:

1. **Alan adı** engel listesindeyse → `rejected_marketplace`.
1. **Büyük marka:** markanın sitesi Tranco dünya sıralamasında #150.000'den üstteyse (≈ 500 binden fazla ziyaret/ay) → ağa çıkmadan `rejected_big_brand` (`BIG_BRAND_MAX_RANK`, `config/limits.ts`). Örnek: microsoft.com #8, oneplus.com #13.605, timex.com #63.217 elenir; mibrofit.com #575.487 küçük marka sayılır.
2. **Marka önbelleği:** marka son 30 günde bir pazaryerinde/büyük perakendecide bulunduysa → ağa çıkmadan `rejected_marketplace`.
3. **Marka sayfası** açılamazsa → `unverified` (ağ/5xx ise ertesi gün yeniden denenir; 403/robots yasağı kalıcı). Link pazaryerine yönleniyorsa → `rejected_marketplace`.
4. **Platform** (Shopify, WooCommerce, BigCommerce, Wix, Squarespace, Magento, Salesforce). Shopify'da `/meta.json` (mağaza ülkesi, şehri, gönderim ülkeleri, marka adı) ve ürün JSON'u okunur. Blog ana sayfaya link verdiyse `/products.json` kataloğunda ürün adıyla aranır (en fazla 3 sayfa).
5. **Satın alma:** `/cart/add` formu, fiyatlı schema.org `Offer` veya "Add to cart / Buy now / Sepete ekle". Yoksa → `unverified`.
6. **Fiziksel ürün:** Shopify `requires_shipping`, kargo/ağırlık bilgisi veya schema.org `Product`+`Offer`. Dijital/yazılım ya da kanıt yoksa → `unverified`.
7. **Doğrudan pazaryeri araması (kotasız):** ürün adı ve marka adı Amazon.com, AliExpress ve Otto'nun kendi arama sayfalarında aranır (`dtc/directSearch.ts`). Eşleşme kuralları Tavily ile aynıdır; ayrıca "X için kılıf / Case for X / compatible with X" gibi **üçüncü taraf aksesuar** ilanları sayılmaz. Bulunursa → `rejected_marketplace`, Tavily kredisi harcanmaz. robots.txt'nin izin vermediği (eBay, Etsy, Walmart, Target, Trendyol, Alibaba, Google, Bing), bot doğrulaması gösteren (DuckDuckGo, Amazon.de/.com.tr) ya da sonuçları JavaScript'le yükleyen (Best Buy, Temu) siteler kullanılmaz; bunlar Tavily ile kontrol edilir.
8. **Ürün araması (Tavily, 1 kredi):** ürün adı yalnızca ~126 pazaryeri/perakendeci alan adında aranır. Marka adı ilan **başlığında** geçmeli; modelin ilk kelimesi ve model kelimelerinin ≥%60'ı bulunmalı. Arama sayfaları, Etsy `/market/`, Facebook'un pazaryeri dışı sayfaları, kariyer/yatırımcı alt alanları sayılmaz. Bulunursa → `rejected_marketplace` ve marka da "found" olur.
9. **Marka araması (katı mod, Tavily, marka başına 30 günde 1 kredi):** marka adı tırnak içinde aranır; marka herhangi bir pazaryerinde/büyük perakendecide satıyorsa ürün elenir. 5 harften kısa marka adlarında (ör. "TDM") ürünün model kelimelerinden biri de geçmelidir. Temizse → `verified`.

**Tavily kotası dolduğunda:** doğrudan arama tamsa (Amazon.com okunabildiyse) ürün "Kısmi kontrol" rozetiyle `verified` listelenir ve geniş arama yapılana kadar her gün yeniden kontrol edilir (`VERIFY_WITH_DIRECT_ONLY`, `config/limits.ts`). Amazon okunamadıysa ürün `unverified` kalır ve ertesi gün denenir.

Katı mod (`config/limits.ts` içinde `STRICT_BRAND_CHECK`) açıktır: bir markanın tek bir ürünü bile pazaryerinde bulunursa, markanın daha önce doğrulanmış ürünleri de her çalıştırma sonunda elenir.

Önceden doğrulanmış bir ürün yalnızca geçici bir hata (kota, ağ) yüzünden listeden düşmez; durumu korunur ve ertesi gün yeniden kontrol edilir. `verified` ürünler 30 günde bir yeniden kontrol edilir.

**Bilinen sınır:** arama tabanlı kontrol olasılıksaldır. `verified`, "ürün ve marka aramasında hiçbir pazaryeri/büyük perakendeci ilanı bulunamadı" demektir; kesin garanti değildir.

## Toptancı araması ve kâr marjı (`dtc/suppliers.ts`)

Doğrulanmış ürünler ile favori/incelenecek listesindeki ürünler için 7 günde bir:

1. **Genel ürün tarifi** çıkarılır: ürün adından marka sözcükleri, model kodları (rakam içerenler) ve pazarlama ekleri (pro, max, ultra…) atılır, Shopify ürün türü eklenir. ör. "TDM. Neo Hybrid Headphone - Speakers" → `neo hybrid headphone speakers`.
2. Üç toptancının arama sayfası aranır (robots.txt izinli yollar, site başına 1 istek/sn): **AliExpress** (adet fiyatı, satış adedi; İngilizce/USD tercihiyle), **Alibaba showroom** (toptan fiyat aralığı, MOQ, tedarikçi), **Made-in-China** (fiyat aralığı, MOQ, üretici). Sonuç çıkmazsa son iki sözcükle yeniden denenir. Bot doğrulama sayfası gelirse atlatılmaz, site "okunamadı" sayılır (Alibaba sık sık bunu yapıyor). DHgate (403), CJdropshipping (robots yasak), 1688 (giriş/JS) kullanılamıyor.
3. **Benzerlik:** tarif sözcüklerinin ilan başlığında geçme oranı; sözcükler aynı sonuç sayfasındaki sıklıklarına göre ağırlıklanır (ayırt edici "cork" ağır, her başlıkta geçen "wallet" hafif). ≥ %70 olanlar listelenir. "Case for X / X için kılıf" gibi aksesuarlar, büyük marka ürünleri (DJI, GoPro, Samsung…) ve ikinci el ilanlar atlanır.
4. **Marj** = perakende fiyat / benzerliği ≥ %70 ilanlardaki en düşük birim fiyat (yaklaşık kurlarla USD). Kargo, gümrük ve vergi **hariç**tir.

Toptan platformları (AliExpress, Alibaba, DHgate, Made-in-China) **eleme sebebi değildir**: ürünün buralarda bulunması tedarik edilebildiğini gösterir. Amazon, eBay, Walmart, Trendyol, Hepsiburada gibi perakende pazaryerleri ise eleme sebebidir.

**Bilinen sınır:** eşleşme metinle yapılır, görselle değil. Aynı ürün olup olmadığını ürün sayfasındaki toptancı görsellerinden kontrol edin.

## Ülke ve satışa dair işaretler

Gerçek satış adetleri herkese açık değildir; kartta satışa dair şu işaretler gösterilir:

| Bilgi | Kaynak |
|---|---|
| Mağaza ülkesi, şehri | Shopify `/meta.json`; yoksa schema.org Organization adresi; yoksa ülke uzantısı (.ch, .de, .co.uk) |
| Türkiye'ye gönderim | Shopify `/meta.json` → `ships_to_countries` içinde `TR` var mı (diğer platformlarda bilinmiyor) |
| Yorum sayısı ve puan (satış hacmine en iyi yaklaşım) | schema.org `AggregateRating`, Judge.me rozeti, Yotpo yorum özeti (`api-cdn.yotpo.com/products/*/*/bottomline`, robots.txt izin veriyor) |
| Fiyat, para birimi, varyant sayısı | Shopify ürün JSON'u / schema.org `Offer` |
| Stok durumu | Shopify katalog `available` / schema.org `availability` |
| Satışa çıkış tarihi | Shopify `published_at` |
| Trend skoru | Bloglardaki bahsedilmeler (aşağıda) |

## Trafik, satış tahmini ve winner skoru (`lib/winner.ts`)

Hiçbir ücretsiz kaynak bir sitenin gerçek ziyaret ya da satış sayısını vermez. Aşağıdakiler kamuya açık işaretlerden türetilmiş **kaba tahminlerdir**; ürünleri birbirleriyle karşılaştırmak ve eğilimi görmek içindir.

| Tahmin | Formül | Kaynak |
|---|---|---|
| Aylık ziyaret | `2,4·10¹⁰ × sıra^−0,9`, aralık ×0,5–×2 (10.000. site ≈ 6 Mn, 100.000. ≈ 760 B, 1.000.000. ≈ 96 B) | Tranco sırası (Chrome UX Report, Cloudflare Radar, Umbrella, Majestic, Farsight sıralamalarının 30 günlük ortalaması). İlk 1 milyonda olmayan site < ~100 B |
| Toplam satış | yorum sayısı × 10–50 | Alıcıların yaklaşık %2–10'unun yorum bıraktığı varsayımı |
| Aylık satış | son ≤30 günde eklenen yorum (aya ölçeklenmiş) × 10–50 | Günlük ölçümler (`product_snapshots`); en az 7 günlük veri gerekir |
| Aylık ciro | aylık satış × fiyat | |

Günlük iş doğrulanmış ürünlerin (ve favori/incelenecek listesindekilerin) fiyat, yorum ve stok bilgisini her gün kaydeder; Tranco sırası her marka için günlük tutulur (`traffic_ranks`). Grafikler bu geçmişten çizilir ve her gün dolar.

**Winner skoru (0–100)**, varsayılan sıralamadır:

| Bileşen | Puan | Formül |
|---|---|---|
| Talep | 25 | `25 × min(1, log10(1 + yorum) / 3)` × puan katsayısı (★ ≥ 4,5 → 1; 4–4,5 → 0,85; < 4 → 0,6). 1.000 yorum = tam puan |
| İvme | 20 | `20 × min(1, aylık yeni yorum / 30)` (en az 7 günlük ölçüm) |
| Trafik | 15 | `12 × sıra puanı` (1 Mn → 0,1, ≤ 150 B → 1, logaritmik) `+ 3 × min(1, (eski sıra / yeni sıra − 1) / 0,2)` (30 günde %20 iyileşme = tam) |
| Gündem | 10 | `10 × trend skoru / 100` |
| Fiyat | 10 | 25–150 $ → 10; 15–25 $ veya 150–300 $ → 5; diğer → 0 (yaklaşık sabit kurlarla dolara çevrilir) |
| Tedarik | 20 | Toptancıda benzer ürün (≥ %70) → 8; kâr marjı ≥ 4× → +12, ≥ 3× → +9, ≥ 2× → +5 |

"İvme" ve trafik değişimi ilk hafta 0'dır; ölçümler biriktikçe hızla büyüyen ürünler öne çıkar.

**Yükseliş skoru (0–100)** — "↗ Yükselenler" görünümü (`/?sort=rising`). Büyüklüğe değil **hıza** bakar; küçük ama hızla büyüyen ürünleri bulmak içindir:

| Bileşen | Puan | Formül |
|---|---|---|
| Yorum hızı | 45 | `45 × min(1, büyüme / 0,30)`; büyüme = aylık yeni yorum / max(20, toplam yorum). Ayda 3'ten az yeni yorum sayılmaz |
| Trafik hızı | 35 | `35 × min(1, (eski sıra / yeni sıra − 1) / 0,2)` (30 günde %20 iyileşme = tam; düşüş eksi puan vermez) |
| Gündem | 20 | `20 × min(1, son 7 gündeki blog yazısı / 2)` |

40 ve üstü kartta "↗ Yükselişte" rozeti gösterir. Yorum ve trafik hızı en az 7 günlük ölçümden sonra hesaplanır.

## Trend skoru (`lib/score.ts`, 0–100)

| Bileşen | Formül | Açıklama |
|---|---|---|
| Kaynak | `40 × min(S, 3) / 3` | S = ürünü anan farklı blog sayısı |
| Artış | `30 × min(G, 3) / 3` | G = m7 / max(1, (m30 − m7) / 3): son haftanın, önceki 3 haftanın haftalık ortalamasına oranı |
| Hacim | `30 × min(m30, 5) / 5` | m30 = son 30 gündeki bahsedilme sayısı |

Örnek: tek blogda bu hafta bir kez anılan ürün → 13.3 + 10 + 6 = **29.3**. Üç farklı blogda bu hafta anılan ürün → 40 + 30 + 18 = **88**.

## Arayüz

- Varsayılan görünüm yalnızca `verified` ürünler.
- Arama (ürün/marka), durum, **mağaza ülkesi**, **yalnızca Türkiye'ye gönderenler**, kategori, platform, tarih, takip durumu, **minimum yorum**, minimum winner skoru, **fiyat aralığı**; sıralama: winner skoru, trend skoru, **yorum sayısı**, en yeni, fiyat. Filtreler URL'de tutulur.
- Kart: görsel, ürün/marka linki, durum/platform/winner rozetleri, fiyat, yorum ★, stok, satışa çıkış, mağaza ülkesi, Türkiye gönderimi, **tahmini trafik ve satış**, doğrulama gerekçesi, kaynak yazılar.
- **Ürün sayfası** (`/p/<id>`): winner skoru, tahmini aylık ziyaret, Tranco sırası, toplam/aylık satış ve ciro kutuları; site trafiği, Tranco sırası, yorum sayısı, tahmini satış ve fiyat grafikleri; winner skoru bileşen çubukları.
- **Siteler ve trafik** (`/siteler`): markaları tahmini aylık ziyarete göre sıralayan tablo, 30 günlük değişim, eğilim çizgisi, doğrulanmış/toplam ürün sayısı. Grafikler bağımlılıksız SVG'dir.
- "Takip ve Türkiye notu": favori / incelenecek / elendi, not, "Türkiye'de rakip var mı?", tahmini maliyet, Türkiye notu.

## Pazaryeri ve perakendeci listesi

`config/marketplaces.ts` — ~122 pazaryeri ve büyük perakendeci (Amazon, eBay, Etsy, Trendyol, Hepsiburada, n11, Walmart, Target, Best Buy, MediaMarkt, Zalando, IKEA, Teknosa, Boyner…). Yeni satıcı eklemek için `retailers([...])` listesine `["Ad", "alanadi.com"]` ekleyin. Eşleşme alan adının TLD'siz adına göre yapılır (`amazon` → `amazon.com.tr`, `smile.amazon.de`, `amzn.to`, `link.amazon`). `NOT_OWN_DOMAIN_LABELS` markanın kendi alan adı sayılmayan adresleri (myshopify, sosyal medya, affiliate kısaltıcılar) tutar.

## Kod kuralı

`lib/`, `config/`, `dtc/`, `sources/`, `scripts/` altındaki dosyalar hem Next.js hem doğrudan Node tarafından çalıştırılır: bu klasörlerde **göreli import + `.ts` uzantısı** kullanılır (`../lib/domain.ts`), `@/` alias'ı kullanılmaz ve `enum` gibi yalnızca TypeScript'e özgü sözdizimi yasaktır (`erasableSyntaxOnly`).
