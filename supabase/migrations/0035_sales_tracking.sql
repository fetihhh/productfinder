-- Satış takibi: ürün başına fiyat/indirim, varyant stoğu (tükenen / yeniden gelen), görünüyorsa kalan adet ve satılan
-- adet (adet azalması). Winner ürünler günde iki kez, diğerleri daha seyrek ölçülür; gün içindeki ölçümler aynı satırda
-- birikir. Mağaza bazında (store_items) her izlenen mağazanın ürünlerinde de fiyat ve stok hareketi tutulur.
alter table product_snapshots
  add column if not exists compare_at numeric,
  add column if not exists variants_available int,
  add column if not exists variants_total int,
  add column if not exists inventory int,
  add column if not exists stock_tracked boolean,
  add column if not exists measured_at timestamptz,
  add column if not exists checks int not null default 0,
  add column if not exists sold_out int not null default 0,
  add column if not exists restocked int not null default 0,
  add column if not exists units_sold int not null default 0;

alter table products
  add column if not exists last_measured_at timestamptz,
  add column if not exists price_prev numeric,
  add column if not exists price_changed_at timestamptz,
  add column if not exists compare_at numeric,
  add column if not exists variants_available int,
  add column if not exists variants_total int,
  add column if not exists inventory int,
  add column if not exists stock_tracked boolean;

alter table store_items
  add column if not exists compare_at numeric,
  add column if not exists avail int,
  add column if not exists variants int,
  add column if not exists price_changes int not null default 0,
  add column if not exists prev_price numeric,
  add column if not exists last_move date;

create or replace function sync_store_items(per_store int) returns int
language sql set search_path = public, pg_temp as $$
  with src as (
    select distinct on (s.domain, i->>'h')
      s.domain,
      i->>'h' as handle,
      left(i->>'t', 160) as title,
      i->>'img' as image,
      case when jsonb_typeof(i->'p') = 'number' then (i->>'p')::numeric end as price,
      case when jsonb_typeof(i->'cp') = 'number' then (i->>'cp')::numeric end as compare_at,
      case when jsonb_typeof(i->'a') = 'number' then (i->>'a')::int end as avail,
      case when jsonb_typeof(i->'v') = 'number' then (i->>'v')::int end as variants,
      coalesce((i->>'so')::int, 0) as so,
      coalesce((i->>'pc')::int, 0) as price_changes,
      case when jsonb_typeof(i->'pp') = 'number' then (i->>'pp')::numeric end as prev_price,
      case when i->>'ld' ~ '^\d{4}-\d{2}-\d{2}$' then (i->>'ld')::date end as last_move,
      coalesce(i->>'ai', substring(split_part(split_part(i->>'img', '?', 1), '/', -1) from '^([SHUA][0-9a-f]{32}[a-z])(?:[_-][A-Za-z0-9_-]*)?\.(?:jpe?g|png|webp|avif|gif)$')) as ali
    from stores s, jsonb_array_elements(s.products_snapshot) with ordinality as x(i, n)
    where s.status in ('live', 'old') and s.products_snapshot is not null and x.n <= per_store and i->>'h' is not null
  ), up as (
    insert into store_items as t (domain, handle, title, image, price, compare_at, avail, variants, so, price_changes, prev_price, last_move, ali, shop_id)
    select domain, handle, title, image, price, compare_at, avail, variants, so, price_changes, prev_price, last_move, ali,
      substring(image from '/s/files/1/(\d+/\d+/\d+)/') from src
    on conflict (domain, handle) do update set
      title = excluded.title,
      image = excluded.image,
      price = excluded.price,
      compare_at = excluded.compare_at,
      avail = excluded.avail,
      variants = excluded.variants,
      so = excluded.so,
      price_changes = excluded.price_changes,
      prev_price = excluded.prev_price,
      last_move = excluded.last_move,
      ali = coalesce(excluded.ali, t.ali),
      shop_id = excluded.shop_id,
      hash = case when t.image is distinct from excluded.image then null else t.hash end,
      hashed_at = case when t.image is distinct from excluded.image then null else t.hashed_at end,
      updated_at = now()
    where (t.title, t.image, t.price, t.so, t.compare_at, t.avail, t.variants, t.price_changes, t.last_move)
          is distinct from (excluded.title, excluded.image, excluded.price, excluded.so, excluded.compare_at, excluded.avail, excluded.variants, excluded.price_changes, excluded.last_move)
       or (excluded.ali is not null and t.ali is distinct from excluded.ali)
    returning 1
  )
  select count(*)::int from up;
