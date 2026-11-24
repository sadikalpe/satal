-- Satal CRM — hafıza alanları (25.11.2026).
-- Danışmanın notlarında tuttuğu ama ilk şemada karşılığı olmayan bilgiler:
--   1) Kim tanıştırdı, kimden geldi: kişinin referansı ve mülkü getiren kişi.
--   2) Üçüncü kişi tipi: "olursa alır" (fırsat çıkarsa alan; yatırımcı ya da al-satçı değil).
--   3) Eski notlardan gelen geçmiş ilgiler: tarihi bilinmeyen ya da yalnızca yılı bilinen görüşme; satılık / kiralık ayrımı.

-- ---------- Kim tanıştırdı ----------
alter table kisiler add column referans_kisi_id uuid references kisiler on delete set null;
alter table kisiler add column referans_notu text not null default '';
create index kisiler_referans on kisiler (referans_kisi_id) where referans_kisi_id is not null;

-- ---------- Mülk kimden geldi ----------
alter table mulkler add column kaynak_kisi_id uuid references kisiler on delete set null;
alter table mulkler add column kaynak_notu text not null default '';
create index mulkler_kaynak on mulkler (kaynak_kisi_id) where kaynak_kisi_id is not null;

-- Bu iki bağlantı için ayrıca veritabanı kuralı yazılmadı, bilerek:
-- * Bağlanan kişi her gösterimde okuma kuralından (kisiler.oku) geçer; başka danışmanın ya da silinmiş bir kişinin
--   adı danışmana hiçbir koşulda dönmez. Uygulama da kayıt sırasında kişinin danışmanın kendi rehberinde olduğuna bakar.
-- * "Aynı sahip" denetimi kural olarak yazılsaydı, getiren kişi silindikten sonra mülkün durumu bile değiştirilemezdi
--   (güncelleme denetimi satırın tamamına bakar). Kişi silinince bağlantı danışmanın ekranından kendiliğinden kalkar,
--   kayıt sistem sahibinde durur.

-- ---------- Kişi tipi: olursa alır ----------
alter table kisiler drop constraint kisiler_yatirimci_tipi_check;
alter table kisiler add constraint kisiler_yatirimci_tipi_check check (yatirimci_tipi in ('al_satci', 'yatirimci', 'olursa_alir'));

-- ---------- Geçmiş ilgiler ----------
-- tarih boş: ne zaman olduğu bilinmiyor. tarih_yaklasik: yalnızca yılı biliniyor (tarih o yılın 1 Ocak'ı olarak tutulur).
alter table gorusmeler alter column tarih drop not null;
alter table gorusmeler add column tarih_yaklasik boolean not null default false;
alter table gorusmeler add column islem text check (islem in ('satilik', 'kiralik'));
create index gorusmeler_ilce_kategori on gorusmeler (ilce_id, kategori) where ilce_id is not null;

-- ---------- Yardım metni ----------
-- "Al-satçı / yatırımcı" açıklaması üçüncü tipi de anlatacak şekilde yenilendi. Yönetici metni elle değiştirmediyse
-- eski başlangıç metni silinir; kurulum betiği (scripts/migrate.js) yenisini yazar.
delete from yardim_metinleri where anahtar = 'yatirimci' and guncelleyen is null;
