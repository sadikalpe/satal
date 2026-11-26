# Kaldığımız yer (26.11.2026)

**Şu an:** Sadık'ın güncel rehberi (Google "Kişiler" dökümü) aktarım kitabına işlendi; adlara yazdığı bilgiler de
ayrıştırıldı. Kitap yerel deneme veritabanına sorunsuz yüklendi. PR 7 hâlâ açık, Sadık'ın onayını bekliyor (dal
`claude/project-thread-zypzh0`); içinde kontrol listesinin yanında 26.11.2026 eklemeleri de var (adsız hitap,
aktarımda seslenilecek ad, bir talepte birden çok mahalle). Hafıza eklemeleri ve aktarım PR 6 ile ana kopyada.
Sıradaki adımlar: (1) PR 7 onaylanınca ana kopyaya alınır, (2) Sadık'tan 26.11.2026'da sorulan üç "bu kim?" sorusunun
ve daha önce sorulanların yanıtı bekleniyor; geldikçe kitaba işlenir, kalanlar üçer üçer sorulur, (3) Sadık'ın sohbete
yazdığı her yeni talep ve not kitaba işlenir (aşağıda "Günlük notlar"), (4) Halis Bey'den sunucu bilgisi gelince
kurulum yapılır ve kitap yüklenir (`crm/KURULUM.md`).

