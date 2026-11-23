-- Satal CRM — temel şema.
-- Gizlilik kuralı veritabanında da uygulanır (satır düzeyi güvenlik): uygulama her istekte
-- satal.uid (kullanıcı) ve satal.rol (danisman | yonetici | sahip | sistem) ayarlarını verir;
-- aşağıdaki kurallar bir danışmanın başka danışmanın kaydını okumasını veritabanı düzeyinde engeller.
-- Roller: danisman = yalnızca kendi verisi · yonetici = herkesin verisi (silinenler hariç) ·
--         sahip = her şey, silinenler ve dışa aktarma dahil · sistem = uygulamanın kendi iç işleri.

create extension if not exists citext;
create extension if not exists pg_trgm;

create or replace function s_uid() returns uuid language sql stable as
$$ select nullif(current_setting('satal.uid', true), '')::uuid $$;
create or replace function s_rol() returns text language sql stable as
$$ select coalesce(nullif(current_setting('satal.rol', true), ''), 'yok') $$;

-- ---------- Konum (herkese açık başvuru verisi) ----------
create table iller (id int primary key, ad text not null);
create table ilceler (id int primary key, il_id int not null references iller, ad text not null);
create table mahalleler (id int primary key, ilce_id int not null references ilceler, ad text not null, sinir_var boolean not null default false);
create index on ilceler (il_id);
create index on mahalleler (ilce_id);
create table ilce_komsu (a int not null references ilceler, b int not null references ilceler, kaynak text not null default 'osm', primary key (a, b), check (a < b));
create table mahalle_komsu (a int not null references mahalleler, b int not null references mahalleler, kaynak text not null default 'osm', primary key (a, b), check (a < b));

-- ---------- Kullanıcılar ve giriş ----------
create table kullanicilar (
  id uuid primary key default gen_random_uuid(),
  eposta citext not null unique,
  ad text not null default '',
  telefon text not null default '',
  foto_yol text,
  rol text not null default 'danisman' check (rol in ('danisman', 'yonetici', 'sahip')),
  durum text not null default 'eposta_bekliyor' check (durum in ('eposta_bekliyor', 'onay_bekliyor', 'aktif', 'kapali')),
  sifre_hash text,
  google_sub text unique,
  moduller jsonb not null default '{"crm": true}',
  imza text not null default '',
  mesaj_tonu text not null default 'samimi' check (mesaj_tonu in ('samimi', 'resmi', 'kisa')),
  gizlilik_onay_at timestamptz,
  onaylayan_id uuid references kullanicilar,
  onay_at timestamptz,
  kapatma_at timestamptz,
  olusturma_at timestamptz not null default now()
);

create table davetler (
  id uuid primary key default gen_random_uuid(),
  eposta citext not null,
  jeton_hash text not null unique,
  davet_eden uuid not null references kullanicilar,
  olusturma_at timestamptz not null default now(),
  bitis_at timestamptz not null,
  kullanildi_at timestamptz
);

create table eposta_jetonlari (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references kullanicilar on delete cascade,
  tur text not null check (tur in ('sifre_belirle', 'sifre_sifirla')),
  jeton_hash text not null unique,
  bitis_at timestamptz not null,
  kullanildi_at timestamptz,
  olusturma_at timestamptz not null default now()
);

create table oturumlar (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references kullanicilar on delete cascade,
  jeton_hash text not null unique,
  olusturma_at timestamptz not null default now(),
  bitis_at timestamptz not null,
  son_gorulme_at timestamptz not null default now(),
  cihaz text not null default '',
  ip text not null default ''
);
create index on oturumlar (kullanici_id);

