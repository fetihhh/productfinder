-- Kopyalanan ürünler: aynı ürünü (aynı fotoğrafla) satan yeni mağazalar. Bir ürünü birden çok dropshipper aynı anda
-- satıyorsa ürün büyük ihtimalle satıyordur (ve rekabet artıyordur).

alter table stores
  add column ali_image_count integer,                  -- görsel dosya adı AliExpress görsel kimliği olan ürün sayısı
  add column hero_ali_id     text,                     -- öne çıkan ürünün AliExpress görsel kimliği
  add column hero_hash       text,                     -- öne çıkan ürün görselinin dHash'i (256 bit, onaltılık)
  add column hero_hash_image text,                     -- özeti çıkarılan görsel (öne çıkan ürün değişince yeniden özetlenir)
  add column copy_count      integer not null default 0, -- aynı ürünü satan diğer açık mağaza sayısı
  add column copy_group      text;                     -- küme anahtarı: kümedeki ilk açılan mağazanın alan adı

create index stores_hero_ali_idx on stores (hero_ali_id) where hero_ali_id is not null;
create index stores_copy_group_idx on stores (copy_group) where copy_group is not null;

-- Ürünün (mağazasının) kaç başka mağazada satıldığı.
alter table products add column copy_count integer not null default 0;
