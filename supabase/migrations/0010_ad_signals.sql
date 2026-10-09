-- Reklam sinyali: Meta Reklam Kütüphanesi'nde (resmi, ücretsiz API) mağazanın/markanın reklamları.
-- Uzun süredir yayında olan ve yeni açılan reklamlar, ürünün sattığının en güçlü kamuya açık işaretidir.

create table ad_signals (
  domain              text primary key,
  page_id             text,                          -- reklamı veren Facebook sayfası (bulunduysa sonraki aramalar bununla yapılır)
  page_name           text,
  active_ads          integer not null default 0,
  total_ads           integer not null default 0,    -- son 150 günde yayına giren
  new_ads_14d         integer not null default 0,    -- son 14 günde yayına giren
  first_ad_at         timestamptz,
  last_ad_at          timestamptz,
  longest_active_days integer,                       -- hâlâ yayında olan en eski reklamın yaşı
  eu_reach            bigint,                        -- AB'deki tahmini toplam erişim
  platforms           text[] not null default '{}',
  samples             jsonb not null default '[]',   -- en fazla 3 örnek reklam (başlık, metin, başlangıç, arşiv bağlantısı)
  ad_points           numeric(4,1) not null default 0,
  checked_at          timestamptz not null default now(),
  next_check_at       timestamptz not null default now()
);

create table ad_history (
  domain      text not null references ad_signals (domain) on delete cascade,
  day         date not null,
  active_ads  integer not null,
  total_ads   integer not null,
  eu_reach    bigint,
  primary key (domain, day)
);

-- Mağaza puanına reklam puanı eklenir (en fazla 100); aday seçimi ve sıralama toplam puanla yapılır.
alter table stores
  add column ad_points  numeric(4,1) not null default 0,
  add column ads_active integer,
  add column total_score numeric(5,1) generated always as (least(100, store_score + ad_points)) stored;
create index stores_status_total_idx on stores (status, total_score desc);

alter table brands
  add column ad_points  numeric(4,1) not null default 0,
  add column ads_active integer;

alter table ad_signals enable row level security;
alter table ad_history enable row level security;