-- ---------- Kişiler ----------
create table kisiler (
  id uuid primary key default gen_random_uuid(),
  sahip_id uuid not null references kullanicilar,
  ad text not null,
  hitap_adi text not null default '',
  hitap_turu text not null default 'bey_hanim_yok' check (hitap_turu in ('bey_hanim_yok', 'bey', 'hanim', 'abi', 'abla', 'ozel')),
  hitap_ozel text not null default '',
  sen_siz text not null default 'siz' check (sen_siz in ('sen', 'siz')),
  dil text not null default 'tr' check (dil in ('tr', 'en')),
  meslek text not null default '',
  sirket text not null default '',
  notlar text not null default '',
  alim_gucu_tutar numeric,
  alim_gucu_para text check (alim_gucu_para in ('TRY', 'USD')),
  alim_gucu_usd numeric,
  alim_gucu_kur numeric,
  alim_gucu_tarih date,
  potansiyel text check (potansiyel in ('A', 'B', 'C')),
  mesaj_istemiyor boolean not null default false,
  yatirimci_tipi text check (yatirimci_tipi in ('al_satci', 'yatirimci')),
  calisma_bolgeleri jsonb not null default '[]',
  calisma_kategorileri text[] not null default '{}',
  son_temas_at timestamptz,
  devralinan_sahip_id uuid references kullanicilar,
  olusturma_at timestamptz not null default now(),
  guncelleme_at timestamptz not null default now(),
  silindi_at timestamptz,
  silen_id uuid references kullanicilar
);
create index on kisiler (sahip_id) where silindi_at is null;
create index kisiler_ad_trgm on kisiler using gin (ad gin_trgm_ops);

create table kisi_telefonlari (
  id uuid primary key default gen_random_uuid(),
  kisi_id uuid not null references kisiler on delete cascade,
  sahip_id uuid not null references kullanicilar,
  numara text not null,
  ana boolean not null default false,
  aktif boolean not null default true
);
create unique index kisi_telefonlari_tekil on kisi_telefonlari (sahip_id, numara) where aktif;
create index on kisi_telefonlari (kisi_id);
create index on kisi_telefonlari (numara) where aktif;

-- ---------- Mülkler ----------
create table mulkler (
  id uuid primary key default gen_random_uuid(),
  sahip_id uuid not null references kullanicilar,
  malik_kisi_id uuid references kisiler,
  ofis_mulku boolean not null default false,
  islem text not null default 'satilik' check (islem in ('satilik', 'kiralik')),
  kategori text not null,
  alt_tur text not null,
  baslik text not null default '',
  il_id int references iller,
  ilce_id int references ilceler,
  mahalle_id int references mahalleler,
  konum_notu text not null default '',
  ada text not null default '',
  parsel text not null default '',
  fiyat_tutar numeric,
  fiyat_para text not null default 'TRY' check (fiyat_para in ('TRY', 'USD')),
  onceki_fiyat_tutar numeric,
  fiyat_degisim_at timestamptz,
  ozellikler jsonb not null default '{}',
  tahmini_deger_tutar numeric,
  tahmini_deger_para text check (tahmini_deger_para in ('TRY', 'USD')),
  tahmini_satis_ay numeric,
  tahmini_kira_tutar numeric,
  acil boolean not null default false,
  pazarlik_payi boolean not null default false,
  durum text not null default 'aktif' check (durum in ('aktif', 'opsiyonlu', 'satildi', 'pasif')),
  notlar text not null default '',
  olusturma_at timestamptz not null default now(),
  guncelleme_at timestamptz not null default now(),
  silindi_at timestamptz,
  silen_id uuid references kullanicilar,
  check (ofis_mulku or malik_kisi_id is not null)
);
create index on mulkler (sahip_id) where silindi_at is null;
create index on mulkler (malik_kisi_id);
create index on mulkler (ilce_id, ada, parsel) where silindi_at is null and ada <> '' and parsel <> '';

