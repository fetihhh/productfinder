-- İşlenmiş kaynak yazıları (aday çıksın çıkmasın). Toplama işi bunları tekrar açmaz.
create table seen_items (
  source          text not null,
  source_item_id  text not null,
  outcome         text not null,            -- candidate | no_brand_link
  seen_at         timestamptz not null default now(),
  primary key (source, source_item_id)
);

alter table seen_items enable row level security;

-- Mevcut bahsedilmeleri geriye dönük ekle.
insert into seen_items (source, source_item_id, outcome, seen_at)
select source, source_item_id, 'candidate', fetched_at from mentions
on conflict do nothing;
