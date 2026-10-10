-- Toptancı ilanlarının görselle eşleştirilmesi: ürün fotoğrafıyla dHash farkı (0 = aynı fotoğraf, ≤ 10 = eşleşme).
alter table suppliers add column image_distance smallint;

-- Ürünün en az bir toptancı ilanı fotoğrafla eşleştiyse true (toptan fiyat ve marj yalnızca bu ilanlardan hesaplanır).
alter table products add column supplier_image_match boolean not null default false;
