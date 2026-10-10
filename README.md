# Product Finder

**Küçük markaların** yalnızca kendi sitelerinde satılan (pazaryerlerinde ve büyük perakendecilerde olmayan) fiziksel trend ürünlerini bulan, ardından aynısının/muadilinin **toptancısını** (AliExpress, Alibaba, Made-in-China) ve kâr marjını gösteren tek kullanıcılı araç. Amaç: toptan alıp Türkiye'de satılabilecek ürünler. Aylık maliyet: **0 $**.

## Nasıl çalışır

```
GitHub Actions (her gün 05:00 UTC)  →  npm run ingest
  0) Yeni mağaza keşfi: yeni kayıtlı alan adları (WhoisDS) → DNS ile Shopify mağazaları → haftalık kontrol
     → son 5 ayda açılmış, puanı yüksek mağazaların öne çıkan ürünü aday olur
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

1. Supabase SQL Editor'de `supabase/migrations/` altındaki dosyaları sırayla çalıştırın (`0001` → `0018`).
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
| `META_ACCESS_TOKEN` | GitHub, yerel | Meta Reklam Kütüphanesi erişim anahtarı (ücretsiz, ~60 günde bir yenilenir). Kurulum: aşağıda **Reklam sinyali**. Yoksa reklam adımı atlanır |
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
| `npm run ingest -- no-stores` | Yeni mağaza keşfi ve kontrolleri atlanır |
| `npm run ingest -- recheck` | Ayrıca tüm `verified` ürünleri tarihe bakmadan yeniden kontrol eder (doğrulama kuralları değişince) |
| `npm run ingest -- resupply` | Toptancı aramasını 7 günlük süreyi beklemeden tüm doğrulanmış/takip edilen ürünler için yeniler |

## Ücretsiz katman limitleri

| Servis | Ücretsiz limit | Bu projedeki kullanım |
|---|---|---|
| **Supabase Free** | 500 MB veritabanı, 5 GB çıkış/ay, 2 aktif proje. 7 gün işlem olmazsa proje duraklar | Birkaç MB. Günlük iş projeyi aktif tutar |
| **GitHub Actions** (private repo) | 2.000 dakika/ay (public repoda sınırsız) | İlk ~10 gün (60 günlük geriye dönük tarama) ~35 dk/gün, sonra ~20–25 dk/gün ≈ 700 dk/ay. Public repolarda 60 gün commit olmazsa zamanlanmış iş durur |
| **Vercel Hobby** | 100 GB veri aktarımı, 1M fonksiyon çağrısı, 4 CPU-saat/ay; fonksiyon süresi 300 sn. **Yalnızca kişisel, ticari olmayan kullanım** | Tek kullanıcı, çok düşük trafik |
| **Tavily Free** | 1.000 kredi/ay, kart istemez (basic arama = 1 kredi) | Kod sınırı: günde 30, ayda 950. Kota dolarsa ürün ertesi güne kalır, ücretli kullanıma **asla** geçilmez |
| **Meta Reklam Kütüphanesi API'si** (graph.facebook.com/ads_archive) | Ücretsiz, kart istemez; kimliği doğrulanmış Facebook hesabı gerekir. Hız sınırı API tarafından uygulanır (aşılırsa istek reddedilir, ücret çıkmaz) | Günde en fazla 150 arama, saniyede 1. Hız sınırına takılırsa kalan aramalar ertesi güne kalır |
| **WhoisDS yeni kayıtlı alan adları** (ücretsiz günlük liste) | Ücretsiz, kayıt gerekmez; "ticari dahil yeniden kullanılabilir" | Günde 1 zip (~70 bin alan adı) |
| **cenk/nrd** (WhoisDS listelerinin 60 günlük birikimi, dl.cenk.app) | Ücretsiz, robots.txt izinli | Yalnızca ilk kurulumda, liste bitene kadar günde 1 indirme (~75 MB) |
| **DNS** (sistem çözümleyicisi) | Ücretsiz | Günde ~35–300 bin sorgu; sitelere istek gönderilmez |
| **RDAP** (rdap.org → kayıt kuruluşları) | Ücretsiz, resmi WHOIS halefi | Marka başına 1 sorgu (kayıt tarihi) |
| **MyMemory çeviri API'si** (api.mymemory.translated.net) | Ücretsiz, anahtarsız 5.000 karakter/gün | Yalnızca İngilizce konuşulmayan ülkelerdeki mağaza ürünlerinin adı (toptancı araması için); kod sınırı günde 100 çeviri, çeviriler veritabanında saklanır |
| **TCMB günlük kurlar** (tcmb.gov.tr/kurlar/today.xml) | Ücretsiz, resmi, anahtar gerekmez; robots.txt izinli | Günde 1 istek (kâr hesaplayıcının USD/TL kuru) |
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
gh secret set META_ACCESS_TOKEN        # isteğe bağlı: reklam sinyali
```

