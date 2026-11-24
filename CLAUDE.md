# Satal — STA Gayrimenkul CRM

Bu depoyla açılan her oturum önce bu dosyayı, sonra **DEVAM.md**'yi okusun. Kullanıcıyla Türkçe konuş; kullanıcı
yazılımcı değil, kısa ve teknik terimsiz anlat.

## Proje
Satal, STA Gayrimenkul'ün danışmanları için bir CRM: rehberdeki kişileri unutturmaz, talep (aranan mülk) ile mülkü
(eldeki) iki yönlü eşleştirir ve puanlar (0–100, 80+ = A), WhatsApp mesajı hazırlar. Yeni sürüm sıfırdan
kurulacak; adresi `crm.stagayrimenkul.com.tr`, sunucu Halis Bey'in (Pixelibol) Türkiye'deki VDS'i olacak.

## Nerede ne var
- **DEVAM.md** — kaldığımız yer, bekleyen işler, kalıcı kurallar. Her oturum sonunda güncelle.
- **Proje taslağı (canlı belge):** https://claude.ai/artifact/RbtgmPsBQWGgwBA5RWFG3g — "Satal — Proje Taslağı".
  Kullanıcının aklına gelenler buraya toparlanır.
- **`crm/`** — yeni Satal (Node.js 22 + PostgreSQL 16). Önce `crm/README.md`; kurulum `crm/KURULUM.md`.
  Değişiklikten sonra `cd crm && npm test` (yerel PostgreSQL ister). Henüz sunucuya kurulmadı.
- **Bu depodaki kod** (`web/`, `supabase/`, `tests/`) eski deneme sürümüdür; hâlâ yayında
  (https://sadikalpe.github.io/satal ve https://stagayrimenkul.com.tr/crm). Yeni sürüm ayrıca kurulacak.

## Birden fazla bilgisayar (ev, iş…)
Sadık bu projede birden çok bilgisayarda çalışıyor ve bir bilgisayarda başladığı işe diğerinde kaldığı yerden
devam etmek istiyor. Bilgisayarlar arasındaki tek köprü **GitHub**'dır; Claude'un sohbet geçmişi ve hafızası
bilgisayarlar arasında taşınmaz, bu yüzden kalıcı olan her şey bu depoya yazılır.
- **Oturum başında:** `.claude/hooks/oturum-basi.ps1` kendiliğinden çalışır, GitHub'daki son hali indirir ve durumu
  bildirir. Bildirimde başka bir dalda yarım kalmış iş ya da çakışma varsa kullanıcıya kısaca söyle; birleştirme
  ya da üzerine yazma işini sormadan yapma.
- **Bir iş bitince ya da kullanıcı "kaydet", "bitirdim", "eve gidiyorum", "kalkıyorum" gibi bir şey deyince:**
  DEVAM.md'deki "Kaldığımız yer"i güncelle (ne yapıldı, ne yarım kaldı, sıradaki adım, hangi daldayız), değişiklikleri
  kaydet (commit) ve GitHub'a gönder (push). Ardından kullanıcıya "Kaydedildi, diğer bilgisayardan devam edebilirsin"
  de. Göndermeden önce testler gerekiyorsa çalıştır.
- **Hafıza:** Kullanıcının "hatırla" dediği ve projeyle ilgili olan her şeyi Claude'un yerel hafızasına değil
  DEVAM.md'ye ya da bu dosyaya yaz; yoksa diğer bilgisayardaki Claude bilmez.
- Gizli bilgiler (şifre, anahtar, `.env`) GitHub'a gönderilmez; depo herkese açık.
- **Yeni bir bilgisayar:** `kurulum/yeni-bilgisayar.ps1` her şeyi kurar (Git, Node.js, GitHub girişi, PostgreSQL,
  proje). Adımlar `kurulum/README.md`'de.

## Kalıcı kurallar (kullanıcı koydu)
- Taslak onaylanmadan yeni sürümün kurulumuna başlama. Taslak aşamasında yalnızca kullanıcının söylediklerini toparla.
- Modül ayrımına (hangi parça hangi modülde) en sonda karar verilecek.
- Halis Bey'e ya da herhangi bir tedarikçiye yazılan mesajlarda asla ücret sorma.
- Revy, Tapusor, Endeksa gibi uygulamalardan veri alma; açık kaynakları (TKGM, belediye e-İmar, AFAD, MTA, TÜİK,
  TCMB…) kullan, kaynağı ve tarihi göster, lisansı kontrol et.
- Halis Bey'le yazışmalar "Mehdi — Sadık Bey adına" imzasıyla yürüyor.
- Danışman gizliliği kesin: danışman yalnızca kendi verisini görür, yönetici hepsini.
