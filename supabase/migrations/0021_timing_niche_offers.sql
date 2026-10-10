-- Zamanlama (erken / zirvede / doymuş / sönüyor), niş ve teklif analizi.
alter table stores
  add column niche         text,
  add column offer         jsonb,          -- öne çıkan ürünün teklifi: indirim %, ücretsiz kargo, garanti (gün), paket
  add column timing        text,           -- early | peak | saturated | fading | unproven
  add column timing_reason text;
create index stores_niche_idx on stores (niche) where status = 'live';

alter table products
  add column timing        text,
  add column timing_reason text;

alter table ad_signals add column ad_offers jsonb not null default '{}';