İş akışı: `.github/workflows/daily-ingest.yml` (her gün 05:00 UTC = 08:00 TR). Elle çalıştırmak için GitHub → Actions → "Günlük toplama ve doğrulama" → **Run workflow**.

### 2. Vercel (arayüz)

1. vercel.com → **Add New Project** → GitHub'daki `productfinder` reposunu seçin (Hobby plan, kart gerekmez).
2. **Environment Variables:** `APP_PASSWORD`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
3. **Deploy.** Sonraki her `git push` otomatik deploy olur.

Komut satırından aynısı: `npx vercel login` → `npx vercel link` → `npx vercel env add <AD> production` → `npx vercel deploy --prod`.

Canlı adres: https://productfinder-phi.vercel.app (Vercel projesi `fetihh/productfinder`, GitHub reposuna bağlı).

Toplama işi Vercel'de değil GitHub Actions'ta çalışır: alan adı başına 1 istek/sn kuralı nedeniyle iş dakikalar sürebilir.

## Veri kaynakları

Fiziksel ürün inceleyen blogların herkese açık RSS beslemeleri (`config/sources.ts`): Cool Things, The Gadgeteer, The Awesomer, This Is Why I'm Broke (küçük markalar ağırlıklı).

- Yazıdaki dış linklerden markanın kendi alan adı bulunur. Affiliate linklerinde hedef adres URL parametresinden okunur; yönlendirmeye istek atılmaz.
- Aynı blogun yazılarının en az %30'unda (en az 3 yazı) geçen alan adları site geneli (menü/sponsor) sayılıp atlanır.
- Yazı ürünü bir pazaryerinde gösteriyorsa ürün doğrudan `rejected_marketplace` olur.
- İşlenen yazılar `seen_items` tablosunda tutulur, tekrar açılmaz.
- Tüm istekler `lib/http.ts` üzerinden: robots.txt'ye uyulur (401/403/429/5xx ihtiyaten "yasak" sayılır), alan adı başına saniyede en fazla 1 istek, User-Agent `ProductFinderBot/0.1`. Giriş gerektiren sayfalara ve CAPTCHA'lara dokunulmaz.

Kullanılmayan kaynaklar ve nedenleri: Gear Patrol ve Cool Material (robots.txt yasak), Uncrate / Bless This Stuff / Dude I Want That (besleme yok), Gadget Flow (haber ağırlıklı, büyük markalar), Design Milk (mimari/iç mekân), Reddit (robots.txt `Disallow: /`, API elle onaya bağlı), Kickstarter/Indiegogo (botlara 403), Product Hunt/HN (yazılım ağırlıklı), Google Custom Search (yeni müşteri almıyor), Brave Search (kart istiyor), Okendo/Loox yorum API'leri (robots yasak), Werd gibi "en iyi X" liste blogları (yazı başına 10–20 marka çıkarır; ücretsiz Tavily kotasını birkaç günde bitirir).

## Yeni mağaza keşfi (`lib/nrd.ts`, `dtc/storeProbe.ts`, `scripts/stores.ts`)

Amaç: **son 5 ayda açılmış küçük dropshipping mağazalarını** yakalamak. Bloglar yeni mağazaları yazmadığı için mağazalar doğrudan alan adı kayıtlarından bulunur:

