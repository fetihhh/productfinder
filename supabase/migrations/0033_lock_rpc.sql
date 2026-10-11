-- Depo herkese açık: RPC fonksiyonları yalnızca gizli anahtarla (service_role) çağrılabilir; arama yolu sabitlenir.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('shared_instagram_handles', 'seller_network') loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
