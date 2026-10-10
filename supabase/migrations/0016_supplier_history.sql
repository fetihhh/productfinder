-- Toptancı ilanlarının satış adedi geçmişi: AliExpress "N sold" sayısının artış hızı ürünün gerçek talebidir
-- (ürünü satan tüm dropshipping mağazaları aynı tedarikçiden alır).
create table supplier_history (
  product_id uuid not null references products (id) on delete cascade,
  url        text not null,
  day        date not null,
  sold       integer,
  price_min  numeric(12,2),
  primary key (product_id, url, day)
);
alter table supplier_history enable row level security;

-- En güvenilir ilanın (fotoğrafla eşleşen, yoksa en benzer) toplam satışı ve haftalık satış hızı.
alter table products
  add column supplier_sold          integer,
  add column supplier_sold_per_week numeric(10,1);
