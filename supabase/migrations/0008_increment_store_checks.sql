-- Mağaza kontrol sayacı (atomik artış; yalnızca sunucu anahtarı çağırabilir).
create function increment_store_checks(p_domain text) returns void
language sql security definer set search_path = public as $$
  update stores set checks = checks + 1 where domain = p_domain;
$$;
revoke execute on function increment_store_checks(text) from public, anon, authenticated;
grant execute on function increment_store_checks(text) to service_role;
