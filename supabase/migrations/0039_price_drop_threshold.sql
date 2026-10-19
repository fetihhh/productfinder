-- Fiyat düşüşü listeleri: %3'ten küçük fark (kur oynaması, yuvarlama: 191 → 190) indirim sayılmaz (dtc/stock.ts PRICE_CHANGE_MIN).
create or replace function sales_watch(p_days int, p_min_score numeric, p_filter text, p_limit int)
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
    when 'price_drop' then p.price_prev is not null and p.price <= p.price_prev * 0.97 and p.price_changed_at >= now() - make_interval(days => p_days)
    when 'stock' then coalesce(sum(s.sold_out), 0) + coalesce(sum(s.units_sold), 0) > 0
    when 'low' then p.variants_total > 0 and p.variants_available * 2 <= p.variants_total
    else true end
  order by
    case when p_filter = 'stock' then coalesce(sum(s.units_sold), 0) * 10 + coalesce(sum(s.sold_out), 0) else 0 end desc,
    p.winner_score desc nulls last
  limit p_limit;
$$;
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
      when 'price_drop' then i.prev_price is not null and i.price <= i.prev_price * 0.97
      when 'stock' then i.so > 0
      else i.so > 0 or (i.prev_price is not null and i.price <= i.prev_price * 0.97) end
  order by i.so desc, i.copies desc, i.last_move desc
  limit p_limit;
$$;
