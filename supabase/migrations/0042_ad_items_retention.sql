-- Reklam arşivi saklama süresi: 60 günden önce durmuş reklamlar silinir (lib/ads.ts AD_KEEP_STOPPED_DAYS; kaydederken de
-- tutulmaz). Her çağrıda en fazla p_limit satır, böylece tek sorgu zaman aşımına düşmez. Dönüş: silinen satır.
create or replace function prune_ad_items(p_days int, p_limit int) returns int
language sql set search_path = public, pg_temp as $$
  with d as (
    delete from ad_items where id in (
      select id from ad_items where stop_at < now() - make_interval(days => p_days) limit p_limit
    ) returning 1
  )
  select count(*)::int from d;
$$;
revoke execute on function prune_ad_items(int, int) from public, anon, authenticated;
grant execute on function prune_ad_items(int, int) to service_role;
