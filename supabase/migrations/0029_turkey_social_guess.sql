-- Türkiye'de satılıyor mu: ürünün Türk pazaryerlerindeki benzer ilanları (Tavily araması; başlık, site, fiyat, bağlantı).
alter table products
  add column tr_listings   jsonb,
  add column tr_checked_at timestamptz;
create index products_tr_checked_idx on products (tr_checked_at);

-- Ana sayfasında bağlantı olmayan mağazalar için Instagram/TikTok hesabı tahmini (resmi API'lerle doğrulanır) yapıldı mı.
alter table stores add column social_guess_at timestamptz;
