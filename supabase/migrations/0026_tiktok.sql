-- Mağazanın TikTok hesabı (ana sayfadaki tiktok.com/@kullanıcı bağlantısı; "" = yok). Ürün sayfasında TikTok'un resmi
-- profil gömmesiyle (kullanıcının tarayıcısında) son videoları oynatılır.
alter table stores add column tiktok text;
