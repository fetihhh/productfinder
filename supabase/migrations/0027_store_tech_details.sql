-- Marka künyesi (ana sayfadan izleme kodları, uygulamalar, ödeme, iletişim, kargo/iade vaadi) ve ürün ayrıntıları
-- (öne çıkan, aday ve en hareketli ürünlerin seçenek/varyant/fotoğraf/açıklama maddeleri; tükenen varyant günleri).
alter table stores
  add column tech jsonb,
  add column tech_at timestamptz,
  add column details jsonb;
