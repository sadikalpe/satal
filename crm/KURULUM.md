# Satal — sunucuya kurulum

Hedef: Ubuntu 24.04 VDS (2 vCPU / 4 GB), Docker; adres `crm.stagayrimenkul.com.tr`.
Şifre ve anahtarlar yalnızca sunucudaki `.env` dosyasında durur; depoya yazılmaz.

## Önce hazır olması gerekenler
1. Sunucuya SSH erişimi ve DNS'te `crm` kaydının sunucu IP'sine yönlenmesi.
2. Google ile giriş için OAuth istemcisi (yönlendirme adresi: `https://crm.stagayrimenkul.com.tr/giris/google/donus`).
3. E-posta gönderimi için SMTP bilgileri (davet ve şifre belirleme bağlantıları).
4. İsteğe bağlı: Claude ile mesaj yazdırma için Anthropic API anahtarı.

## Kurulum
```sh
# Docker ve sertifika aracı
apt update && apt install -y docker.io docker-compose-v2 certbot
# Kod
git clone <depo adresi> /opt/satal && cd /opt/satal/crm
cp .env.ornek .env && chmod 600 .env      # sonra .env dosyasını doldurun
# İlk sertifika (Nginx henüz çalışmıyorken)
certbot certonly --standalone -d crm.stagayrimenkul.com.tr
mkdir -p /var/www/certbot
# Başlat (veritabanı kendiliğinden kurulur ve güncellenir)
docker compose up -d --build
docker compose logs -f uygulama            # "veritabanı hazır" ve "çalışıyor" görülmeli
```
Sertifika yenileme: `certbot renew --webroot -w /var/www/certbot --deploy-hook "docker compose -f /opt/satal/crm/docker-compose.yml exec nginx nginx -s reload"` (certbot zamanlayıcısı kendiliğinden çalıştırır).

## İlk giriş
`.env` içindeki `SAHIP_EPOSTA` ve `YONETICI_EPOSTALARI` adresleriyle "Google ile giriş" yapan kişiler doğrudan
yetkilendirilir. Danışmanlar Yönetim → Ekip ekranından davet edilir.

## Eldeki verileri aktarma (bir kez)
Sadık'ın rehberi ve notları "aktarım çalışma kitabı" adlı Excel dosyasında hazır (proje dosyalarında; gerçek kişi
verisi olduğu için depoda değil). Sadık bir kez giriş yaptıktan sonra:
```sh
docker compose cp satal-aktarim.xlsx uygulama:/tmp/aktarim.xlsx
docker compose exec uygulama node scripts/aktar.js /tmp/aktarim.xlsx --danisman <Sadık'ın e-postası>        # önce dener
docker compose exec uygulama node scripts/aktar.js /tmp/aktarim.xlsx --danisman <Sadık'ın e-postası> --yaz  # sonra yazar
docker compose exec uygulama rm /tmp/aktarim.xlsx
```
Deneme hiçbir şey yazmaz; neyin gireceğini, alınmayan satırları ve bir bilgisi eksik giren satırları nedenleriyle
gösterir. `--rapor sorunlar.csv` eklenirse bu satırların listesi dosyaya yazılır (Excel'de açılır). Yazma tek
işlemdir: bir hata çıkarsa hiçbir şey yazılmaz.

Kitaptan okunan sayfalar ve Satal'daki karşılıkları:

| Sayfa | Satal'da |
|---|---|
| Kişiler | Kişiler: tipi (yatırımcı / al-satçı / olursa alır), çalıştığı bölge ve tür, alım gücü, kim tanıştırdı, tanıştıran durumu, mesajda seslenilecek ad ve hitap |
| Geçmiş ilgiler | Kişinin görüşme geçmişi (tarihi bilinmeyebilir ya da yalnızca yıl olabilir). Talep değildir. |
| Talepler | Talepler. Kitaptaki tarih talebin söylendiği gün sayılır; "hâlâ arıyor mu?" ona göre sorulur. İlçe sütununa birden çok ilçe ("Urla; Çeşme"), tek ilçe yazılıysa mahalle sütununa birden çok mahalle yazılabilir. |
| Aranacaklar | Geri arama hatırlatması; "Bugün kimi aramalıyım?" listesine düşer. |
| Mülkler | Mülkler. Satışta → aktif, Arşiv → pasif (eşleştirmeye girmez), Satıldı → satıldı; kimden geldiği, getiren durumu. |

Öbür sayfalar (Okuyun, Kontrol listesi, Ofis grubu, Keep notları, WhatsApp…) okunmaz. "Aktar" sütununda "Hayır" yazan
satır girmez. Sütun düzeni: `src/lib/aktarim-hazirla.js`.

Rehberde ad alanına bilgi de yazılmış olabilir ("Örnek Asansör Ahmet", "kiralık evi soran"). Mesajın doğru başlaması
için Kişiler sayfasındaki "Seslenilecek ad" sütunu okunur: doluysa mesajda o ad kullanılır ("Merhaba Ahmet,"); boşsa
adın ilk sözcüğü; "(yok)" yazıyorsa kayıtta kişi adı yoktur, kişi "Adını yazma" hitabıyla girer ve mesaj yalnızca
"Merhaba," diye başlar. Sonradan kişi kartından değiştirilebilir.

Kitaptaki açık sorular Satal'da danışmanın **Kontrol listesi**ne (`/kontrol`) düşer:
- Kişiler, Geçmiş ilgiler ve Mülkler sayfasındaki "Kontrol" sütunu (bir varsayım ya da eksik) kaydın teyit notu olur;
  danışman "Kontrol ettim" diyene ya da düzeltene kadar listede bekler.
- "Kim tanıştırdı" ya da "Kimden geldi" yalnızca adla yazılıysa (Kişi No yoksa) "Bu kim?" sorusu olur. "Tanıştıran
  durumu" / "Getiren durumu" sütununa "Rehberde yok" yazılan sorulmaz; "Bilinmiyor" yazılan "hatırlanmayanlar"da durur.

Dosya iki kez yüklenirse hiçbir şey çift yazılmaz: rehberde zaten olan numara yeniden eklenmez (kayıtlı kişinin
yalnızca boş alanları dolar; Satal'da elle yazılanın üstüne yazılmaz), aynı talep, mülk, geçmiş ilgi ve hatırlatma
yeniden açılmaz. Satal'da yanıtlanan kontrol sorusu da geri gelmez. Danışmanın Satal'da sildiği bir kişi ise yeniden
yüklemede yeni kayıt olarak açılır.

26.11.2026'da güncel kitapla yerel bir deneme veritabanında denendi: 4.313 kişi, 315 mülk, 339 geçmiş ilgi,
37 hatırlatma ve 7 talep girdi; ikinci yüklemede hiçbir şey eklenmedi.

## Yedek
Her gece veritabanı ve belgeler yedeklenir, 30 gün saklanır:
```sh
echo '15 3 * * * root /opt/satal/crm/deploy/yedek.sh >> /var/log/satal-yedek.log 2>&1' > /etc/cron.d/satal-yedek
```
Geri yükleme: `docker compose exec -T veritabani pg_restore -U postgres -d satal --clean < satal-TARIH.dump`

## Güncelleme
```sh
cd /opt/satal && git pull && cd crm && docker compose up -d --build
```

## Güvenlik duvarı
Yalnızca 22 (SSH), 80 ve 443 açık olmalı. Veritabanı ve uygulama portları dışarıya açılmaz.
