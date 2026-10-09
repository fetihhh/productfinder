-- "Yükselenler": yorum artış hızı, trafik sırası iyileşmesi ve bu haftaki blog gündeminden yükseliş skoru.
alter table products add column momentum_score numeric(5,1) not null default 0;
create index products_status_momentum_idx on products (dtc_status, momentum_score desc);
