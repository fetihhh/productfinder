-- Ürünün Instagram'da en çok tutan gönderileri (Reels/videolar): ürün adından türetilen etiketlerin (#galaxyprojector)
-- resmi Hashtag Search API'sindeki en popüler gönderileri. Kullanılan etiketler, gönderiler ve son arama zamanı.
alter table products
  add column ig_tags            text[],
  add column ig_tag_posts       jsonb,
  add column ig_tag_checked_at  timestamptz;