-- ---------- Talepler ----------
create table talepler (
  id uuid primary key default gen_random_uuid(),
  sahip_id uuid not null references kullanicilar,
  kisi_id uuid not null references kisiler,
  islem text not null default 'satilik' check (islem in ('satilik', 'kiralik')),
  alici_tipi text not null default 'oturum' check (alici_tipi in ('oturum', 'kira_yatirimcisi', 'uzun_vadeli', 'al_satci_bolgesel', 'al_satci_serbest', 'ticari')),
  elde_tutma text check (elde_tutma in ('kisa', 'orta', 'uzun')),
  kategoriler text[] not null,
  alt_turler text[] not null default '{}',
  bolgeler jsonb not null default '[]',
  sadece_bu_bolgeler boolean not null default false,
  butce_min_tutar numeric,
  butce_max_tutar numeric,
  butce_para text not null default 'TRY' check (butce_para in ('TRY', 'USD')),
  butce_min_usd numeric,
  butce_max_usd numeric,
  butce_kur numeric,
  butce_tarih date,
  kriterler jsonb not null default '{}',
  odeme text[] not null default '{}',
  en_az_kazanc numeric,
  durum text not null default 'aktif' check (durum in ('aktif', 'beklemede', 'kapandi')),
  son_teyit_at timestamptz not null default now(),
  notlar text not null default '',
  olusturma_at timestamptz not null default now(),
  guncelleme_at timestamptz not null default now(),
  silindi_at timestamptz,
  silen_id uuid references kullanicilar
);
create index on talepler (sahip_id) where silindi_at is null;
create index on talepler (kisi_id);

-- ---------- Eşleşmeler ----------
create table eslesmeler (
  talep_id uuid not null references talepler on delete cascade,
  mulk_id uuid not null references mulkler on delete cascade,
  talep_sahip_id uuid not null references kullanicilar,
  mulk_sahip_id uuid not null references kullanicilar,
  puan int,
  sinif text check (sinif in ('A', 'B', 'C')),
  ayrinti jsonb not null default '{}',
  durum text not null default 'yeni' check (durum in ('yeni', 'goruldu', 'gonderildi', 'reddedildi')),
  gecerli boolean not null default true,
  fiyat_dustu boolean not null default false,
  ekip_durum text check (ekip_durum in ('paylasildi', 'ilgisiz')),
  ekip_isaretleyen uuid references kullanicilar,
  ekip_at timestamptz,
  ilk_at timestamptz not null default now(),
  guncelleme_at timestamptz not null default now(),
  primary key (talep_id, mulk_id)
);
create index on eslesmeler (mulk_id);
create index on eslesmeler (talep_sahip_id, mulk_sahip_id) where gecerli;

-- ---------- Görüşmeler, hatırlatmalar, mesajlar, belgeler ----------
create table gorusmeler (
  id uuid primary key default gen_random_uuid(),
  kisi_id uuid not null references kisiler on delete cascade,
  sahip_id uuid not null references kullanicilar,
  tarih date not null default current_date,
  tur text not null default 'gorusme' check (tur in ('gorusme', 'arama', 'mesaj')),
  ilce_id int references ilceler,
  mahalle_id int references mahalleler,
  kategori text,
  alt_tur text,
  tutar_usd numeric,
  sonuc text check (sonuc in ('ilgilendi', 'teklif_verdi', 'aldi', 'olmadi')),
  mulk_id uuid references mulkler on delete set null,
  notu text not null default '',
  olusturma_at timestamptz not null default now()
);
create index on gorusmeler (kisi_id);
create index on gorusmeler (ilce_id);

create table hatirlatmalar (
  id uuid primary key default gen_random_uuid(),
  kisi_id uuid not null references kisiler on delete cascade,
  sahip_id uuid not null references kullanicilar,
  tarih date not null,
  notu text not null default '',
  tamamlandi_at timestamptz,
  olusturma_at timestamptz not null default now()
);
create index on hatirlatmalar (sahip_id, tarih) where tamamlandi_at is null;

create table mesajlar (
  id uuid primary key default gen_random_uuid(),
  sahip_id uuid not null references kullanicilar,
  kisi_id uuid not null references kisiler on delete cascade,
  mulk_id uuid references mulkler on delete set null,
  talep_id uuid references talepler on delete set null,
  yon text not null default 'aliciya' check (yon in ('aliciya', 'saticiya')),
  metin text not null,
  kaynak text not null default 'sablon' check (kaynak in ('sablon', 'claude')),
  sirali boolean not null default false,
  gonderildi_at timestamptz not null default now()
);
create index on mesajlar (sahip_id, gonderildi_at);
create index on mesajlar (kisi_id, mulk_id);

