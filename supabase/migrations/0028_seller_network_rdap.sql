-- Alan adı kaydı (RDAP, resmi ve ücretsiz): kayıt firması ve sorgu zamanı (kayıt tarihi registered_on'a yazılır).
alter table stores
  add column registrar text,
  add column rdap_at   timestamptz;

-- Aynı satıcının diğer mağazaları: ana sayfadaki Meta/TikTok piksel kimliği, Google Ads/GTM kimliği, e-posta ya da
-- WhatsApp numarası aynı olan mağazalar.
create or replace function seller_network(p_domain text)
returns table (domain text, shop_name text, hero_title text, hero_image text, status text, total_score numeric, first_product_at timestamptz, reasons text[])
language sql stable
as $$
  with me as (select tech from stores where stores.domain = p_domain),
  keys as (
    select 'meta' as k, jsonb_array_elements_text(coalesce((select tech->'ids'->'meta' from me), '[]'::jsonb)) as v
    union all
    select 'tiktok', jsonb_array_elements_text(coalesce((select tech->'ids'->'tiktok' from me), '[]'::jsonb))
    union all
    select 'google', jsonb_array_elements_text(coalesce((select tech->'ids'->'google' from me), '[]'::jsonb))
    union all
    select 'email', (select tech->>'email' from me) where (select tech->>'email' from me) is not null
    union all
    select 'whatsapp', (select tech->>'whatsapp' from me) where (select tech->>'whatsapp' from me) is not null
  )
  select s.domain, s.shop_name, s.hero_title, s.hero_image, s.status, s.total_score, s.first_product_at,
    array_agg(distinct case keys.k
      when 'meta' then 'Aynı Meta pikseli'
      when 'tiktok' then 'Aynı TikTok pikseli'
      when 'google' then 'Aynı Google Ads / GTM'
      when 'email' then 'Aynı e-posta'
      else 'Aynı WhatsApp' end)
  from stores s
  join keys on (
    (keys.k in ('meta', 'tiktok', 'google') and s.tech->'ids'->keys.k ? keys.v)
    or (keys.k = 'email' and s.tech->>'email' = keys.v)
    or (keys.k = 'whatsapp' and s.tech->>'whatsapp' = keys.v)
  )
  where s.domain <> p_domain
  group by s.domain, s.shop_name, s.hero_title, s.hero_image, s.status, s.total_score, s.first_product_at
  order by s.total_score desc nulls last
  limit 30
$$;
