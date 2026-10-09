-- Product Finder: ilk şema.
-- Uygulama ve cron yalnızca SUPABASE_SECRET_KEY ile (RLS'i aşan sunucu anahtarı) erişir.
-- RLS tüm tablolarda açık ve hiç policy yok → anon/publishable anahtar hiçbir şey okuyamaz.

create type dtc_status as enum ('verified', 'rejected_marketplace', 'unverified');
create type track_status as enum ('favorite', 'review', 'rejected');

-- Alan adı düzeyindeki kontroller (platform, satın alma özelliği). Bir markanın birden çok ürünü olabilir.
create table brands (
  domain        text primary key,           -- eTLD+1, ör. allbirds.com
  platform      text,                       -- shopify | woocommerce | bigcommerce | wix | squarespace | unknown
  has_checkout  boolean,
  check_reason  text,
  checked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table products (
  id               uuid primary key default gen_random_uuid(),
  brand_domain     text not null references brands(domain) on delete cascade,
  name             text not null,
  normalized_name  text not null,           -- tekrar birleştirme anahtarı
  product_url      text,
  image_url        text,
  category         text,
  dtc_status       dtc_status not null default 'unverified',
  dtc_reason       text,
  dtc_checked_at   timestamptz,
  trend_score      numeric(5,2) not null default 0,
  score_breakdown  jsonb,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (brand_domain, normalized_name)
);
create index products_status_score_idx on products (dtc_status, trend_score desc);

-- Her kaynaktaki her bahsedilme ayrı satır; trend skoru buradan hesaplanır.
create table mentions (
  id              bigint generated always as identity primary key,
  product_id      uuid not null references products(id) on delete cascade,
  source          text not null,            -- producthunt | hackernews | reddit ...
  source_item_id  text not null,
  url             text not null,
  title           text,
  engagement      integer not null default 0,  -- upvote/oy
  comments        integer not null default 0,
  posted_at       timestamptz not null,
  fetched_at      timestamptz not null default now(),
  unique (source, source_item_id)
);
create index mentions_product_posted_idx on mentions (product_id, posted_at desc);

-- Elle doldurulan alanlar: takip listesi + Türkiye uygunluk notu.
create table tracking (
  product_id     uuid primary key references products(id) on delete cascade,
  status         track_status,
  note           text,
  tr_competitor  text,                      -- "Türkiye'de rakip var mı?"
  tr_est_cost    text,                      -- tahmini maliyet
  tr_note        text,
  updated_at     timestamptz not null default now()
);

-- Ücretsiz kota takibi (ör. Tavily: günlük üst sınır + aylık 1.000).
create table api_usage (
  provider  text not null,
  day       date not null default current_date,
  count     integer not null default 0,
  primary key (provider, day)
);

-- Atomik sayaç: kotayı aşacaksa artırmaz ve false döner.
create function try_consume_api_quota(p_provider text, p_daily_limit int, p_monthly_limit int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  used_today int;
  used_month int;
begin
  perform pg_advisory_xact_lock(hashtext(p_provider));
  select coalesce(sum(count) filter (where day = current_date), 0),
         coalesce(sum(count), 0)
    into used_today, used_month
    from api_usage
   where provider = p_provider
     and day >= date_trunc('month', current_date)::date;
  if used_today >= p_daily_limit or used_month >= p_monthly_limit then
    return false;
  end if;
  insert into api_usage (provider, day, count) values (p_provider, current_date, 1)
  on conflict (provider, day) do update set count = api_usage.count + 1;
  return true;
end;
$$;

alter table brands    enable row level security;
alter table products  enable row level security;
alter table mentions  enable row level security;
alter table tracking  enable row level security;
alter table api_usage enable row level security;

revoke execute on function try_consume_api_quota(text, int, int) from public, anon, authenticated;
grant execute on function try_consume_api_quota(text, int, int) to service_role;
