-- Satal CRM — adsız hitap (26.11.2026).
-- Rehberde bazı kayıtlar bir kişi adıyla değil, firma adı ya da tarifle durur ("Mavi Asansör", "kiralık evi soran").
-- Böyle bir kayıtta mesajın ilk sözcükle ("Merhaba Mavi,") başlaması yanlıştır; hitap "adsiz" seçilince mesaj
-- yalnızca "Merhaba," diye başlar. Toplu aktarımda "Seslenilecek ad" sütununa "(yok)" yazılan kişiler böyle girer.

alter table kisiler drop constraint kisiler_hitap_turu_check;
alter table kisiler add constraint kisiler_hitap_turu_check
  check (hitap_turu in ('bey_hanim_yok', 'bey', 'hanim', 'abi', 'abla', 'ozel', 'adsiz'));

-- Yardım metni yeni seçeneği de anlatır. Yönetici metni elle değiştirmediyse eski başlangıç metni silinir;
-- kurulum betiği (scripts/migrate.js) yenisini yazar.
delete from yardim_metinleri where anahtar = 'hitap' and guncelleyen is null;
