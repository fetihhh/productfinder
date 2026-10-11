-- Mağazanın altyapısı: shopify (varsayılan) ya da Türk altyapıları ikas, ticimax. Yeni alan adı keşfi DNS'ten tespit eder
-- (ikas: www → *.myikas.com, Ticimax: www → *.ticimax.cloud); kontrol altyapıya göre yapılır.
alter table stores add column platform text not null default 'shopify';
create index stores_platform_idx on stores (platform) where platform <> 'shopify';
