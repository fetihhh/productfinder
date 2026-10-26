-- Aynı kreatifin reklamları tek satırda (dtc/adItems.ts collapseAdItems): reklamların ~%70'i kopya ve ad_items veritabanının
-- yarısını kaplıyordu (Supabase ücretsiz katmanı 500 MB). copies: satırda toplanan reklam sayısı, active_copies: yayında olanlar.
alter table ad_items add column if not exists copies int not null default 1;
alter table ad_items add column if not exists active_copies int;

-- Eski satırları aynı kuralla toplar: her çağrıda kopyası ayrı satırda duran en fazla p_domains mağaza. Dönüş: işlenen mağaza.
create or replace function compact_ad_items(p_domains int) returns int
language plpgsql set search_path = public, pg_temp as $$
declare n int;
begin
  create temp table _d on commit drop as
    select distinct domain from (
      select domain from ad_items group by domain, coalesce(creative_key, id) having count(*) > 1
    ) x limit p_domains;
  get diagnostics n = row_count;
  if n = 0 then return 0; end if;
  create temp table _g on commit drop as
    with r as (
      select a.*, coalesce(a.creative_key, a.id) as k, (a.stop_at is null or a.stop_at > now()) as act
      from ad_items a join _d using (domain)
    ), ranked as (
      select r.*, row_number() over (partition by domain, k order by act desc, start_at asc nulls last, eu_reach desc nulls last, id) as rn
      from r
    )
    select domain, k,
      max(id) filter (where rn = 1) as rep,
      sum(coalesce(copies, 1))::int as copies,
      sum(coalesce(active_copies, case when act then 1 else 0 end))::int as active_copies,
      min(start_at) as start_at,
      bool_or(act) as any_act,
      max(stop_at) as max_stop,
      case when count(eu_reach) > 0 then sum(eu_reach) end as eu_reach,
      max(body) as body,
      count(*) as rows
    from ranked group by domain, k;
  update ad_items a set
    copies = g.copies,
    active_copies = g.active_copies,
    start_at = coalesce(g.start_at, a.start_at),
    stop_at = case when g.any_act then a.stop_at else g.max_stop end,
    eu_reach = g.eu_reach,
    body = coalesce(a.body, g.body),
    platforms = (select coalesce(array_agg(distinct p), '{}') from ad_items b, unnest(b.platforms) p where b.domain = g.domain and coalesce(b.creative_key, b.id) = g.k),
    countries = (select coalesce(array_agg(distinct c), '{}') from ad_items b, unnest(b.countries) c where b.domain = g.domain and coalesce(b.creative_key, b.id) = g.k)
  from _g g where a.id = g.rep and g.rows > 1;
  delete from ad_items a using _g g
    where a.domain = g.domain and coalesce(a.creative_key, a.id) = g.k and a.id <> g.rep and g.rows > 1;
  return n;
end;
$$;
revoke execute on function compact_ad_items(int) from public, anon, authenticated;
grant execute on function compact_ad_items(int) to service_role;
