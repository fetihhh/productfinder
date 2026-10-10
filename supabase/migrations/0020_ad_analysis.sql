-- Reklam analizi: kanıt skoru (süreklilik, ölçeklenme, kopya reklam, erişim, ülke genişlemesi), aşama, tekrar eden
-- reklam metinleri, ülkeler, kaba harcama aralığı ve reklamı verilen ürünler.
alter table ad_signals
  add column ad_score     numeric(4,1) not null default 0,
  add column ad_stage     text not null default 'none',   -- proven | scaling | testing | stopped | none
  add column ad_parts     jsonb,
  add column creatives    jsonb not null default '[]',
  add column countries    text[] not null default '{}',
  add column active_7d    integer not null default 0,
  add column active_14d   integer not null default 0,
  add column spend_low    integer,
  add column spend_high   integer,
  add column top_products jsonb not null default '[]';

alter table ad_history add column ad_score numeric(4,1);

create index ad_signals_score_idx on ad_signals (ad_score desc);
