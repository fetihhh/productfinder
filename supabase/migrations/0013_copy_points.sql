-- Kopya puanı mağaza toplam puanına eklenir: toplam = mağaza puanı + reklam puanı + kopya puanı (en fazla 100).
alter table stores add column copy_points numeric(4,1) not null default 0;

drop index if exists stores_status_total_idx;
alter table stores drop column total_score;
alter table stores
  add column total_score numeric(5,1) generated always as (least(100, store_score + ad_points + copy_points)) stored;
create index stores_status_total_idx on stores (status, total_score desc);
