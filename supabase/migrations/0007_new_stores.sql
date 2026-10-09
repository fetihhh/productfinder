-- Yeni mağaza keşfi: yeni kayıtlı alan adlarından Shopify mağazaları, düzenli kontroller ve mağaza yaşı.

create table stores (
  domain           text primary key,
  source           text not null,                 -- whoisds (günlük liste) | nrd60 (son 60 gün başlangıç listesi)
  registered_on    date,                          -- listedeki kayıt günü ya da RDAP kayıt tarihi
  discovered_at    timestamptz not null default now(),
  status           text not null default 'pending', -- pending | closed (şifreli/boş) | live | dead | old (150 günü geçti)
  shop_name        text,
  country          text,
  ships_to_tr      boolean,
  product_count    integer,
  physical_count   integer,
  discounted_count integer,                       -- indirimli (compare_at_price) ürün sayısı
  min_price        numeric(12,2),
  max_price        numeric(12,2),
  currency         text,
  first_product_at timestamptz,
  last_product_at  timestamptz,
  hero_handle      text,
  hero_title       text,
  hero_image       text,
  hero_price       numeric(12,2),
  store_score      numeric(5,1) not null default 0,
  checks           integer not null default 0,
  last_checked_at  timestamptz,
  next_check_at    timestamptz not null default now(),
  product_id       uuid references products (id) on delete set null  -- öne çıkan ürün aday olarak eklendiyse
);
create index stores_due_idx on stores (next_check_at) where status in ('pending', 'closed', 'live');
create index stores_status_score_idx on stores (status, store_score desc);

-- Her kontroldeki ürün/stok durumu (mağazanın büyüyüp büyümediği, stokların tükenip tükenmediği).
create table store_checks (
  domain             text not null references stores (domain) on delete cascade,
  day                date not null,
  status             text not null,
  product_count      integer,
  available_variants integer,
  total_variants     integer,
  primary key (domain, day)
);

-- Başlangıç listesinin (60 günlük) işlenme konumu gibi küçük durum bilgileri.
create table job_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Marka/mağaza yaşı: alan adı kayıt tarihi (RDAP) ve mağazadaki ilk ürünün yayın tarihi.
alter table brands
  add column registered_at    date,
  add column first_product_at timestamptz,
  add column age_checked_at   timestamptz;

alter table stores       enable row level security;
alter table store_checks enable row level security;
alter table job_state    enable row level security;
