-- compact_ad_items her çağrıda kopyası olan mağazaları bulmak için tüm tabloyu (220 MB) tarıyor ve zaman aşımına düşüyordu
-- (hiçbir çalıştırmada bitmedi). Artık mağazalar alan adı sırasıyla, indeksle gezilir: her çağrı p_after'dan sonraki
-- p_domains mağazayı işler ve son alan adını döndürür (bitince null). Saklama süresi dolan durmuş reklamlar da aynı geçişte
-- silinir (stop_at üzerinde indeks olmadığı için ayrı silme de tüm tabloyu tarıyordu).
create or replace function compact_ad_items(p_after text, p_domains int, p_keep_days int) returns text
language plpgsql set search_path = public, pg_temp as $$
declare last_domain text;
begin
  create temp table _d on commit drop as
    select distinct domain from ad_items where domain > coalesce(p_after, '') order by domain limit p_domains;
  select max(domain) into last_domain from _d;
  if last_domain is null then return null; end if;

  delete from ad_items a using _d d
    where a.domain = d.domain and a.stop_at < now() - make_interval(days => p_keep_days);

  create temp table _r on commit drop as
    select a.*, coalesce(a.creative_key, a.id) as k, (a.stop_at is null or a.stop_at > now()) as act
    from ad_items a join _d using (domain);
  create temp table _g on commit drop as
    with ranked as (
      select r.*, row_number() over (partition by domain, k order by act desc, start_at asc nulls last, eu_reach desc nulls last, id) as rn
      from _r r
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
    from ranked group by domain, k having count(*) > 1;
  update ad_items a set
    copies = g.copies,
    active_copies = g.active_copies,
    start_at = coalesce(g.start_at, a.start_at),
    stop_at = case when g.any_act then a.stop_at else g.max_stop end,
    eu_reach = g.eu_reach,
    body = coalesce(a.body, g.body),
    platforms = (select coalesce(array_agg(distinct p), '{}') from _r b, unnest(b.platforms) p where b.domain = g.domain and b.k = g.k),
    countries = (select coalesce(array_agg(distinct c), '{}') from _r b, unnest(b.countries) c where b.domain = g.domain and b.k = g.k)
  from _g g where a.id = g.rep;
  delete from ad_items a using _g g
    where a.domain = g.domain and coalesce(a.creative_key, a.id) = g.k and a.id <> g.rep;
  return last_domain;
end;
$$;
revoke execute on function compact_ad_items(text, int, int) from public, anon, authenticated;
grant execute on function compact_ad_items(text, int, int) to service_role;
drop function if exists compact_ad_items(int);
