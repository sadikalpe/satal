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
Deneme hiçbir şey yazmaz; kaç kişi, talep ve mülk gireceğini ve alınmayan satırları nedenleriyle gösterir. Dosya iki
kez yüklenirse aynı kişi, talep ve mülk yeniden eklenmez. Sayfa ve sütun düzeni: `src/lib/aktarim-hazirla.js`.

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
