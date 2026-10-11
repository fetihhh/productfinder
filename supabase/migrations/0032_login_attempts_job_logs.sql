-- Giriş denemeleri (kaba kuvvet koruması): IP'nin HMAC özeti (açık IP saklanmaz) ve zaman. Aynı IP'den 15 dakikada 5,
-- tüm IP'lerden saatte 50 hatalı deneme sonrası giriş kilitlenir.
create table login_attempts (
  key text not null,
  at  timestamptz not null default now()
);
create index login_attempts_key_at_idx on login_attempts (key, at);
create index login_attempts_at_idx on login_attempts (at);
alter table login_attempts enable row level security;

-- Günlük işin ayrıntılı kaydı (depo herkese açık olduğu için GitHub kayıtlarında yalnızca sayılar görünür; ayrıntı burada).
create table job_logs (
  id         bigint generated always as identity primary key,
  run_id     text,
  mode       text,
  ok         boolean,
  created_at timestamptz not null default now(),
  log        text not null
);
create index job_logs_created_idx on job_logs (created_at desc);
alter table job_logs enable row level security;
