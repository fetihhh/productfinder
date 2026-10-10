-- Toptancı ilanının puanı (AliExpress yıldız ortalaması): tedarikçi seçiminde güvenilirlik işareti.
alter table suppliers add column rating numeric(2,1);
