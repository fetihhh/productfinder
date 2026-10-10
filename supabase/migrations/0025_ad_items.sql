-- Mağazanın tek tek reklamları (Meta Reklam Kütüphanesi, son 150 gün; en fazla 100 + yayındaki 100): ürün sayfasında
-- sıralanabilir reklam listesi. Her reklam aramasında yenilenir; arşivden düşen reklamlar silinir.
create table ad_items (
  id            text primary key,
  domain        text not null,
  page_id       text,
  page_name     text,
  start_at      timestamptz,
  stop_at       timestamptz,
  title         text,
  body          text,
  description   text,
  platforms     text[] not null default '{}',
  eu_reach      bigint,
  countries     text[] not null default '{}',
  female_share  numeric(4,3),
  top_age       text,
  creative_key  text,
  checked_at    timestamptz not null default now()
);
create index ad_items_domain_idx on ad_items (domain);
alter table ad_items enable row level security;
