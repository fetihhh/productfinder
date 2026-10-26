-- store_items eşitlemesi zaman dilimleriyle: bir kez zaman aşımına uğrayınca "son eşitleme" zamanı geride kalıyor, pencere
-- her çalıştırmada büyüyüp sorgu hep zaman aşımına düşüyordu (kısır döngü). Uygulama pencereyi saatlik dilimlerle işler.
create index if not exists stores_last_checked_at_idx on stores (last_checked_at);
create or replace function sync_store_items(per_store int, p_since timestamptz, p_until timestamptz) returns int
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
    where s.status in ('live', 'old') and s.products_snapshot is not null
      and s.last_checked_at >= p_since and s.last_checked_at < p_until and x.n <= per_store and i->>'h' is not null
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
revoke execute on function sync_store_items(int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function sync_store_items(int, timestamptz, timestamptz) to service_role;
drop function if exists sync_store_items(int);
