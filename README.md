# Product Finder

Pazaryerlerinde ve büyük perakendecilerde **satılmayan**, yalnızca markanın kendi alan adında satılan (DTC) fiziksel trend ürünleri bulan tek kullanıcılı araç. Aylık maliyet: **0 $**.

## Nasıl çalışır

```
GitHub Actions (her gün 05:00 UTC)  →  npm run ingest
  1) Ürün bloglarının RSS beslemeleri → aday ürünler (marka alan adı + ürün sayfası)
  2) DTC doğrulama: platform, satın alma, fiziksel ürün, ürün + marka düzeyinde pazaryeri araması
  3) Mağaza ülkesi, Türkiye'ye gönderim, fiyat, yorum sayısı/puanı, stok, çıkış tarihi
  4) Trend skoru
Next.js (Vercel Hobby)  →  şifreli arayüz: arama, filtreler, kartlar, takip listesi, Türkiye notları
Supabase (Postgres)     →  tüm veriler; yalnızca sunucu tarafından gizli anahtarla erişilir
```

## Kurulum (yerel)

Gereksinimler: Node.js ≥ 22.18 (TypeScript ek araç olmadan doğrudan `node` ile çalışır), ücretsiz Supabase projesi, ücretsiz Tavily hesabı.

```bash
npm install
cp .env.example .env.local   # değerleri doldurun
```

1. Supabase SQL Editor'de `supabase/migrations/` altındaki dosyaları sırayla çalıştırın (`0001` → `0003`).
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
| `npm run ingest` | Toplama + DTC doğrulama + trend skoru (günlük iş) |
| `npm run ingest -- verify` | Yalnızca doğrulama + skor |

## Ücretsiz katman limitleri

| Servis | Ücretsiz limit | Bu projedeki kullanım |
|---|---|---|
| **Supabase Free** | 500 MB veritabanı, 5 GB çıkış/ay, 2 aktif proje. 7 gün işlem olmazsa proje duraklar | Birkaç MB. Günlük iş projeyi aktif tutar |
| **GitHub Actions** (private repo) | 2.000 dakika/ay (public repoda sınırsız) | ~3–5 dk/gün ≈ 150 dk/ay. Public repolarda 60 gün commit olmazsa zamanlanmış iş durur |
| **Vercel Hobby** | 100 GB veri aktarımı, 1M fonksiyon çağrısı, 4 CPU-saat/ay; fonksiyon süresi 300 sn. **Yalnızca kişisel, ticari olmayan kullanım** | Tek kullanıcı, çok düşük trafik |
| **Tavily Free** | 1.000 kredi/ay, kart istemez (basic arama = 1 kredi) | Kod sınırı: günde 30, ayda 950. Kota dolarsa ürün ertesi güne kalır, ücretli kullanıma **asla** geçilmez |
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

Fiziksel ürün inceleyen blogların herkese açık RSS beslemeleri (`config/sources.ts`): Cool Things, The Gadgeteer, The Awesomer.

- Yazıdaki dış linklerden markanın kendi alan adı bulunur. Affiliate linklerinde hedef adres URL parametresinden okunur; yönlendirmeye istek atılmaz.
- Aynı blogun yazılarının en az %30'unda (en az 3 yazı) geçen alan adları site geneli (menü/sponsor) sayılıp atlanır.
- Yazı ürünü bir pazaryerinde gösteriyorsa ürün doğrudan `rejected_marketplace` olur.
- İşlenen yazılar `seen_items` tablosunda tutulur, tekrar açılmaz.
- Tüm istekler `lib/http.ts` üzerinden: robots.txt'ye uyulur (401/403/429/5xx ihtiyaten "yasak" sayılır), alan adı başına saniyede en fazla 1 istek, User-Agent `ProductFinderBot/0.1`. Giriş gerektiren sayfalara ve CAPTCHA'lara dokunulmaz.

Kullanılmayan kaynaklar ve nedenleri: Reddit (robots.txt `Disallow: /`, API elle onaya bağlı), Kickstarter/Indiegogo (botlara 403), Product Hunt/HN (yazılım ağırlıklı), Google Custom Search (yeni müşteri almıyor), Brave Search (kart istiyor), Okendo/Loox yorum API'leri (robots yasak), Werd gibi "en iyi X" liste blogları (yazı başına 10–20 marka çıkarır; ücretsiz Tavily kotasını birkaç günde bitirir).

## DTC doğrulama (`dtc/verify.ts`)

Her ürün sırayla şu adımlardan geçer; ilk başarısız adımda durur ve gerekçe `products.dtc_reason`'a yazılır:

