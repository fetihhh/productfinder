-- Büyük marka filtresi ve toptancı (tedarikçi) adayları.

-- Dünya trafik sıralamasında üst sıralardaki markalar (Tranco) elenir: amaç küçük markaların ürünleri.
alter type dtc_status add value if not exists 'rejected_big_brand';

alter table products
  add column product_type        text,           -- Shopify product_type (toptancı aramasında genel ürün türü)
  add column supplier_checked_at timestamptz,
  add column supplier_count      integer,        -- benzerlik eşiğini geçen toptancı ilanı sayısı
  add column supplier_min_usd    numeric(12,2),  -- en iyi eşleşmelerdeki en düşük birim fiyat (yaklaşık USD)
  add column margin_ratio        numeric(6,2);   -- perakende fiyat / toptan fiyat

-- Ürün başına son aramada bulunan toptancı ilanları (her aramada yenilenir).
create table suppliers (
  product_id    uuid        not null references products (id) on delete cascade,
  url           text        not null,
  source        text        not null,          -- aliexpress | alibaba | madeinchina
  title         text        not null,
  image_url     text,
  price_min     numeric(12,2),
  price_max     numeric(12,2),
  currency      text,
  moq           text,                          -- en az sipariş adedi (ör. "2 pieces")
  sold          integer,                       -- AliExpress satış adedi
  supplier_name text,
  similarity    numeric(4,3) not null,         -- arama sözcüklerinin ilan başlığında geçme oranı
  found_at      timestamptz not null default now(),
  primary key (product_id, url)
);

alter table suppliers enable row level security;
