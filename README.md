# Product Finder

Pazaryerlerinde satılmayan, markanın kendi alan adında satılan (DTC) trend ürünleri bulan tek kullanıcılı araç. Aylık maliyet hedefi: **0 $**.

> Bu README fazlar ilerledikçe tamamlanacak (ücretsiz katman limitleri, trend skoru formülü, deploy). Şu an Faz D durumu.

## Gereksinimler

- Node.js ≥ 22.18 (TypeScript dosyaları ek araç olmadan doğrudan `node` ile çalışır)
- Ücretsiz bir Supabase projesi

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldurun
```

1. Supabase SQL Editor'de `supabase/migrations/` altındaki dosyaları sırayla (`0001`, `0002`) çalıştırın.
2. `.env.local` içinde `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_PASSWORD`, `AUTH_SECRET` değerlerini girin.
3. `npm run dev` → http://localhost:3000 → şifreyle giriş.

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm test` | Birim testleri (`node --test`) |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run ingest` | Toplama + DTC doğrulama (günlük iş) |
| `npm run ingest -- verify` | Yalnızca DTC doğrulama |

## Kod kuralı

`lib/`, `config/`, `dtc/`, `sources/`, `scripts/` altındaki dosyalar hem Next.js hem doğrudan Node tarafından çalıştırılır. Bu yüzden bu klasörlerde **göreli import + `.ts` uzantısı** kullanılır (`../lib/domain.ts`), `@/` alias'ı kullanılmaz ve `enum` gibi yalnızca TypeScript'e özgü sözdizimi yasaktır (`erasableSyntaxOnly`).

## Veri kaynakları

Fiziksel ürün inceleyen blogların herkese açık RSS beslemeleri (`config/sources.ts`): Cool Things, The Gadgeteer, The Awesomer. API anahtarı ve ücret yok.

- Her yazıdaki dış linklerden markanın kendi alan adı bulunur; affiliate linklerinde hedef adres URL parametresinden okunur (yönlendirmeye istek atılmaz).
- Aynı blogun yazılarının en az %30'unda (en az 3 yazı) geçen alan adları site geneli (menü/sponsor) sayılıp atlanır.
- Yazı ürünü bir pazaryerinde de gösteriyorsa ürün doğrudan `rejected_marketplace` olarak işaretlenir.
- Tüm istekler `lib/http.ts` üzerinden gider: robots.txt'ye uyulur (401/403/429/5xx ihtiyaten "yasak" sayılır), alan adı başına saniyede en fazla 1 istek, User-Agent `ProductFinderBot/0.1`.

Elenen kaynaklar: Reddit (robots.txt `Disallow: /`, API elle onaya bağlı), Kickstarter/Indiegogo (botlara 403), Product Hunt/HN (yazılım ağırlıklı).

## DTC doğrulama (`dtc/verify.ts`)

Her ürün sırayla şu adımlardan geçer; ilk başarısız adımda durur ve gerekçe `products.dtc_reason`'a yazılır:

1. **Alan adı:** engel listesindeyse → `rejected_marketplace`.
2. **Marka sayfası:** açılamazsa → `unverified` (ağ/5xx hatasıysa ertesi gün yeniden denenir; 403/robots yasağı kalıcıdır). Link pazaryerine yönleniyorsa → `rejected_marketplace`.
3. **Platform:** Shopify, WooCommerce, BigCommerce, Wix, Squarespace, Magento, Salesforce izleri. Blog ana sayfaya link verdiyse Shopify'da `/products.json` kataloğunda ürün adıyla aranır (en fazla 3 sayfa).
4. **Satın alma:** `/cart/add` formu, fiyatlı schema.org `Offer` veya "Add to cart / Buy now / Sepete ekle" butonu. Yoksa → `unverified`.
5. **Fiziksel ürün:** Shopify `requires_shipping`, kargo/ağırlık bilgisi veya schema.org `Product`+`Offer`. Dijital/yazılım ürünü ya da kanıt yoksa → `unverified`.
6. **Pazaryeri araması (Tavily):** ürün adı yalnızca pazaryeri alan adlarında aranır. Marka adı ilan **başlığında** geçmeli ve modelin ilk kelimesi + model kelimelerinin ≥%60'ı bulunmalı. Arama sayfaları ve Facebook'un pazaryeri dışı sayfaları sayılmaz; markanın pazaryeri mağaza sayfası (`amazon.com/stores/…`) kanıt sayılır. Eşleşme varsa → `rejected_marketplace`, yoksa → `verified`.

Tavily yalnızca 1–5. adımları geçen ürünler için çağrılır. Kota: günde 30, ayda 950 arama (`config/limits.ts`, sayaç veritabanında atomik). Kota dolarsa ürün `unverified` kalır ve ertesi gün yeniden denenir; ücretli kullanıma asla geçilmez. `verified` ürünler 30 günde bir yeniden kontrol edilir.

Bilinen sınır: arama tabanlı kontrol olasılıksaldır. Tavily her ilanı bulamayabilir; `verified`, "aramada pazaryeri ilanı bulunamadı" demektir, kesin garanti değildir.

## Trend skoru (`lib/score.ts`, 0–100)

Kaynak bloglar upvote vermediği için skor yalnızca bahsedilmelerden hesaplanır:

| Bileşen | Formül | Açıklama |
|---|---|---|
| Kaynak | `40 × min(S, 3) / 3` | S = ürünü anan farklı blog sayısı |
| Artış | `30 × min(G, 3) / 3` | G = m7 / max(1, (m30 − m7) / 3): son haftanın, önceki 3 haftanın haftalık ortalamasına oranı |
| Hacim | `30 × min(m30, 5) / 5` | m30 = son 30 gündeki bahsedilme sayısı |

Örnek: tek blogda bu hafta bir kez anılan ürün → 13.3 + 10 + 6 = **29.3**. Üç farklı blogda bu hafta anılan ürün → 40 + 30 + 18 = **88**. Skor her `npm run ingest` sonunda yeniden hesaplanır; kartta skorun üzerine gelince bileşenler görünür.

## Arayüz

- Varsayılan görünüm yalnızca `verified` ürünleri gösterir; durum filtresinden diğerleri seçilebilir.
- Arama (ürün/marka adı), kategori, platform, tarih (7/30/90 gün), takip durumu, minimum skor filtreleri ve skor/yenilik sıralaması. Filtreler URL'de tutulur.
- Kart: görsel, ürün ve marka sitesi linki, durum/platform/skor rozetleri, doğrulama gerekçesi, kaynak yazı linkleri.
- "Takip ve Türkiye notu": favori / incelenecek / elendi, not, "Türkiye'de rakip var mı?", tahmini maliyet, Türkiye notu.

## Pazaryeri engel listesi

`config/marketplaces.ts` — yeni pazaryeri eklemek için `MARKETPLACES` dizisine bir satır ekleyin. Eşleşme alan adının TLD'siz adına göre yapılır (`amazon` → `amazon.com.tr`, `smile.amazon.de`, `amzn.to`, `link.amazon`). Listede çok markalı büyük perakendeciler (Best Buy, Target, Costco…) de var. `NOT_OWN_DOMAIN_LABELS` ise markanın kendi alan adı sayılmayan adresleri (myshopify, sosyal medya, affiliate kısaltıcılar) tutar.
