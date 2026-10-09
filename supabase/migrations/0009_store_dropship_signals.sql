-- Mağaza ürün açıklamalarındaki dropshipping işaretleri (uzun teslimat aralığı, ücretsiz dünya geneli kargo…)
-- ve baskılı giyim (tişört, şapka, kapüşonlu…) ürün sayısı.
alter table stores
  add column dropship_count integer,
  add column apparel_count  integer;
