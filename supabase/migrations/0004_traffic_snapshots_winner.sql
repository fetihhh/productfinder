-- Grafikler ve "winner" skoru: günlük site trafiği sıralaması, günlük ürün satış işaretleri, birleşik skor.

-- Tranco top-1M listesindeki günlük sıra (listede yoksa rank null → "ilk 1 milyonun dışında").
create table traffic_ranks (
  domain text    not null references brands (domain) on delete cascade,
  day    date    not null,
  rank   integer,
  primary key (domain, day)
);

-- Ürünün günlük satış işaretleri (yorum sayısı artışı → tahmini satış hızı).
create table product_snapshots (
  product_id    uuid not null references products (id) on delete cascade,
  day           date not null,
  price         numeric(12,2),
  currency      text,
  review_count  integer,
  rating        numeric(3,2),
  availability  text,
  primary key (product_id, day)
);

alter table brands
  add column tranco_rank integer,  -- son listedeki sıra (null: listede değil / hiç bakılmadı)
  add column tranco_day  date;     -- son bakılan listenin tarihi

alter table products
  add column winner_score     numeric(5,1) not null default 0,
  add column winner_breakdown jsonb;

create index products_status_winner_idx on products (dtc_status, winner_score desc);

alter table traffic_ranks     enable row level security;
alter table product_snapshots enable row level security;

-- Mevcut doğrulanmış ürünlerin bugünkü değerleri ilk ölçüm olur.
insert into product_snapshots (product_id, day, price, currency, review_count, rating, availability)
select id, current_date, price, currency, review_count, rating, availability
from products
where dtc_status = 'verified' and (review_count is not null or price is not null);
