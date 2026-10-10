-- Mağaza detayı: ürün listesinin anlık görüntüsü (ürün bazında stok/fiyat hareketi) ve puan dökümü.
alter table stores
  add column products_snapshot jsonb,             -- en fazla 60 ürün: fiyat, stok, AliExpress görseli, stok azalma/fiyat değişim sayısı
  add column score_parts       jsonb,             -- mağaza puanı bileşenleri (odak, yenilik, dropship, indirim, fiyat, hareket, merch)
  add column stock_drops       integer not null default 0, -- ürünlerde toplam stok azalma sayısı (satış işareti)
  add column moving_products   integer not null default 0; -- en az bir kez stoğu azalan ürün sayısı