$$;
revoke execute on function sync_store_items(int) from public, anon, authenticated;
grant execute on function sync_store_items(int) to service_role;

-- Satış takibi listesi: son p_days gündeki ölçümlerin özeti (tükenen/yeniden gelen varyant, satılan adet, yorum artışı).
-- p_filter: 'price_drop' (fiyatı düşenler), 'stock' (stok hareketi olanlar), 'low' (varyantların yarısı ya da fazlası tükendi), diğer: hepsi.
drop function if exists sales_watch(int, numeric, text, int);
create function sales_watch(p_days int, p_min_score numeric, p_filter text, p_limit int)
returns table (
  id uuid, name text, brand_domain text, product_url text, image_url text, winner_score numeric, dtc_status text, currency text,
  price numeric, price_prev numeric, price_changed_at timestamptz, compare_at numeric,
  variants_available int, variants_total int, inventory int, stock_tracked boolean, last_measured_at timestamptz,
  sold_out int, restocked int, units_sold int, reviews_start int, reviews_end int, days_measured int,
  min_price numeric, max_price numeric, supplier_sold_per_week numeric
)
language sql stable set search_path = public, pg_temp as $$
  select p.id, p.name, p.brand_domain, p.product_url, p.image_url, p.winner_score, p.dtc_status, p.currency,
    p.price, p.price_prev, p.price_changed_at, p.compare_at,
    p.variants_available, p.variants_total, p.inventory, p.stock_tracked, p.last_measured_at,
    coalesce(sum(s.sold_out), 0)::int, coalesce(sum(s.restocked), 0)::int, coalesce(sum(s.units_sold), 0)::int,
    (array_agg(s.review_count order by s.day) filter (where s.review_count is not null))[1],
    (array_agg(s.review_count order by s.day desc) filter (where s.review_count is not null))[1],
    count(s.day)::int, min(s.price), max(s.price), p.supplier_sold_per_week
  from products p
  left join product_snapshots s on s.product_id = p.id and s.day >= current_date - p_days
  where p.last_measured_at is not null and coalesce(p.winner_score, 0) >= p_min_score
  group by p.id
  having case p_filter
    when 'price_drop' then p.price_prev is not null and p.price < p.price_prev and p.price_changed_at >= now() - make_interval(days => p_days)
    when 'stock' then coalesce(sum(s.sold_out), 0) + coalesce(sum(s.units_sold), 0) > 0
    when 'low' then p.variants_total > 0 and p.variants_available * 2 <= p.variants_total
    else true end
  order by
    case when p_filter = 'stock' then coalesce(sum(s.units_sold), 0) * 10 + coalesce(sum(s.sold_out), 0) else 0 end desc,
    p.winner_score desc nulls last
  limit p_limit;
$$;
revoke execute on function sales_watch(int, numeric, text, int) from public, anon, authenticated;
grant execute on function sales_watch(int, numeric, text, int) to service_role;

-- Mağaza ürünlerinde hareket: son p_days günde fiyatı düşen ya da stoğu azalan ürünler (tüm izlenen mağazalar).
create or replace function store_item_moves(p_days int, p_filter text, p_limit int)
returns table (
  domain text, handle text, title text, image text, price numeric, prev_price numeric, compare_at numeric,
  avail int, variants int, so int, price_changes int, last_move date, copies int, shop_name text, currency text, total_score numeric
)
language sql stable set search_path = public, pg_temp as $$
  select i.domain, i.handle, i.title, i.image, i.price, i.prev_price, i.compare_at, i.avail, i.variants, i.so, i.price_changes,
    i.last_move, case when i.same_seller then 0 else i.copies end, s.shop_name, s.currency, s.total_score
  from store_items i join stores s on s.domain = i.domain
  where s.status = 'live' and i.last_move >= current_date - p_days
    and case p_filter
      when 'price_drop' then i.prev_price is not null and i.price < i.prev_price
      when 'stock' then i.so > 0
      else i.so > 0 or (i.prev_price is not null and i.price < i.prev_price) end
  order by i.so desc, i.copies desc, i.last_move desc
  limit p_limit;
$$;
revoke execute on function store_item_moves(int, text, int) from public, anon, authenticated;
grant execute on function store_item_moves(int, text, int) to service_role;
