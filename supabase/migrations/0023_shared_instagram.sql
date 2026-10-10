-- Birden çok bağımsız mağazanın ana sayfasında geçen Instagram hesabı çoğu zaman temanın varsayılan bağlantısıdır
-- (ör. @shopify): mağazanın kendi hesabı sayılmaz. Aynı satıcının ağı (copy_same_seller) tek mağaza sayılır.
create or replace function shared_instagram_handles()
returns table (instagram text)
language sql stable
as $$
  select instagram
  from stores
  where instagram is not null and instagram <> ''
  group by instagram
  having count(distinct coalesce(case when copy_same_seller then copy_group end, domain)) >= 2
$$;

-- Var olan tema bağlantıları temizlenir.
delete from ig_accounts where username in (select instagram from shared_instagram_handles())
  or username in ('shopify', 'shopifypartners', 'themefullstack', 'outofthesandbox', 'pixelunion', 'archetypethemes');
update stores set instagram = ''
  where instagram in ('shopify', 'shopifypartners', 'themefullstack', 'outofthesandbox', 'pixelunion', 'archetypethemes');
