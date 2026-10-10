-- Aynı satıcının mağaza ağı işareti: kümedeki tüm mağazalar ürünü birebir aynı başlık ve fiyatla satıyor.
alter table stores add column copy_same_seller boolean not null default false;