1. **Yeni kayıtlı alan adları:** WhoisDS'nin ücretsiz günlük listesi (~70 bin/gün). İlk kurulumda cenk/nrd'nin son 60 günlük birikimi parça parça taranır (her çalıştırmada 300 bin alan adı). Spam ağırlıklı uzantılar (.xyz, .top…) atlanır.
2. **DNS ile Shopify tespiti:** Shopify'a bağlı alan adları 23.227.38.x adresine çözülür (~%3: günde ~1.000 yeni mağaza). DNS sorgusu siteye istek göndermez.
3. **Kontrol takvimi:** ilk kontrol kayıttan 5 gün sonra. Şifreli/boş mağaza 14 günde bir (90 günde açılmazsa bırakılır), açık mağaza **haftada bir**, puanı ≥ 55 olan açık mağaza **her gün** (stok tükenmesi ve yeni ürün günler içinde görünsün; ilk ürünü 150 günü geçince bırakılır). Her kontrol `/products.json` (gerekirse `/meta.json` ve ana sayfa) okur; şifre sayfasına girilmez, robots.txt'ye uyulur.
4. **Mağaza puanı (0–100):** odak 25 (tek ürün mağazası tam), yenilik 15, **dropship işareti 20** (ürün açıklamasında "7-15 business days" gibi uzun teslimat aralığı, dünya geneli gönderim ya da **AliExpress görseli**: görselin dosya adı AliExpress görsel kimliği, ör. `S4f799d…edi.avif` — fotoğraf AliExpress'ten indirilip yüklenmiş), indirim 10 (compare-at fiyat), fiyat 10 (15–150), **hareket 20** (iki kontrol arasında yeni ürün eklendi +10, varyant stoğu tükendi +10). Baskılı giyim/merch mağazaları −20, dijital ağırlıklı mağazalar 0.
5. **Kopyalanan ürünler** (`dtc/copies.ts`): puanı ≥ 35 olan açık mağazaların öne çıkan ürün görseli özetlenir (dHash, yalnızca yeni ya da değişmiş görseller; çalıştırma başına en fazla 400, cdn.shopify.com'dan saniyede 1). Aynı AliExpress görsel kimliği ya da neredeyse aynı fotoğraf (fark ≤ 40/256) → aynı ürün. Aynı Shopify mağazasının farklı alan adları (görsel adresindeki mağaza kimliği aynı) tek mağaza sayılır. Kümedeki tüm mağazalar ürünü **birebir aynı başlık ve fiyatla** satıyorsa "aynı satıcının ağı olabilir" diye işaretlenir (çoğunlukla aynı gün açılmış, ürünle ilgisiz adlı alan adları) ve puan almaz. **Kopya puanı:** bağımsız başka mağaza 1 → 8, 2–4 → 12, ≥ 5 → 15.
6. **Aday:** toplam puanı (mağaza puanı + reklam puanı + kopya puanı, en fazla 100) ≥ 55, açık ve ilk ürünü son 150 gün içinde olan mağazanın ana sayfasında öne çıkardığı ürün (yoksa en yeni fiziksel ürün) aday olur; sonra normal hattan geçer: pazaryeri kontrolü → toptancı araması → skorlar.
7. **Asıl satan ürünler:** mağazanın ürün görüntülerinde stoğu en az 2 kez azalan ürünler (öne çıkan ürün değilse) de aday olur; mağaza başına en fazla 2, çalıştırma başına 40 mağaza.

**Yeni mağazalar** sayfası (`/yeni`): açık yeni mağazalar, mağaza yaşı, ürün sayısı, indirim ve dropship işaretleri, AliExpress görseli, aynı ürünü satan rakip mağazalar ("N mağaza daha satıyor" → kümeyi listeler; "Aynı ürünü satan en çok mağaza" sıralaması), Türkiye'ye gönderim, toptan fiyat/marj ve keşif hattının özeti (bulunan / açık / kapalı / kapanmış). Ana listede de **Mağaza yaşı** filtresi (≤ 30 / 90 / 150 gün) vardır; markaların yaşı RDAP kayıt tarihi ve Shopify'daki ilk ürün tarihinden hesaplanır.

**Mağaza detayı** (`/m/<alan adı>`): puan dökümü (odak, yenilik, dropship, indirim, fiyat, hareket, reklam, kopya, merch), kontrol geçmişi grafikleri (ürün sayısı, stokta olan varyant oranı), reklamlar, aynı ürünü satan mağazalar ve **ürün bazında hareket**: puanı ≥ 35 olan mağazalarda her kontrolde ürün listesinin anlık görüntüsü saklanır (en fazla 60 ürün); stokta olan varyant sayısı azalan ("📉 N kez stok azaldı"), fiyatı değişen ve yeni eklenen ürünler en üste çıkar — mağazanın asıl sattığı ürün genelde budur. Yeni mağazalar sayfasında **En çok stok hareketi** sıralaması vardır.

**Shopify kısıtlaması:** aynı IP'den çok sayıda mağazaya istek gidince Shopify tüm mağazalar için geçici olarak 429 ("çok fazla istek") döner — robots.txt dahil. Bu durumda robots.txt "yasak" sayılmaz, istek yapılmaz ve mağaza durumu korunur (ertesi gün yeniden denenir); art arda 25 kısıtlama gelirse günlük kontrol durdurulur ve kalan mağazalar ertesi güne kalır (devre kesici).

**Bilinen sınırlar:** WhoisDS ücretsiz listesi tüm kayıtları değil bir kısmını içerir; 60 günden eski mağazalar ancak izlemeye alındıktan sonra yaşlanarak listede kalır (5 aylık pencere birkaç ay içinde dolar). "Hareket" işaretleri en az iki haftalık kontrol gerektirir.

## Reklam sinyali (`dtc/adLibrary.ts`, `scripts/ads.ts`)

Bir dropshipping mağazası bir ürüne haftalarca reklam veriyorsa ürün büyük ihtimalle satıyordur: kârsız reklam birkaç gün içinde kapatılır. Bu sinyal Meta'nın resmi ve ücretsiz **Reklam Kütüphanesi API'si**nden okunur.

- **Kimler aranır:** doğrulanmış ürünlerin markaları, sonra puanı ≥ 35 olan açık yeni mağazalar (puana göre). Günde en fazla 150 alan adı, saniyede 1 istek. Reklamı bulunan alan adı 3 günde, bulunmayan 10 günde bir yeniden aranır.
- **Nasıl eşleşir:** önce alan adıyla aranır; reklamın bağlantı başlığında/metninde alan adı geçmeli ya da reklamı veren sayfanın adı mağaza adıyla aynı olmalı. Sayfa bir kez bulununca sonraki aramalar o sayfanın tüm reklamlarını getirir.
- **Kapsam:** tüm konulardaki (ticari) reklamlar yalnızca **AB/İngiltere'de gösterilenler** için arşivlenir; arama AB ülkeleriyle yapılır. Yalnızca ABD'ye reklam veren mağaza görünmez.
- **Reklam puanı (0–25):** yayındaki reklam 1 → 8, ≥ 3 → 12, ≥ 10 → 16; hâlâ yayında olan en eski reklam ≥ 14 gün → +5, ≥ 30 gün → +9. Yayında reklam yok ama son 150 günde reklam verilmişse 3. Mağaza puanına eklenir (aday seçimi), winner skoruna 15 üzerinden, yükseliş skoruna "son 14 günde açılan reklam" olarak girer.
- **Gösterim:** ürün sayfasında reklam bölümü (yayındaki reklam sayısı, en eski reklamın yaşı, son 14 günde açılanlar, AB erişimi, örnek reklamlar ve geçmiş grafiği), yeni mağaza kartlarında "Reklam" satırı, iki listede de **Reklam verenler** filtresi.
- Erişim anahtarı URL'ye değil `Authorization` başlığına konur. API'nin döndürdüğü `ad_snapshot_url` anahtarı içerdiği için saklanmaz; bağlantılar herkese açık `facebook.com/ads/library/?id=…` sayfasına gider.

**Kurulum (bir kez, ücretsiz):**

1. https://www.facebook.com/ID adresinden kimlik ve konum doğrulaması yapın (Meta'nın onayı birkaç gün sürebilir).
2. https://developers.facebook.com adresinde geliştirici hesabı açın → **My Apps → Create App** (ad: ör. "ProductFinder"; kullanım türü olarak reklam/işletme dışı bir seçenek yeterli).
3. **Tools → Graph API Explorer**: uygulamanızı seçin → **Generate Access Token** (ek izin gerekmez). Bu anahtar ~1 saat geçerlidir.
4. **Tools → Access Token Debugger**: anahtarı yapıştırın → **Debug** → **Extend Access Token**. Çıkan uzun süreli anahtar ~60 gün geçerlidir.
5. Anahtarı ekleyin: `gh secret set META_ACCESS_TOKEN` (GitHub) ve yerelde `.env.local` içine `META_ACCESS_TOKEN=`.

**Yenileme (~60 günde bir):** 3–5. adımları tekrarlayın. `/yeni` sayfası son 10 günde uyarır; anahtar geçersizse günlük iş başarısız görünür ve sayfada kırmızı uyarı çıkar.
## DTC doğrulama (`dtc/verify.ts`)

**Sıra:** her çalıştırmada önce hiç kontrol edilmemiş ürünler, aralarında **doğrulama önceliği** yüksek olan önce (günlük arama kotası en umut verici adaylara harcanır): stoğu tekrar tekrar azalan mağaza ürünü 70 + 5 × stok azalması, yeni mağazanın öne çıkan ürünü mağaza toplam puanı, blog ürünleri 50.

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

1. **Çeviri:** mağaza İngilizce konuşulmayan bir ülkedeyse (İspanya, Fransa, İtalya, Almanya, Brezilya…) ürün adı önce MyMemory ile İngilizceye çevrilir ("Proyector Nocturno para el Hogar" → "Home Night Projector"); toptancılar İngilizce arandığı için. Çeviri bir kez yapılıp saklanır.
2. **Genel ürün tarifi** çıkarılır: ürün adından marka sözcükleri, model kodları (rakam içerenler) ve pazarlama ekleri (pro, max, ultra…) atılır, Shopify ürün türü eklenir. ör. "TDM. Neo Hybrid Headphone - Speakers" → `neo hybrid headphone speakers`.
2. Üç toptancının arama sayfası aranır (robots.txt izinli yollar, site başına 1 istek/sn): **AliExpress** (adet fiyatı, satış adedi; İngilizce/USD tercihiyle), **Alibaba showroom** (toptan fiyat aralığı, MOQ, tedarikçi), **Made-in-China** (fiyat aralığı, MOQ, üretici). Sonuç çıkmazsa son iki sözcükle yeniden denenir. Bot doğrulama sayfası gelirse atlatılmaz, site "okunamadı" sayılır (Alibaba sık sık bunu yapıyor). DHgate (403), CJdropshipping (robots yasak), 1688 (giriş/JS) kullanılamıyor.
3. **Benzerlik:** tarif sözcüklerinin ilan başlığında geçme oranı; sözcükler aynı sonuç sayfasındaki sıklıklarına göre ağırlıklanır (ayırt edici "cork" ağır, her başlıkta geçen "wallet" hafif). ≥ %70 olanlar listelenir. "Case for X / X için kılıf" gibi aksesuarlar, büyük marka ürünleri (DJI, GoPro, Samsung…) ve ikinci el ilanlar atlanır.
4. **Görsel eşleştirme** (`dtc/imageHash.ts`): ürünün ana görseli ve Shopify ürününün ilk 4 görseli, her kaynaktaki metin benzerliği ≥ %30 olan en benzer 8 ilanın fotoğrafıyla karşılaştırılır. Karşılaştırma algısal özetle (dHash, 256 bit) yapılır: kenarlardaki düz arka plan kırpılır, görsel 17×16 gri tonlamaya küçültülür; aynı fotoğraf farklı boyut/sıkıştırma/kenar boşluğuyla da eşleşir (ölçülen fark 0–10), farklı ürünler 60+ fark verir (aynı boş tişörtün farklı baskılı fotoğrafı 84). Fark ≤ 40 → **"📷 Aynı fotoğraf"**: dropshipping mağazaları çoğunlukla tedarikçinin fotoğrafını kullandığı için bu ilan büyük ihtimalle mağazanın tedarikçisidir; metin benzerliği düşük olsa da listelenir ve en üstte gösterilir. Görseller `lib/http.ts` üzerinden (robots.txt, alan adı başına 1 istek/sn) indirilir, Shopify görselleri 300 px istenir; görseller saklanmaz, yalnızca fark kaydedilir. Görsel işleme `sharp` (açık kaynak, ücretsiz) ile yapılır.
5. **Toptancı satış hızı:** her aramada ilanların satış adedi (AliExpress "N sold") `supplier_history` tablosuna yazılır. Asıl ilanın (fotoğrafla eşleşenlerden en çok satan, yoksa en benzer) en az 6 gün arayla iki ölçümünden **haftalık satış** hesaplanır: ürünü satan tüm dropshipping mağazaları aynı tedarikçiden aldığı için bu, ürünün toplam talebidir. AliExpress büyük sayıları yuvarlar ("5,000+"), artış bir sonraki eşikte görünür.
6. **Marj** = perakende fiyat / en düşük birim fiyat (yaklaşık kurlarla USD). Fotoğrafla eşleşen fiyatlı ilan varsa yalnızca onlar, yoksa benzerliği ≥ %70 ilanlar kullanılır; yalnızca metinle bulunan ilanlarda perakendenin 1/50'sinden ucuz fiyat gerçek dışı sayılıp atlanır (farklı ürün, aksesuar ya da toplu adet fiyatı). Kargo, gümrük ve vergi **hariç**tir; bunlar için ürün sayfasındaki **kâr hesabı**na bakın.

Toptan platformları (AliExpress, Alibaba, DHgate, Made-in-China) **eleme sebebi değildir**: ürünün buralarda bulunması tedarik edilebildiğini gösterir. Amazon, eBay, Walmart, Trendyol, Hepsiburada gibi perakende pazaryerleri ise eleme sebebidir.

**Bilinen sınır:** tedarikçi farklı bir fotoğraf kullanıyorsa (stüdyo çekimi, başka açı) görsel eşleşme çıkmaz ve ilan yalnızca metin benzerliğiyle listelenir; bu ilanların aynı ürün olup olmadığını görselden kontrol edin.

## Kâr hesabı (`lib/profit.ts`, `components/ProfitCalculator.tsx`)

Ürün sayfasında, kendi sitesinden satış için adet başı kâr hesabı. Varsayılanlar: rakibin fiyatı (TCMB kuruyla TL'ye çevrilip 10'a yuvarlanır), en ucuz toptan ilan (fotoğrafla eşleşen varsa o) ve senaryo tahminleri; hepsi sayfada değiştirilebilir.

| Senaryo | Varsayılanlar |
|---|---|
| Türkiye · Çin'den tek tek gönderim (dropshipping) | Kargo 4 $/paket, gümrük %60 (ürün + kargo üzerinden; Şubat 2026'dan beri 30 € muafiyeti yok, AB dışı gönderilerde yaygın oran), paket başı beyanname bedeli (kargo firmasına sorun), fiyata %20 KDV dahil |
| Türkiye · toplu ithalat (stok) | Navlun 1 $/adet, gümrük %30 (GTİP koduna göre değişir; ithalat KDV'si satış KDV'sinden düşüldüğü için maliyet sayılmaz), yurt içi kargo 100 TL, %20 KDV dahil |
| Yurt dışı müşteri (USD) | Kargo 5 $/paket, gümrük 0, KDV yok |

Tüm senaryolarda ödeme komisyonu %3,5, iade/hasar payı %5, reklam (satış başına, CPA) fiyatın %25'i. Sonuçlar: **adet başı net kâr** ve marj, **reklama en fazla** harcanabilecek tutar (başabaş CPA) ve **başabaş ROAS**, girilen reklam maliyetiyle **en düşük satış fiyatı**. Gelir vergisi ve sabit giderler (site aboneliği vb.) dahil değildir. Gümrük oranları tahmindir; kesin oran için gümrük müşavirine danışın.

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
| Talep | 25 | `25 × min(1, log10(1 + yorum) / 3)` × puan katsayısı (★ ≥ 4,5 → 1; 4–4,5 → 0,85; < 4 → 0,6). 1.000 yorum = tam puan. Yorumu olmayan ürünlerde **toptancı satışı**: `15 × min(1, log10(1 + satış) / 4)` (10.000 satış = 15; ilan fotoğrafla eşleşmediyse ×0,5) |
| İvme | 20 | `20 × min(1, aylık yeni yorum / 30)` (en az 7 günlük ölçüm). Yorum ölçümü yoksa **toptancı satış hızı**: `20 × min(1, haftalık satış / 100)` (fotoğrafla eşleşmediyse ×0,5) |
| Trafik | 15 | `12 × sıra puanı` (1 Mn → 0,1, ≤ 150 B → 1, logaritmik) `+ 3 × min(1, (eski sıra / yeni sıra − 1) / 0,2)` (30 günde %20 iyileşme = tam) |
| Gündem | 10 | `10 × trend skoru / 100` |
| Fiyat | 10 | 25–150 $ → 10; 15–25 $ veya 150–300 $ → 5; diğer → 0 (yaklaşık sabit kurlarla dolara çevrilir) |
| Tedarik | 20 | Toptancıda benzer ürün (≥ %70) → 8; kâr marjı ≥ 4× → +12, ≥ 3× → +9, ≥ 2× → +5 |
| Reklam | 15 | `15 × reklam puanı / 25` (Meta'da yayındaki reklam sayısı ve en eski reklamın yaşı; aşağıda **Reklam sinyali**) |
| Stok hareketi | 10 | Ürünün mağazasında toplam stok azalması (yeni mağaza keşfi): 1 → 4, ≥ 2 → 7, ≥ 5 → 10 |
| Rakip mağaza | 10 | Aynı ürünü satan bağımsız yeni mağaza: 1 → 5, 2–4 → 8, ≥ 5 → 10 (aynı satıcının ağı sayılmaz) |

Toplam en fazla 100.

"İvme" ve trafik değişimi ilk hafta 0'dır; ölçümler biriktikçe hızla büyüyen ürünler öne çıkar.

**Yükseliş skoru (0–100)** — "↗ Yükselenler" görünümü (`/?sort=rising`). Büyüklüğe değil **hıza** bakar; küçük ama hızla büyüyen ürünleri bulmak içindir:

| Bileşen | Puan | Formül |
|---|---|---|
| Yorum hızı | 45 | `45 × min(1, büyüme / 0,30)`; büyüme = aylık yeni yorum / max(20, toplam yorum). Ayda 3'ten az yeni yorum sayılmaz |
| Trafik hızı | 35 | `35 × min(1, (eski sıra / yeni sıra − 1) / 0,2)` (30 günde %20 iyileşme = tam; düşüş eksi puan vermez) |
| Gündem | 20 | `20 × min(1, son 7 gündeki blog yazısı / 2)` |
| Yeni reklam | 25 | `25 × min(1, son 14 günde açılan reklam / 3)`: marka reklam bütçesini artırıyor. Toplam en fazla 100 |

40 ve üstü kartta "↗ Yükselişte" rozeti gösterir. Yorum ve trafik hızı en az 7 günlük ölçümden sonra hesaplanır.

## Trend skoru (`lib/score.ts`, 0–100)

| Bileşen | Formül | Açıklama |
|---|---|---|
| Kaynak | `40 × min(S, 3) / 3` | S = ürünü anan farklı blog sayısı |
| Artış | `30 × min(G, 3) / 3` | G = m7 / max(1, (m30 − m7) / 3): son haftanın, önceki 3 haftanın haftalık ortalamasına oranı |
| Hacim | `30 × min(m30, 5) / 5` | m30 = son 30 gündeki bahsedilme sayısı |

Örnek: tek blogda bu hafta bir kez anılan ürün → 13.3 + 10 + 6 = **29.3**. Üç farklı blogda bu hafta anılan ürün → 40 + 30 + 18 = **88**.

## Arayüz

- **Seçilenleri indir (CSV)** (`/export`): favori ve incelenecek ürünler; fiyat, winner, toptan fiyat, marj, fotoğraf eşleşmesi, toptancı satışı, rakip mağaza, ilk iki toptancı bağlantısı ve fiyatı, not. Türkçe Excel için `;` ayırıcı ve virgüllü ondalık.
- **Özet** (`/ozet`): günlük bakış — son 24 saatte bulunan mağaza ve aday ürün sayıları, en çok satış hareketi olan yeni mağazalar, birden çok bağımsız mağazanın sattığı ürünler, en yüksek winner skorlu ürünler, toptancıda hızla satan ürünler, reklamı artan mağazalar.
- Varsayılan görünüm yalnızca `verified` ürünler; **elenen** (✕ Ele) ürünler gizlenir ("Takip: Elendi" filtresiyle görülür). Üst menüde **Bugün yeni (N)**: son 24 saatte eklenen ürünler.
- Arama (ürün/marka), durum, **mağaza ülkesi**, **yalnızca Türkiye'ye gönderenler**, kategori, platform, tarih, takip durumu, **minimum yorum**, minimum winner skoru, **fiyat aralığı**; sıralama: winner skoru, trend skoru, **yorum sayısı**, en yeni, fiyat. Filtreler URL'de tutulur.
- Kart: **hızlı takip düğmeleri** (★ Favori / İncele / ✕ Ele; aynı düğmeye tekrar basmak kaldırır, notlar korunur), görsel, ürün/marka linki, durum/platform/winner rozetleri, fiyat, yorum ★, stok, satışa çıkış, mağaza ülkesi, Türkiye gönderimi, **tahmini trafik ve satış**, doğrulama gerekçesi, kaynak yazılar.
- **Ürün sayfası** (`/p/<id>`): toptancı adayları (📷 aynı fotoğraf), **kâr hesabı**, reklamlar, aynı ürünü satan mağazalar, mağaza detayına bağlantı, winner skoru, tahmini aylık ziyaret, Tranco sırası, toplam/aylık satış ve ciro kutuları; site trafiği, Tranco sırası, yorum sayısı, tahmini satış ve fiyat grafikleri; winner skoru bileşen çubukları.
- **Siteler ve trafik** (`/siteler`): markaları tahmini aylık ziyarete göre sıralayan tablo, 30 günlük değişim, eğilim çizgisi, doğrulanmış/toplam ürün sayısı. Grafikler bağımlılıksız SVG'dir.
- "Takip ve Türkiye notu": favori / incelenecek / elendi, not, "Türkiye'de rakip var mı?", tahmini maliyet, Türkiye notu.

## Pazaryeri ve perakendeci listesi

`config/marketplaces.ts` — ~122 pazaryeri ve büyük perakendeci (Amazon, eBay, Etsy, Trendyol, Hepsiburada, n11, Walmart, Target, Best Buy, MediaMarkt, Zalando, IKEA, Teknosa, Boyner…). Yeni satıcı eklemek için `retailers([...])` listesine `["Ad", "alanadi.com"]` ekleyin. Eşleşme alan adının TLD'siz adına göre yapılır (`amazon` → `amazon.com.tr`, `smile.amazon.de`, `amzn.to`, `link.amazon`). `NOT_OWN_DOMAIN_LABELS` markanın kendi alan adı sayılmayan adresleri (myshopify, sosyal medya, affiliate kısaltıcılar) tutar.

## Kod kuralı

`lib/`, `config/`, `dtc/`, `sources/`, `scripts/` altındaki dosyalar hem Next.js hem doğrudan Node tarafından çalıştırılır: bu klasörlerde **göreli import + `.ts` uzantısı** kullanılır (`../lib/domain.ts`), `@/` alias'ı kullanılmaz ve `enum` gibi yalnızca TypeScript'e özgü sözdizimi yasaktır (`erasableSyntaxOnly`).
