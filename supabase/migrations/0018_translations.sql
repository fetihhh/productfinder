-- Ürün adı çevirileri (MyMemory, ücretsiz): İngilizce olmayan mağaza ürünleri toptancıda İngilizce aranır. Aynı ad bir kez çevrilir.
create table translations (
  source_lang text not null,
  text        text not null,
  translated  text not null,
  created_at  timestamptz not null default now(),
  primary key (source_lang, text)
);
alter table translations enable row level security;
