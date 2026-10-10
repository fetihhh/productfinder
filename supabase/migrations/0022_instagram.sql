-- Instagram: mağazanın Instagram hesabı (ana sayfadaki bağlantı) ve resmi Business Discovery API'siyle alınan
-- herkese açık gönderiler (beğeni, yorum, görsel/video adresi). "outlier" = gönderinin etkileşimi / hesabın ortancası.
alter table stores add column instagram text;

create table ig_accounts (
  username          text primary key,
  domain            text,
  ig_id             text,
  name              text,
  followers         integer,
  media_count       integer,
  profile_pic       text,
  median_engagement numeric(12,1),
  error             text,
  checked_at        timestamptz,
  next_check_at     timestamptz not null default now()
);

create table ig_posts (
  id           text primary key,
  username     text not null references ig_accounts (username) on delete cascade,
  domain       text,
  caption      text,
  likes        integer,
  comments     integer,
  engagement   integer not null default 0,
  outlier      numeric(8,1) not null default 0,
  media_type   text,
  product_type text,
  media_url    text,
  thumb_url    text,
  permalink    text,
  posted_at    timestamptz,
  fetched_at   timestamptz not null default now()
);
create index ig_posts_outlier_idx on ig_posts (outlier desc);
create index ig_posts_domain_idx on ig_posts (domain);

alter table ig_accounts enable row level security;
alter table ig_posts enable row level security;
