-- Satış ölçümü okunamayan ürünler (ürün kaldırıldı 404, alan adı kapandı, robots.txt izin vermiyor): her çalıştırmada
-- sıranın başına dönüp kapasite harcamasın diye son başarısız deneme ve art arda başarısızlık sayısı tutulur.
alter table products
  add column if not exists measure_failed_at timestamptz,
  add column if not exists measure_fails int not null default 0,
  add column if not exists measure_error text;