## Yeni Satal yazıldı (23–24.11.2026) — `crm/` klasörü
Sadık "yaz, dene, denet" dedi; ilk sürüm tam kapsamlı yazıldı, yerelde çalıştırılıp denendi. **Sunucuya kurulmadı**
(Halis Bey'in sunucu bilgisi bekleniyor; sunucuya ve alan adına dokunulmadı).
- Var olanlar: giriş (davet, e-posta + şifre, Google, yönetici onayı, 1 ay oturum), kişiler ve rehber yükleme
  (vcf/csv), mülkler, talepler, iki yönlü eşleştirme ve puan, "bugün kimi aramalıyım", "kim alır", WhatsApp mesajı
  (şablon + isteğe bağlı Claude), günlük mesaj sınırı, belgeler, yönetim (ekip, bölümler, ekip eşleşmeleri, çift
  kayıt, kur, komşuluk, ayarlar, işlem kaydı, silinenler, dışa aktarma, devir), telefona "ana ekrana ekle".
- Denetim: `npm test` → 61 test (gizlilik hem ekranlarda hem veritabanı düzeyinde sınanıyor). Tarayıcıda telefon ve
  bilgisayar görünümüyle gezildi.
- Kurulumda gerekecekler (Sadık'tan / Halis Bey'den): sunucu SSH erişimi, DNS `crm` kaydı, Google OAuth istemcisi,
  SMTP bilgileri, isteğe bağlı Anthropic API anahtarı. Adımlar: `crm/KURULUM.md`.
- Bilinen eksikler / varsayımlar: mahalle komşuluğu her ilçede yok (Yönetim → Komşuluk'tan elle eklenir);
  TL bütçe kuralı kiralıkta da uygulanıyor; yönetici başkasının kaydını görür ama değiştiremez; TKGM ve Kent
  Rehberi yalnızca bağlantı olarak var (veri çekilmiyor); ada/parsel teknik analizi ve ekspertiz sonraki modüller.
- Depo herkese açık: koda şifre, anahtar, gerçek kişi verisi yazılmadı. Kapalı depoya geçiş hâlâ öneri.

## Satal'a hafıza eklemeleri (25.11.2026) — PR 6, dal `claude/project-thread-zypzh0`
Sadık'ın isteği: "Bizim işimiz database'i eşleştirmek. Referansları hatırlamak." Ofiste 20'den fazla danışman var,
yüzlerce yer geliyor; kendisi sıfırdan ayrı bir uygulama istemiyor. **Karar: ayrı uygulama yok.** Kayıtların yeri
Satal; Satal canlıya çıkana kadar her şey aktarım kitabında (Excel) tutulur, yeni notlar oraya işlenir.
Satal'a eklenenler (şema: `crm/migrations/002_hafiza.sql`):
- **Kim tanıştırdı:** kişide tanıştıran kişi (rehberden seçilir) + not. Tanıştıranın kartında tanıştırdığı herkes ve
  getirdiği bütün yerler bir arada görünür ("Ondan gelenler").
- **Kimden geldi:** mülkte yeri getiren kişi + not. Sahibi belli olmayan yer "ofis mülkü" olarak girer.
- **Üçüncü kişi tipi "olursa alır"** (aramıyor, iyi yer çıkarsa alır). Al-satçı ve yatırımcı gibi, çalıştığı bölge ve
  türe uyan yer gelince "Talebi yok ama alabilir" listesine girer.
- **Her şeyde arama** (üstteki kutu, `/ara`): kişi, mülk, talep, görüşme notu ve hatırlatmalarda aynı anda arar
  (ad, yer, ada / parsel, telefon, notta geçen söz). Danışman yalnızca kendi kayıtlarında arar; yönetici "Bütün ekip"
  seçebilir; mülk notunu yalnızca sahibi arar.
- **Geçmiş ilgiler:** görüşmenin tarihi boş (bilinmiyor) ya da yalnızca yıl olabilir; satılık / kiralık ayrımı var.
  "Talebi yok ama alabilir"de geçmiş ilgi yalnızca aynı tür ve aynı işlem için sayılır (kiralık daire soran, satılık
  depo için aday gösterilmez).
- Gizlilik: iki bağlantı için ayrıca veritabanı kuralı yazılmadı (nedeni 002_hafiza.sql'de). Uygulama, bağlanan kişinin
  danışmanın kendi rehberinde olduğuna bakar; gösterimde okuma kuralı korur (başka danışmanın ya da silinmiş kişinin
  adı hiçbir ekrana gelmez). Bunların sınamaları `test/butun.test.js`'te.
- Bilinenler: kalıcı silmede (KVKK) kişinin adı başka kayıtların serbest notlarında geçiyorsa oradan kendiliğinden
  silinmez; sistem sahibi arama kutusuyla bulup notu düzeltir. Arama düz metin taraması yapar; kayıt çok büyürse
  dizin (pg_trgm) eklenir.

## Kontrol listesi (25.11.2026) — PR 7, dal `claude/project-thread-zypzh0`
Sadık'ın isteği (bir yeri getirenin kim olduğunu hatırlayamayınca): "Unutuyorum gidiyor. Bunları bana unutturmaman
lazım. Bunları check edebilmem lazım." Sorunun kökü: nota yalnızca ad yazılıyor, kişi rehberden seçilmiyor; yıllar sonra
o adın kim olduğu bilinmiyor. Çözüm: adı yazdığı gün sormak ve açık kalan her soruyu tek ekranda toplamak.
Satal'a eklenenler (şema: `crm/migrations/003_kontrol.sql`, ekran: `/kontrol`):
- **Bu kim?** Getireni ya da tanıştıranı yalnızca adla yazılmış, rehberdeki bir kişiye bağlanmamış her kayıt açık
  sorudur. Kayıt kaydedilir kaydedilmez kartında sorulur; yanıtlanana kadar kontrol listesinde ve "Bugün" ekranındaki
  sayaçta durur. Aynı ada ait kayıtlar tek öbekte toplanır ("Feride Hanım", "Feride Hanım üzerinden", "Feride'nin
  arkadaşı"), rehberden adı benzeyenler telefonuyla önerilir, tek dokunuşla hepsi bağlanır. Öbekleme ve öneri kuralı:
  `crm/src/alan/kontrol.js`.
- Üç yanıt: rehberdeki kişiye bağla · "Rehberimde yok" (adıyla kalır, bir daha sorulmaz) · "Hatırlamıyorum" (kayıtta
  "kim olduğu bilinmiyor" diye görünür, listenin altında "hatırlanmayanlar"da bekler; hatırlanınca oradan bağlanır).
- **Teyit bekleyen:** kayıttaki bir varsayım ya da eksik (kontrol notu). Aktarım kitabındaki "Kontrol" sütunu buraya
  gelir. "Kontrol ettim" notu kaldırır; geçmiş görüşmede "Yanlış" denirse görüşmenin yeri boşaltılır, notu kalır.
- Herkes yalnızca kendi kayıtlarının sorularını görür ve yanıtlar (yönetici de). Rehber devrinde ayrılanın yanıtlamadığı
  "bu kim?" soruları devralana soru olarak geçmez, "hatırlanmayanlar"a düşer.
- Aktarım: kitaptaki "Tanıştıran durumu" (Kişiler) ve "Getiren durumu" (Mülkler) sütunları okunur ("Rehberde yok" /
  "Bilinmiyor"). Kontrol notu yalnızca yeni açılan kayda yazılır; Satal'da yanıtlanan soru yeniden yüklemede geri gelmez.
- Bilerek yapılmayanlar: getiren hiç yazılmamışsa sorulmaz (her yerin getireni olmaz); kontrol notu Satal'da elle
  eklenmez (ihtiyaç doğarsa eklenir).
- Denetim: `npm test` → 67 test. Gerçek kitapla yerel deneme veritabanında denendi (sonra silindi), liste tarayıcıda
  baştan sona kullanıldı. `npm run ornek-veri` ile gelen uydurma kayıtlarda da listede örnek sorular var.
- Satal açılana kadar aynı iş aktarım kitabında yürür: "Kontrol listesi" sayfası (aşağıda).

## Adlara yazılan bilgiler ve güncel rehber (26.11.2026) — PR 7'ye eklendi
Sadık: "Bazı kişileri kaydederken isime bilgiler yazıyorum, onları da değerlendir." ve "Sabit numaralara ihtiyacım
yok; çalışma temamız GSM numaraları ve bu numaralara WhatsApp'tan mesaj atmak üzerine kurulu."
- Sadık'ın ad düzeni (kendisi doğruladı): "Ad + yer / iş / ilgi + referans kişi". Ad her zaman kişi adıyla başlamıyor
  (firma, cihaz ya da tarifle başlayabiliyor), bazılarında hiç kişi adı yok.
- Kitapta yapılan (betikler proje dosyalarında: ayıklayıcı `ad_bilgi.py`, `rehber2.py`, elle verilen kararlar
  `rehber2_veri.py`): adlardan meslek, şirket, şehir, hitap, tip, "kim tanıştırdı" bağlantısı, geçmiş ilgi etiketi ve
  mülk satırı çıkarıldı; adın kendisi değiştirilmedi. Emin olunmayan hiçbir şey kesin gibi yazılmadı: birden çok adayı
  olan adlar kontrol listesinde "bu kim?" olarak bekliyor, varsayımlar "Kontrol" sütununda. İçinde sağlık, dava gibi
  özel bir sözcük geçen adlara dokunulmadı. Eski dosyadan kalan hitap sütunu (kısalmış adlardan çıkmıştı) tam adlara
  göre yeniden kuruldu.
- Yalnızca cep numarası tutulur (kalıcı kural, aşağıda). Sabit numaralar çıkarıldı; cep numarası olmayan 137 kişi
  "Aktar: Hayır" oldu (Sadık isterse geri alınır). Dökümdeki toplu yüklenmiş firma dizini (3.640 kart) rehber
  sayılmadı. Dökümden yalnızca ad, telefon, e-posta, kurum ve not okundu; doğum günü, fotoğraf ve adres okunmadı.
- Satal'a eklenenler:
  - **Seslenilecek ad aktarımda okunuyor:** kayıt adı kişinin kendi adıyla başlamıyorsa mesajda kullanılacak ad
    kitaptaki "Seslenilecek ad" sütunundan gelir (kişi kartındaki aynı adlı alana yazılır). Sütun boşsa adın ilk
    sözcüğü kullanılır; tamamı büyük ya da küçük harfle yazılmış ad düzeltilir ("AHMET" → "Ahmet").
  - **Adsız hitap** (şema: `crm/migrations/004_adsiz_hitap.sql`): kayıtta kişi adı hiç yoksa hitap "Adını yazma" olur
    ve mesaj yalnızca "Merhaba," diye başlar (önceden adın ilk sözcüğüyle başlıyordu). Kitapta "Seslenilecek ad"
    sütununda "(yok)" yazan 643 kişi (604'ü aktarılacak) böyle girer; kişi kartından değiştirilebilir. Claude'a
    yazdırılan mesajda da geçerli.
  - **Bir talepte birden çok mahalle:** tek ilçe yazılıysa mahalle sütununa "A; B; C" yazılabilir, her biri ayrı bölge olur.
- "Seslenilecek ad" kitapta nasıl doldu: adı bilgiyle başlayan kayıtta ayıklayıcı içindeki kişi adını bulur; "Dr., Av.,
  Prof." ile başlayan adda sonraki adı alır; adın ardından "Teyze, Amca, Dayı, Yenge, Enişte, Hala, Usta, Hoca"
  geliyorsa onu da yazar ("Feride Teyze"; Bey / Hanım / Abi / Abla yazılıysa o geçerlidir). Adı ayıklayıcının
  tanımadığı bir sözcükle başlayan 560 kayıt tek tek okundu: 175'inde kişinin adı yazıldı, 311'i adsız selama alındı,
  ilk sözcüğü az rastlanan bir ad ya da lakap olabilecek 74'ü olduğu gibi bırakıldı (mesaj o sözcükle başlar; yanlışsa
  kişi kartından düzeltilir). Deneme yüklemesinde 4.313 kişinin selamı tek tek üretildi; yazımı bozuk selam kalmadı.
- Denetim: `npm test` → 67 test. Güncel kitap yerel deneme veritabanına yüklendi (sonra silindi), sayılar aşağıda.

## Günlük notlar (26.11.2026'dan beri)
Sadık talepleri ve notları sohbete yazıyor ya da dikte ediyor ("… şu taraflardan şu kadarlık yer arıyor"). Her notta:
kişi rehberde bulunur (iki aday varsa sorulur), talep `hafiza_veri.py` → `GUNCEL_TALEP`'e eklenir, kitap yeniden
üretilir ve kısa bir yanıt verilir: kim kaydedildi, eldeki uygun yerler, eski notlardaki yerler (o günün tarihi ve
fiyatıyla), sorulabilecek kişiler. Notta rehberde bulunamayan bir ad geçerse aynı gün sorulur.

## Eldeki verilerin aktarımı (24–26.11.2026)
- Kaynaklar: Sadık'ın telefon rehberi (ilk dosya 4.172 satır; 26.11.2026'da Google "Kişiler" dökümüyle güncellendi),
  Google Keep notları, WhatsApp (24 sohbet + ofis grubu). Hepsi tek bir "aktarım çalışma kitabı"nda; gerçek kişi verisi
  içerdiği için depoda DEĞİL, proje dosyalarında: `satal-aktarim/satal-aktarim.xlsx` (asıl kopya). Betikler de orada
  (`temizle.py`, `wa_ekle.py`, `hafiza.py`, `hafiza_veri.py`, `rehber2.py`, `rehber2_veri.py`, `ad_bilgi.py`); ilk
  düzenin yedeği ve döküm `kaynak/` klasöründe. Kişilerin hepsi Sadık'ın adına girecek.
- Kitabın sayfaları (26.11.2026 düzeni): Okuyun (açıklama, sorular ve yanıtlar), Kontrol listesi (açık sorular tek
  sayfada: 60 "bu kim?", 9 hatırlanmayan, 71 teyit; Sadık yanıtını sohbette söyler ya da "Yanıtınız" sütununa yazar),
  Kişiler (4.457, 4.313'ü aktarılacak; tipi, çalıştığı bölge ve tür, kim tanıştırdı, tanıştıran durumu, meslek, şirket,
  şehir, seslenilecek ad, hitap; "Kontrol" yanıt bekleyenler, "Açıklama" yalnızca bilgi), Geçmiş ilgiler (358), Talepler
  (7), Aranacaklar (37), Mülkler (323: 71 satışta, 242 arşiv, 10 satıldı; kimden geldi, getiren durumu, not tarihi),
  Ofis grubu (266), Keep notları, WhatsApp, Alınmayanlar, Listeler.
- Kurallar (Sadık): bir talep 6 aydan uzun geçerli olmaz (sınır 24.05.2026). Eski arayışlar talep değil "geçmiş ilgi",
  eski yerler "Arşiv" olur (Satal'da pasif: eşleştirmeye girmez, aramada ve getirenin kartında görünür).
- Varsayımlar: alım gücü sütunu boş (notlarda güncel rakam yok, tahmin yazılmadı; Satal'da bu kişiler "parası
  bilinmiyor" diye görünür). Arşivdeki yerlerin fiyatı yazılmadı. Şifre, banka, kimlik numarası gibi kişisel bilgiler
  ve komisyon konuşmaları kitaba hiç alınmadı.
- Ofis grubu sayfası Satal'a YÜKLENMEZ: oradaki yerler ve arayışlar danışmanların kendi müşterileri, çoğunun telefonu
  yok. Sadık'ın başvurusu için kitapta durur; Satal açılınca her danışman kendi kaydını kendi hesabına girer. Sadık'ın
  ve Recep Bey'in grupta paylaştığı önemli yerler Mülkler sayfasına da işlendi. Ofis içi özel sohbet aktarılmadı.
- Yükleme: `crm/scripts/aktar.js` (adımlar `crm/KURULUM.md` → "Eldeki verileri aktarma"). 26.11.2026'da güncel kitapla
  yerel deneme veritabanında denendi (sonra silindi): 4.313 kişi, 315 mülk, 339 geçmiş ilgi, 37 hatırlatma, 7 talep;
  184 "kim tanıştırdı" bağlantısı; kontrol listesine 60 "bu kim?" sorusu (ayrıca 9 hatırlanmayan) ve 64 teyit notu;
  171 satır bilerek alınmadı (144'ü kişi: cep numarası olmayanlar). Bir bilgisi eksik giren satır çıkmadı. İkinci
  yüklemede hiçbir şey çift yazılmadı. (25.11.2026 denemesinde listeden yanıtlanan soruların sonraki yüklemede geri
  açılmadığı da görülmüştü.)
- Sorular: Okuyun sayfasında 16 soru vardı (notlarda yalnızca adıyla geçen kişiler kim, bazı yerler hangi ilçede).
  Altısını Sadık 25.11.2026'da yanıtladı (1, 2, 3, 4, 9, 12); kitaba işlendi: iki kişi rehberdeki kayıtlarına bağlandı,
  bir mahallenin ilçesi ve ofis grubundaki bir takma adın kime ait olduğu netleşti, iki adı hatırlamadı (bunlar
  "Bilinmiyor" diye işaretlendi, yalnızca adlarıyla duruyor). Yanıtlar Okuyun sayfasında "Yanıtladıklarınız"
  başlığında, betikte `hafiza_veri.py` → `YANITLAR`. Yanıt gelince: `hafiza_veri.py` düzeltilir, `hafiza.py` yeniden
  çalıştırılır (girdi `kaynak/` klasöründeki ilk düzen), eski ve yeni kitap hücre hücre karşılaştırılır, yükleme
  yeniden denenir.
- Bekleyen: Okuyun sayfasındaki 16 soru (5, 6, 7, 8, 10, 11, 13, 14, 15, 16 ve adlardan çıkan 17–22); Sadık'a sohbette
  üçer üçer sorulur (en çok kaydı kapatacak ve en yeni olanlar önce). 25.11.2026'da iki "bu kim?" sorusu (6 ve 20),
  26.11.2026'da üçü (17, 18, 19) soruldu; yanıt bekleniyor. Yanıtlanmış ya da "hatırlamıyorum" denmiş soru yeniden
  sorulmaz.
- Güncel rehber geldi (26.11.2026): Sadık Google "Kişiler" dökümünü yükledi. Eski dosyada orta sözcükleri düşmüş 1.215 ad
  düzeltildi, 410 yeni kişi ve 41 eksik cep numarası eklendi. WhatsApp'ta yazışılan ama numarası eski dosyada olmayan
  11 kişinin hepsi bulundu; sohbet özetleri kişi notlarına da yazıldı. Rehber yeniden gelirse: dosya `kaynak/`
  klasörüne konur, `rehber2_veri.py`'deki `DOKUM` adı güncellenir, `hafiza.py` yeniden çalıştırılır (Kişi No'lar
  değişmez; yeni kişiler sona eklenir).

## Kalıcı kurallar (kullanıcı söyledi)
- Yalnızca cep numarası (26.11.2026): Sadık'ın sabit numaralara ihtiyacı yok; çalışma cep numaraları ve bu numaralara
  WhatsApp'tan mesaj atmak üzerine kurulu. Aktarımda sabit numara tutulmaz, cep numarası olmayan kişi aktarılmaz.
- Unutturma (25.11.2026): Sadık'ın notunda getiren ya da tanıştıran olarak geçen bir ad rehberde bulunamıyorsa o gün
  kendisine sorulur ve yanıtı kayda işlenir. Tahmin edilen bilgi sessizce kesin gibi yazılmaz; "Kontrol" olarak
  işaretlenir ki Sadık sonradan tek tek bakabilsin.
- Halis Bey'e (Pixelibol) ya da başka bir tedarikçiye yazılan hiçbir mesajda ücret SORULMAZ.
- Taslak onaylanmadan kuruluma başlanmaz. Şu an taslak aşamasındayız: kullanıcının aklına gelenler toparlanır,
  tekrar tekrar iş yapılmaz.
- Modül ayrımına (hangi parça hangi modülde) EN SONDA karar verilecek.
- Revy, Tapusor, Endeksa gibi uygulamalardan veri ALINMAZ; yalnızca ne yaptıklarını anlamak için incelendi.
  Açık kaynaklardan (TKGM, belediye e-İmar, AFAD, MTA, TÜİK, TCMB vb.) toplanan veriler kullanılabilir;
  kaynak ve tarih gösterilir, lisans kontrol edilir, "resmi belge yerine geçmez" notu düşülür.

## Halis Bey (Pixelibol) ile durum
- Halis: sunucu Türkiye'de olur, DNS'te `crm` kaydını açar; teknolojiyi sordu.
- 23.11.2026'da yanıt gönderildi (Node.js 22 + PostgreSQL 16/PostGIS + Nginx + Docker; Ubuntu 24.04 VDS,
  2 vCPU / 4 GB / 60–80 GB, SSH anahtarı, dışarı HTTPS, günlük yedek, SMTP). İmza: "Mehdi — Sadık Bey adına".
- Beklenen: Halis'in cevabı, VDS ve SSH erişim bilgileri. Sonra DNS'te `crm` → sunucu IP.

## Proje taslağı (canlı belge, her şey orada)
https://claude.ai/artifact/RbtgmPsBQWGgwBA5RWFG3g — "Satal — Proje Taslağı"

### Taslaktaki bölümler ve netleşenler
- Amaç: rehberdeki kişileri unutturmamak; talep ↔ mülk iki yönlü eşleşme, puan 0–100, 80+ = A.
- Barındırma: Halis'in sunucusu (Türkiye), `crm.stagayrimenkul.com.tr`, web + telefona "ana ekrana ekle".
  Teknik işler Claude'da.
- Modüler yapı (çizimli): ortak çekirdek + modüller (CRM ilk sürüm; sonra Ekspertiz, Arazi analizi, Piyasa verileri).
  Kullanıcı ileride ekspertiz programı ve arazi analizleri de istiyor. Modül ayrımı en sonda kesinleşecek.
- Gizlilik: danışman yalnızca kendi verisini görür, yönetici hepsini; ilk girişte gizlilik beyanı onayı.
- Giriş (karar 23.11.2026): Google ile giriş ya da e-posta + şifre (Apple YOK). Danışman kendisi üye olur,
  e-postasına giden linkten şifresini belirler, "Şifremi unuttum" var; şifreyi yönetici vermez. Yönetici onayı
  şart. Oturum aynı cihazda 1 ay açık. Authenticator ŞİMDİLİK YOK. Danışman profilinde fotoğraf.
- Kişiler: aynı kişi hem alıcı hem satıcı olabilir; hitap (Ahmet / Bey / Hanım / abi / abla, sen-siz); belge yükleme
  (tapu, imar); aynı numara birden çok danışmanda ise yöneticiye "çift kayıt" uyarısı.
- Kategori ağacı: Konut (daire 3+1/2+1, kat konumu, bahçeli…; villa müstakil/ikiz/sıra…), Ticari (cadde dükkan,
  depo tavan yüksekliği…), **Arazi** (arsa, tarla, zeytinlik, bağ/bahçe, hazine arazisi). Alanlar isteğe bağlı.
- Talepler ve mülkler: aralıklar, "olmazsa olmaz / tercih". TL kuralı: alıcı bütçesi girildiği günün TCMB kuruyla
  dolara sabitlenir; mülk TL fiyatı güncel kurla çevrilir.
- Eşleştirme (karar 23.11.2026): fiyat (+%10 pay) ve ana kategori yalnızca eler; puan konum 45, özellikler 40,
  alt tür 15; geçmiş puan değil ayrı işaret. Belge: https://claude.ai/artifact/JfQVQ4Ae9eKUaGZyYiLKjh
  Yönetici için danışman bazlı ekip eşleşmeleri (fotoğraflı); danışmana ekip eşleşmesi hakkında hiçbir şey söylenmez.
- WhatsApp mesajları: hitap ve tona göre otomatik metin. Claude ile yazdırma (ücretli) yalnızca Sadık'ın
  hesabında açık; Sadık modülleri ve ücretli özellikleri kullanıcı bazında açıp kapatır.
- Ada/parsel teknik analizi: plan lejantları (açık kaynak; "özel imar uygulama alanı" gibi), plan ölçeği
  (1/1000 – 1/5000), plan notları, dere mutlak koruma, kıyı kenar çizgisi/koruma, baraj havzası, sit alanı ve
  derecesi. Aday kaynak: belediye KEOS / NetCAD e-İmar (örn. https://keos.cesme.bel.tr/keos/ — yurt dışından
  503 veriyor, Türkiye'deki sunucudan denenecek). Lejant kaynağının adı henüz bilinmiyor (araştırılacak).
- İncelenen uygulamalar: Revy, Endeksa, Tapusor, ParselTapu, Parsel, TKGM — özellik tablosu ve Satal için fikirler.
- Mevcut deneme sürümünden korunacaklar. Deneme sürümündeki kişiler yeni sisteme AKTARILMAYACAK (karar 23.11.2026).
- Kategori listesi (Emlakjet tabanlı + hazine arazisi) onaylandı. Kiralık olacak. CRM'den sonraki modül: ekspertiz.

## Toptan inceleme (23.11.2026)
Rapor: https://claude.ai/artifact/6AVFdBVrGf9RLztQjmcRUs — "Satal — Toptan İnceleme Raporu". 18 bulgu ve Sadık'ın
kararını bekleyen 10 madde var; onaylananlar taslağa işlenecek. En acil olanlar deneme sürümünde:
- Deneme sürümünde gizlilik kuralını delen iki nokta var; ayrıntısı raporda (bu depo herkese açık olduğu için
  buraya yazılmadı).
- Düzeltmek için yeni Supabase yönetim kodu gerekiyor (eskisi iptal). Sadık'ın onayı bekleniyor.
- Bu depo herkese açık (GitHub Pages ücretsiz hesapta bunu gerektiriyor). Yeni sürüm kapalı depoda yazılmalı;
  bu dosyaya kişisel ya da gizli bilgi yazma.

## Birden fazla bilgisayar (24.11.2026)
- Sadık ev ve işte farklı bilgisayarlarla çalışıyor; köprü GitHub. Oturum başında `.claude/hooks/oturum-basi.ps1`
  GitHub'dan son hali indirir; "kaydet" deyince bu dosya güncellenip GitHub'a gönderilir (kurallar CLAUDE.md'de).
- Yeni bilgisayar: `kurulum/README.md` (tek komut). İkinci laptop 24.11.2026'da kuruldu (proje `C:\Users\sadik\code\satal`,
  PostgreSQL 16 hizmet olarak çalışıyor, 48 test geçti). Sıfır bilgisayarda betik henüz baştan sona denenmedi.

## Bilgisayara bağlantı
- Kullanıcının bilgisayarı DESKTOP-K2A4AJV; Remote Control listesinde "satal", "STA Claude", "8629 9" klasörleri var
  ama hiçbiri bulut oturumuna açılmıyor (Claude uygulaması güncellemesi gerekebilir ya da özellik hesapta açık değil).
- Chrome/ekran izleme bu bulut oturumunda yok. Alternatif: bilgisayardaki Claude uygulamasında `C:\Satal` seçili
  yerel bir Claude Code oturumu açıp bu dosyadan devam etmek. Video gelirse ffmpeg ile kare çıkarılıp incelenebilir.

## Deneme sürümü (kapandı, 23.11.2026)
- Sadık'ın isteğiyle Supabase'deki `satal` projesi 23.11.2026'da silindi; içindeki kişiler, portföyler ve hesaplar
  kalıcı olarak gitti. Kişiler yeni sisteme zaten aktarılmayacaktı.
- https://sadikalpe.github.io/satal artık yalnızca "Yakında" notunu gösterir (Sadık'ın kararı). `web/` içindeki eski kod
  başvuru için duruyor, çalışmaz.
- https://stagayrimenkul.com.tr/crm (Wix) sayfası bu siteyi çerçeve içinde gösteriyor; kaldırılmadı, "Yakında" yazıyor.