1. **Alan adı** engel listesindeyse → `rejected_marketplace`.
2. **Marka önbelleği:** marka son 30 günde bir pazaryerinde/büyük perakendecide bulunduysa → ağa çıkmadan `rejected_marketplace`.
3. **Marka sayfası** açılamazsa → `unverified` (ağ/5xx ise ertesi gün yeniden denenir; 403/robots yasağı kalıcı). Link pazaryerine yönleniyorsa → `rejected_marketplace`.
4. **Platform** (Shopify, WooCommerce, BigCommerce, Wix, Squarespace, Magento, Salesforce). Shopify'da `/meta.json` (mağaza ülkesi, şehri, gönderim ülkeleri, marka adı) ve ürün JSON'u okunur. Blog ana sayfaya link verdiyse `/products.json` kataloğunda ürün adıyla aranır (en fazla 3 sayfa).
5. **Satın alma:** `/cart/add` formu, fiyatlı schema.org `Offer` veya "Add to cart / Buy now / Sepete ekle". Yoksa → `unverified`.
6. **Fiziksel ürün:** Shopify `requires_shipping`, kargo/ağırlık bilgisi veya schema.org `Product`+`Offer`. Dijital/yazılım ya da kanıt yoksa → `unverified`.
7. **Ürün araması (Tavily, 1 kredi):** ürün adı yalnızca ~126 pazaryeri/perakendeci alan adında aranır. Marka adı ilan **başlığında** geçmeli; modelin ilk kelimesi ve model kelimelerinin ≥%60'ı bulunmalı. Arama sayfaları, Etsy `/market/`, Facebook'un pazaryeri dışı sayfaları, kariyer/yatırımcı alt alanları sayılmaz. Bulunursa → `rejected_marketplace` ve marka da "found" olur.
8. **Marka araması (katı mod, Tavily, marka başına 30 günde 1 kredi):** marka adı tırnak içinde aranır; marka herhangi bir pazaryerinde/büyük perakendecide satıyorsa ürün elenir. 5 harften kısa marka adlarında (ör. "TDM") ürünün model kelimelerinden biri de geçmelidir. Temizse → `verified`.

Katı mod (`config/limits.ts` içinde `STRICT_BRAND_CHECK`) açıktır: bir markanın tek bir ürünü bile pazaryerinde bulunursa, markanın daha önce doğrulanmış ürünleri de her çalıştırma sonunda elenir.

Önceden doğrulanmış bir ürün yalnızca geçici bir hata (kota, ağ) yüzünden listeden düşmez; durumu korunur ve ertesi gün yeniden kontrol edilir. `verified` ürünler 30 günde bir yeniden kontrol edilir.

**Bilinen sınır:** arama tabanlı kontrol olasılıksaldır. `verified`, "ürün ve marka aramasında hiçbir pazaryeri/büyük perakendeci ilanı bulunamadı" demektir; kesin garanti değildir.

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

## Trend skoru (`lib/score.ts`, 0–100)

| Bileşen | Formül | Açıklama |
|---|---|---|
| Kaynak | `40 × min(S, 3) / 3` | S = ürünü anan farklı blog sayısı |
| Artış | `30 × min(G, 3) / 3` | G = m7 / max(1, (m30 − m7) / 3): son haftanın, önceki 3 haftanın haftalık ortalamasına oranı |
| Hacim | `30 × min(m30, 5) / 5` | m30 = son 30 gündeki bahsedilme sayısı |

Örnek: tek blogda bu hafta bir kez anılan ürün → 13.3 + 10 + 6 = **29.3**. Üç farklı blogda bu hafta anılan ürün → 40 + 30 + 18 = **88**.

## Arayüz

- Varsayılan görünüm yalnızca `verified` ürünler.
- Arama (ürün/marka), durum, **mağaza ülkesi**, **yalnızca Türkiye'ye gönderenler**, kategori, platform, tarih, takip durumu, **minimum yorum**, minimum skor, **fiyat aralığı**; sıralama: skor, **yorum sayısı**, en yeni, fiyat. Filtreler URL'de tutulur.
- Kart: görsel, ürün/marka linki, durum/platform/skor rozetleri, fiyat, yorum ★, stok, satışa çıkış, mağaza ülkesi, Türkiye gönderimi, doğrulama gerekçesi, kaynak yazılar.
- "Takip ve Türkiye notu": favori / incelenecek / elendi, not, "Türkiye'de rakip var mı?", tahmini maliyet, Türkiye notu.

## Pazaryeri ve perakendeci listesi

`config/marketplaces.ts` — ~117 pazaryeri ve çok markalı büyük perakendeci (Amazon, eBay, Etsy, Trendyol, Hepsiburada, n11, Walmart, Target, Best Buy, MediaMarkt, Zalando, Teknosa, Boyner…). Yeni satıcı eklemek için `retailers([...])` listesine `["Ad", "alanadi.com"]` ekleyin. Eşleşme alan adının TLD'siz adına göre yapılır (`amazon` → `amazon.com.tr`, `smile.amazon.de`, `amzn.to`, `link.amazon`). `NOT_OWN_DOMAIN_LABELS` markanın kendi alan adı sayılmayan adresleri (myshopify, sosyal medya, affiliate kısaltıcılar) tutar.

## Kod kuralı

`lib/`, `config/`, `dtc/`, `sources/`, `scripts/` altındaki dosyalar hem Next.js hem doğrudan Node tarafından çalıştırılır: bu klasörlerde **göreli import + `.ts` uzantısı** kullanılır (`../lib/domain.ts`), `@/` alias'ı kullanılmaz ve `enum` gibi yalnızca TypeScript'e özgü sözdizimi yasaktır (`erasableSyntaxOnly`).
