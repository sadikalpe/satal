# Kaldığımız yer (23.11.2026)

## Kalıcı kurallar (kullanıcı söyledi)
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

## Bilgisayara bağlantı
- Kullanıcının bilgisayarı DESKTOP-K2A4AJV; Remote Control listesinde "satal", "STA Claude", "8629 9" klasörleri var
  ama hiçbiri bulut oturumuna açılmıyor (Claude uygulaması güncellemesi gerekebilir ya da özellik hesapta açık değil).
- Chrome/ekran izleme bu bulut oturumunda yok. Alternatif: bilgisayardaki Claude uygulamasında `C:\Satal` seçili
  yerel bir Claude Code oturumu açıp bu dosyadan devam etmek. Video gelirse ffmpeg ile kare çıkarılıp incelenebilir.

## Deneme sürümü (eski, çalışıyor; yeni sürüm gelene kadar açık)
- https://stagayrimenkul.com.tr/crm (Wix'te tam ekran çerçeve) ve https://sadikalpe.github.io/satal
- Supabase projesi `satal` (ref `sifhvpfzxijohkkuozgg`). Yönetici hesapları: Sadık, Recep Önen.
- Supabase yönetim kodu iptal edildi; o sisteme değişiklik gerekirse yeni kod istenir.
