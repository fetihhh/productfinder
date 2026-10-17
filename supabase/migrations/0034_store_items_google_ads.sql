-- Ürün bazında kopya tespiti ve stok hareketi: mağazaların anlık görüntüsündeki ürünler (mağaza başına hareket sırasına
-- göre ilk N ürün) ayrı satırlarda tutulur; öne çıkan ürünle sınırlı kalmadan aynı ürünü satan mağazalar bulunur.
create table if not exists store_items (
  domain text not null references stores(domain) on delete cascade,
  handle text not null,
  title text,
  image text,
  price numeric,
  -- stok azalma sayısı (iki kontrol arasında stokta olan varyant azaldı)
  so int not null default 0,
  -- AliExpress görsel kimliği (dosya adından) ve görsel adresindeki Shopify mağaza kimliği
  ali text,
  shop_id text,
  -- öne çıkan görselin 256 bitlik dHash özeti (onaltılık); görsel değişince sıfırlanır
  hash text,
  hashed_at timestamptz,
  copy_group text,
  copies int not null default 0,
  same_seller boolean not null default false,
  -- kopyası çok olduğu için aday yapıldıysa ürün
  product_id uuid,
  updated_at timestamptz not null default now(),
  primary key (domain, handle)
);
create index if not exists store_items_due on store_items (so desc) where hashed_at is null;
create index if not exists store_items_copies on store_items (copies desc) where copies > 0;
alter table store_items enable row level security;

create or replace function sync_store_items(per_store int) returns int
language sql set search_path = public, pg_temp as $$
  with src as (
    select distinct on (s.domain, i->>'h')
      s.domain,
      i->>'h' as handle,
      left(i->>'t', 160) as title,
      i->>'img' as image,
      case when jsonb_typeof(i->'p') = 'number' then (i->>'p')::numeric end as price,
      coalesce((i->>'so')::int, 0) as so,
      coalesce(i->>'ai', substring(split_part(split_part(i->>'img', '?', 1), '/', -1) from '^([SHUA][0-9a-f]{32}[a-z])(?:[_-][A-Za-z0-9_-]*)?\.(?:jpe?g|png|webp|avif|gif)$')) as ali
    from stores s, jsonb_array_elements(s.products_snapshot) with ordinality as x(i, n)
    where s.status in ('live', 'old') and s.products_snapshot is not null and x.n <= per_store and i->>'h' is not null
  ), up as (
    insert into store_items as t (domain, handle, title, image, price, so, ali, shop_id)
    select domain, handle, title, image, price, so, ali, substring(image from '/s/files/1/(\d+/\d+/\d+)/') from src
    on conflict (domain, handle) do update set
      title = excluded.title,
      image = excluded.image,
      price = excluded.price,
      so = excluded.so,
      ali = coalesce(excluded.ali, t.ali),
      shop_id = excluded.shop_id,
      hash = case when t.image is distinct from excluded.image then null else t.hash end,
      hashed_at = case when t.image is distinct from excluded.image then null else t.hashed_at end,
      updated_at = now()
    where (t.title, t.image, t.price, t.so) is distinct from (excluded.title, excluded.image, excluded.price, excluded.so)
       or (excluded.ali is not null and t.ali is distinct from excluded.ali)
    returning 1
  )
  select count(*)::int from up;
$$;
revoke execute on function sync_store_items(int) from public, anon, authenticated;
grant execute on function sync_store_items(int) to service_role;

-- Türkiye'de reklam veren Google reklamverenleri (Google Reklam Şeffaflık Merkezi'nin resmi BigQuery veri seti; AB ve
-- Türkiye'de gösterilen tüm reklamlar). Haftalık özet: reklam sayısı, son 30 günde başlayanlar, gösterim aralığı.
create table if not exists google_advertisers (
  advertiser_id text primary key,
  name text,
  legal_name text,
  location text,
  verified text,
  creatives int not null default 0,
  new_30d int not null default 0,
  active_7d int not null default 0,
  formats jsonb,
  topics jsonb,
  first_shown date,
  last_shown date,
  impressions_low bigint,
  impressions_high bigint,
  sample_url text,
  -- bilinen bir mağazayla eşleşirse alan adı
  domain text,
  updated_at timestamptz not null default now()
);
create index if not exists google_advertisers_rank on google_advertisers (new_30d desc, active_7d desc);
alter table google_advertisers enable row level security;
