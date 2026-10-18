-- Türkiye reklamverenlerinin türü (dtc/googleAds.ts advertiserKind): kucuk (ürün satan küçük/orta e-ticaret), buyuk, ajans, diger.
alter table google_advertisers add column if not exists kind text;
create index if not exists google_advertisers_kind_new on google_advertisers (kind, new_30d desc);
