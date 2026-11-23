# Kaldığımız yer (21.11.2026)

## Kalıcı kurallar (kullanıcı söyledi)
- Halis Bey'e (Pixelibol) ya da başka bir tedarikçiye yazılan hiçbir mesajda ücret SORULMAZ.

## Halis Bey (Pixelibol) ile durum
- Halis: sunucu Türkiye'de olur, DNS'te `crm` kaydını açar; önce teknolojiyi sordu (PHP mi Node.js mi).
- Yanıt taslağı Gmail'de hazır (Node.js 22 + PostgreSQL 16/PostGIS + Nginx + Docker; Ubuntu 24.04 VDS, 2 vCPU/4 GB/60–80 GB). Kullanıcı onayıyla gönderilecek.

## Karar: Satal sıfırdan yeniden kurulacak
Proje taslağı (canlı belge, her değişiklik orada):
https://claude.ai/artifact/RbtgmPsBQWGgwBA5RWFG3g — "Satal — Proje Taslağı"

Kullanıcı taslağı konuşarak geliştiriyor. **Taslak onaylanmadan kuruluma başlanmayacak.**

### Taslakta netleşenler
- Kendi sunucumuz: Halis'in hosting hizmeti, adres `crm.stagayrimenkul.com.tr`. Web + telefona "ana ekrana ekle" uygulama.
- Teknik işler (GitHub, sunucu, kurulum, sorun giderme) tamamen Claude'da; gerekirse kullanıcının bilgisayarına bağlanılacak
  (Claude uygulaması güncellenecek, Google Drive dışında bir klasör, örn. `C:\Satal`, Remote Control'e eklenecek).
- Kesin gizlilik: danışman yalnızca kendi rehberini/taleplerini/mülklerini görür; yönetici hepsini. İlk girişte gizlilik beyanı onayı.
- Giriş: Google ile giriş ya da e-posta + şifre. Apple ile giriş YOK. E-posta doğrulaması + yönetici onayı.
  İki aşamalı doğrulama herkes için zorunlu (ilk sürümde Google Authenticator, ücretsiz).
- Kişi aynı anda alıcı ve satıcı olabilir; talepler (aranan) ve mülkler (eldeki) iki yönlü eşleşir, 0–100 puan, 80+ = A.
- Ayrıntılı kategori ağacı (konut: daire 3+1/2+1, kat konumu, bahçeli…; villa müstakil/ikiz; ticari: cadde dükkan, depo tavan
  yüksekliği…; arsa/tarla/zeytinlik). Alanlar isteğe bağlı.
- Hitap seçimi (Ahmet / Ahmet Bey / Ahmet abi / Hanım / abla, sen-siz) ile WhatsApp mesajı.
- Kişiye/mülke tapu, imar gibi belge yükleme.
- Yöneticiye: aynı numara birden fazla danışmanda kayıtlıysa uyarı; ekip eşleşmeleri danışman bazında, danışman fotoğraflarıyla.
- TL kuralı korunuyor: alıcı bütçesi girildiği günün TCMB kuruyla dolara sabitlenir; mülk TL fiyatı güncel kurla çevrilir.
- Hedef: ücretsiz kalmak (sunucu Halis'ten, Authenticator, Google girişi).

### Bekleyenler
- Halis'e teknik sorular gönderildi (hosting türü, SSH, Docker, PostgreSQL/MySQL, DNS `crm` kaydı, SSL, SMTP, sunucu konumu,
  ücret). Cevabına göre teknoloji seçilecek: VPS → Docker + PostgreSQL + Node.js + Nginx; paylaşımlı → PHP/Laravel + MySQL.
- Taslaktaki "Karar bekleyen sorular" listesi (danışman kendi mi üye olsun, kiralık da olsun mu, puan ağırlıkları, veri aktarımı…).

## Deneme sürümü (eski, çalışıyor; yeni sürüm gelene kadar açık)
- https://stagayrimenkul.com.tr/crm (Wix'te tam ekran çerçeve) ve https://sadikalpe.github.io/satal
- Supabase projesi `satal` (ref `sifhvpfzxijohkkuozgg`). Yönetici hesapları: Sadık, Recep Önen.
- Supabase yönetim kodu iptal edildi; o sisteme değişiklik gerekirse yeni kod istenir.