create table belgeler (
  id uuid primary key default gen_random_uuid(),
  sahip_id uuid not null references kullanicilar,
  kisi_id uuid references kisiler on delete cascade,
  mulk_id uuid references mulkler on delete cascade,
  tur text not null default 'diger' check (tur in ('tapu', 'imar', 'plan_notu', 'roleve', 'diger')),
  dosya_adi text not null,
  mime text not null,
  boyut int not null,
  depo_yolu text not null,
  olusturma_at timestamptz not null default now(),
  check (kisi_id is not null or mulk_id is not null)
);
create index on belgeler (kisi_id);
create index on belgeler (mulk_id);

create table yukleme_taslaklari (
  id uuid primary key default gen_random_uuid(),
  sahip_id uuid not null references kullanicilar on delete cascade,
  kayitlar jsonb not null,
  ozet jsonb not null default '{}',
  olusturma_at timestamptz not null default now()
);

-- ---------- Ortak tablolar ----------
create table kurlar (tarih date primary key, usd_try numeric not null check (usd_try > 0), kaynak text not null, alindi_at timestamptz not null default now());
create table ayarlar (anahtar text primary key, deger jsonb not null, guncelleme_at timestamptz not null default now(), guncelleyen uuid references kullanicilar);
create table yardim_metinleri (anahtar text primary key, baslik text not null, metin text not null, guncelleme_at timestamptz not null default now(), guncelleyen uuid references kullanicilar);
create table islem_kaydi (
  id bigint generated always as identity primary key,
  kullanici_id uuid references kullanicilar,
  eylem text not null,
  hedef_tur text,
  hedef_id text,
  ayrinti jsonb not null default '{}',
  ip text not null default '',
  at timestamptz not null default now()
);
create index on islem_kaydi (at desc);
create index on islem_kaydi (kullanici_id, at desc);
-- "Beni silin" taleplerinin kaydı: silinen kişinin bilgisi tutulmaz, yalnızca silme işleminin yapıldığı kanıtlanır.
create table kalici_silme_kaydi (
  id bigint generated always as identity primary key,
  yapan_id uuid not null references kullanicilar,
  neden text not null,
  ozet jsonb not null default '{}',
  at timestamptz not null default now()
);

-- ---------- Satır düzeyi güvenlik ----------
-- Rehber verisi: danışman yalnızca kendi kaydını; yönetici hepsini (silinenler hariç); sahip silinenleri de görür.
do $$
declare t text;
begin
  foreach t in array array['kisiler', 'mulkler', 'talepler'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy oku on %I for select using (
      s_rol() in ('sahip', 'sistem') or (silindi_at is null and (s_rol() = 'yonetici' or sahip_id = s_uid())))$p$, t);
    execute format($p$create policy ekle on %I for insert with check (s_rol() = 'sistem' or sahip_id = s_uid())$p$, t);
    execute format($p$create policy degistir on %I for update using (s_rol() = 'sistem' or (sahip_id = s_uid() and silindi_at is null))
      with check (s_rol() = 'sistem' or (sahip_id = s_uid() and silindi_at is null))$p$, t);
    execute format($p$create policy sil on %I for delete using (s_rol() = 'sistem')$p$, t);
  end loop;
end $$;

-- Kişiye bağlı kayıtlar: kişi görünüyorsa görünür (alt sorgu da aynı güvenlik kuralından geçer).
do $$
declare t text;
begin
  foreach t in array array['kisi_telefonlari', 'gorusmeler', 'hatirlatmalar', 'mesajlar'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy oku on %I for select using (s_rol() = 'sistem' or exists (select 1 from kisiler k where k.id = kisi_id))$p$, t);
    execute format($p$create policy ekle on %I for insert with check (s_rol() = 'sistem' or (sahip_id = s_uid() and exists (select 1 from kisiler k where k.id = kisi_id and k.sahip_id = s_uid())))$p$, t);
    execute format($p$create policy degistir on %I for update using (s_rol() = 'sistem' or sahip_id = s_uid()) with check (s_rol() = 'sistem' or sahip_id = s_uid())$p$, t);
    execute format($p$create policy sil on %I for delete using (s_rol() = 'sistem' or sahip_id = s_uid())$p$, t);
  end loop;
end $$;

