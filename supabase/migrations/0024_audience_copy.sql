-- Kazanan reklamların gerçek kitlesi (yaş × cinsiyet erişim dökümünden) ve en çok tutan reklam metinlerinin Türkçesi.
alter table ad_signals
  add column audience jsonb,
  add column copy_tr  jsonb not null default '[]';
