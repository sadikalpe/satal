# Satal CRM (yeni sürüm)

STA Gayrimenkul danışmanları için müşteri takibi: rehber, talepler, mülkler, iki yönlü eşleştirme (0–100 puan),
WhatsApp mesajı hazırlama, yönetici ekranları.

- **Teknoloji:** Node.js 22 (Fastify), PostgreSQL 16, sunucuda üretilen HTML, az miktarda tarayıcı betiği.
- **Gizlilik:** her danışman yalnızca kendi kayıtlarını görür. Bu kural hem uygulamada hem veritabanında
  (satır düzeyi güvenlik) ayrı ayrı uygulanır.
- **Kurulum:** [KURULUM.md](KURULUM.md)

## Geliştirme
```sh
npm install
npm run migrate          # yerel PostgreSQL'de "satal" veritabanını kurar
npm run ornek-veri       # uydurma örnek kayıtlar (yalnızca boş veritabanına, yayında çalışmaz)
DENEME_GIRISI=1 npm run dev
npm test                 # "satal_test" veritabanını sıfırlayıp bütün testleri çalıştırır
node scripts/aktar.js dosya.xlsx --danisman <e-posta> [--yaz]   # aktarım çalışma kitabını yükler (KURULUM.md)
```

## Klasörler
- `migrations/` veritabanı şeması ve gizlilik kuralları
- `data/konum/` il, ilçe, mahalle ve komşuluk verisi (kaynaklar: `data/konum/KAYNAK.md`)
- `src/alan/` kategoriler, eşleştirme ve puanlama, mesaj şablonları
- `src/servis/` eşleşme hesabı, silme, dosya, zamanlanmış işler (kur, gece hesabı, temizlik)
- `src/rotalar/` ekranlar · `src/gorunum/` ortak görünüm parçaları · `src/statik/` stil ve betik
- `test/` birim ve uçtan uca testler
- `deploy/` Nginx ayarı ve yedek betiği
