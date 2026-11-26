-- Satal CRM — kontrol listesi (25.11.2026).
-- Amaç: danışmanın unutacağı şeyi, daha hatırlarken sormak ve yanıtını kayda bağlamak.
--   1) Getiren / tanıştıran yalnızca adla yazılmış, rehberdeki bir kişiye bağlanmamışsa bu açık bir sorudur.
--      Durumu boşsa danışman henüz yanıtlamamıştır (kontrol listesinde bekler).
--      'rehberde_yok' : bu kişi rehberde yok (ya da not bir kişiyi anlatmıyor); böyle kalsın, bir daha sorulmasın.
--      'bilinmiyor'   : danışman kim olduğunu hatırlamıyor. Kayıtta "kim olduğu bilinmiyor" diye görünür,
--                       ayrı listede durur; hatırlanınca bağlanır.
--   2) Kontrol notu: kayıtta teyit edilmesi gereken bir varsayım ya da eksik ("yerin şu ilçede olduğu varsayıldı").
--      Toplu aktarım, çalışma kitabındaki "Kontrol" sütununu buraya yazar. Danışman "kontrol ettim" deyince silinir.

alter table kisiler add column referans_durumu text check (referans_durumu in ('rehberde_yok', 'bilinmiyor'));
alter table mulkler add column kaynak_durumu text check (kaynak_durumu in ('rehberde_yok', 'bilinmiyor'));

alter table kisiler add column kontrol_notu text not null default '';
alter table mulkler add column kontrol_notu text not null default '';
alter table gorusmeler add column kontrol_notu text not null default '';

-- Kontrol listesi her açılışta sayıldığı için küçük, yalnızca bekleyen kayıtları tutan dizinler
create index kisiler_referans_acik on kisiler (sahip_id) where referans_kisi_id is null and referans_notu <> '';
create index mulkler_kaynak_acik on mulkler (sahip_id) where kaynak_kisi_id is null and kaynak_notu <> '';
create index kisiler_kontrol on kisiler (sahip_id) where kontrol_notu <> '';
create index mulkler_kontrol on mulkler (sahip_id) where kontrol_notu <> '';
create index gorusmeler_kontrol on gorusmeler (sahip_id) where kontrol_notu <> '';

-- ---------- Yardım metinleri ----------
-- "Kim tanıştırdı", "kimden geldi" ve "bugün" açıklamaları kontrol listesini de anlatacak şekilde yenilendi.
-- Yönetici metni elle değiştirmediyse eski başlangıç metni silinir; kurulum betiği (scripts/migrate.js) yenisini yazar.
delete from yardim_metinleri where anahtar in ('referans', 'kaynak', 'bugun') and guncelleyen is null;
