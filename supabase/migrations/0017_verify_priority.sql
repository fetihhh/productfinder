-- Doğrulama önceliği: günlük arama kotası en umut verici adaylara harcansın.
-- Bloglar 50, yeni mağazanın öne çıkan ürünü = mağaza toplam puanı, stoğu tekrar tekrar azalan ürün = 70 + 5 × stok azalması.
alter table products add column verify_priority numeric(5,1) not null default 50;
