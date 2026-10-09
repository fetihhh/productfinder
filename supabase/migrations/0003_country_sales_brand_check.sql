-- Ülke, Türkiye'ye satış, marka düzeyinde pazaryeri kontrolü ve satışa dair işaretler.

alter table brands
  add column country                 text,         -- mağaza ülkesi, ISO 3166-1 alpha-2 (US, DE, CH…)
  add column ships_to_tr             boolean,      -- mağaza Türkiye'ye satış seçeneği sunuyor mu (bilinmiyorsa null)
  add column marketplace_status      text,         -- clean | found (marka düzeyi pazaryeri/perakendeci kontrolü)
  add column marketplace_evidence    text,
  add column marketplace_checked_at  timestamptz;

alter table products
  add column price          numeric(12,2),
  add column currency       text,
  add column review_count   integer,
  add column rating         numeric(3,2),
  add column availability   text,                  -- InStock | OutOfStock | PreOrder | …
  add column launched_at    timestamptz,           -- Shopify yayın tarihi
  add column variant_count  integer;