alter table belgeler enable row level security;
create policy oku on belgeler for select using (s_rol() = 'sistem'
  or (kisi_id is not null and exists (select 1 from kisiler k where k.id = kisi_id))
  or (mulk_id is not null and exists (select 1 from mulkler m where m.id = mulk_id)));
create policy ekle on belgeler for insert with check (s_rol() = 'sistem' or (sahip_id = s_uid()
  and (kisi_id is null or exists (select 1 from kisiler k where k.id = kisi_id and k.sahip_id = s_uid()))
  and (mulk_id is null or exists (select 1 from mulkler m where m.id = mulk_id and m.sahip_id = s_uid()))));
create policy sil on belgeler for delete using (s_rol() = 'sistem' or sahip_id = s_uid());

-- Eşleşmeler: danışman yalnızca iki ucu da kendisine ait olanı görür. Farklı danışmanlar arasındaki
-- eşleşmeler (ekip eşleşmeleri) yalnızca yönetici ve sahip içindir; danışmana sayısı bile verilmez.
alter table eslesmeler enable row level security;
create policy oku on eslesmeler for select using (
  s_rol() in ('sahip', 'yonetici', 'sistem') or (talep_sahip_id = s_uid() and mulk_sahip_id = s_uid()));
create policy yaz on eslesmeler for all using (s_rol() = 'sistem') with check (s_rol() = 'sistem');

alter table yukleme_taslaklari enable row level security;
create policy kendi on yukleme_taslaklari for all using (s_rol() = 'sistem' or sahip_id = s_uid()) with check (s_rol() = 'sistem' or sahip_id = s_uid());

-- Kullanıcılar: danışman yalnızca kendi satırını görür; değişiklikler uygulamanın denetimli iç işlemleriyle yapılır.
alter table kullanicilar enable row level security;
create policy oku on kullanicilar for select using (s_rol() in ('sahip', 'yonetici', 'sistem') or id = s_uid());
create policy yaz on kullanicilar for all using (s_rol() = 'sistem') with check (s_rol() = 'sistem');

do $$
declare t text;
begin
  foreach t in array array['davetler', 'eposta_jetonlari', 'oturumlar', 'kalici_silme_kaydi'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy sistem on %I for all using (s_rol() = 'sistem') with check (s_rol() = 'sistem')$p$, t);
  end loop;
  foreach t in array array['kurlar', 'ayarlar', 'yardim_metinleri', 'ilce_komsu', 'mahalle_komsu'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy oku on %I for select using (true)$p$, t);
    execute format($p$create policy yaz on %I for all using (s_rol() = 'sistem') with check (s_rol() = 'sistem')$p$, t);
  end loop;
end $$;

alter table islem_kaydi enable row level security;
create policy oku on islem_kaydi for select using (s_rol() in ('sahip', 'yonetici', 'sistem'));
create policy ekle on islem_kaydi for insert with check (true);
create policy sil on islem_kaydi for delete using (s_rol() = 'sistem');

-- Bir mülkün maliki ve bir talebin kişisi, kaydı giren danışmanın kendi rehberinden olmalıdır.
create policy malik_ayni_sahip_ekle on mulkler as restrictive for insert with check (
  s_rol() = 'sistem' or malik_kisi_id is null or exists (select 1 from kisiler k where k.id = malik_kisi_id and k.sahip_id = mulkler.sahip_id and k.silindi_at is null));
create policy malik_ayni_sahip_degistir on mulkler as restrictive for update using (true) with check (
  s_rol() = 'sistem' or malik_kisi_id is null or exists (select 1 from kisiler k where k.id = malik_kisi_id and k.sahip_id = mulkler.sahip_id and k.silindi_at is null));
create policy kisi_ayni_sahip_ekle on talepler as restrictive for insert with check (
  s_rol() = 'sistem' or exists (select 1 from kisiler k where k.id = kisi_id and k.sahip_id = talepler.sahip_id and k.silindi_at is null));
create policy kisi_ayni_sahip_degistir on talepler as restrictive for update using (true) with check (
  s_rol() = 'sistem' or exists (select 1 from kisiler k where k.id = kisi_id and k.sahip_id = talepler.sahip_id and k.silindi_at is null));
