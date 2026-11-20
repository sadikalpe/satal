# Satal — STA Gayrimenkul Portföy CRM

`crm.stagayrimenkul.com.tr` adresinde çalışacak, danışmanların rehberlerini yükleyip kişilere bütçe, bölge ve geçmiş görüşme notu yazdığı; yeni bir portföye uygun alıcıları bulup kişiye özel WhatsApp mesajı hazırlayan CRM.

## Ne yapar

- **Giriş:** Her danışman kendi e-postası ve şifresiyle girer. İsteyen “Google ile giriş yap”ı kullanabilir, ama yalnızca yöneticinin açtığı e-posta adresleriyle. Dışarıdan kayıt olunamaz. İsteyen kişi Hesabım sayfasından iki adımlı doğrulamayı (Google Authenticator) açabilir.
- **Yetkiler**
  - *Yönetici:* bütün danışmanların rehberini ve portföylerini görür. Sorguları bütün ekibin verisi üzerinde çalışır. Danışman hesabı açar, kapatır, şifre sıfırlar, ayrılan danışmanın rehberini devralır, dolar kurunu girer.
  - *Danışman:* yalnızca kendi rehberini ve kendi portföylerini görür.
- **Ekip eşleşmeleri:** Bir danışmanın girdiği portföy başka bir danışmanın (ya da yöneticinin) rehberindeki birine uyuyorsa bu yalnızca yöneticiye bildirilir. Bildirimler “Ekip eşleşmeleri” sekmesine düşer ve “Paylaştım” ya da “İlgisiz” diye kapatılır. Danışman yalnızca “ekipte başka uygun alıcılar da var, yöneticiye bildirildi” notunu görür; kim olduklarını görmez.
- **Eşleştirme:** Dolar bazında bütçe, ilgilenilen bölgeler, notlar ve geçmiş görüşmeler (ör. “1,5 yıl önce Güzelbahçe arsa · Olmadı”) puanlanır.
- **Kur ve TL tutarlar:** USD/TRY kuru her gün TCMB’den (döviz satış) otomatik alınır.
  - *Alıcının bütçesi* TL girilirse girildiği günün kuruyla dolara çevrilip öyle saklanır. Bir yıl sonra TL değer erise de kişinin alım gücü o günkü dolar karşılığında kalır. Asıl TL tutar, kur ve tarih kayıtta görünür.
  - *Geçmiş görüşmelerdeki tutarlar* TL girilirse görüşme tarihindeki TCMB kuru otomatik getirilir (gerekirse elle değiştirilebilir).
  - *Satılık mülkün* TL fiyatı TL olarak kalır; dolar karşılığı her kur güncellemesinde yeniden hesaplanır.
- **Claude:** kişiye özel WhatsApp mesajı yazar, serbest yazılmış notu bütçe, bölge ve geçmiş alanlarına ayırır, kural tabanlı taramanın kaçırdığı kişileri notlardan bulur.
- **Rehber yükleme:** iPhone/Android `.vcf`, Google/Outlook CSV ve Excel’den kaydedilmiş CSV dosyalarını okur. Türkçe karakterler korunur, numaralar tek biçime getirilir, tekrarlar atlanır.

## Yapı

| Klasör | İçerik |
|---|---|
| `web/` | Site (statik HTML/JS, derleme gerekmez). Vercel bu klasörü yayınlar. |
| `supabase/migrations/` | Veritabanı tabloları ve erişim kuralları (Row Level Security). |
| `supabase/functions/ai/` | Claude çağrıları (API anahtarı sunucuda kalır). |
| `supabase/functions/admin-users/` | Yöneticinin danışman hesabı açma/kapatma işlemleri. |
| `supabase/functions/fx/` | TCMB’den günlük ve geçmiş tarihli USD/TRY kuru. |
| `tests/` | Eşleştirme ve dosya okuma testleri, veritabanı yetki testleri. |

## Kurulum (bir kez, yaklaşık 30 dakika)

### 1. Supabase (veritabanı ve giriş)

1. [supabase.com](https://supabase.com) üzerinde hesap açın ve **New project** oluşturun. Bölge olarak **Central EU (Frankfurt)** seçin.
2. Sol menüden **SQL Editor**’ü açın. `supabase/migrations/20261120000000_init.sql` dosyasının tamamını yapıştırıp **Run**’a basın.
3. **Authentication → Sign In / Providers**
   - *Email* açık kalsın.
   - **Allow new users to sign up** seçeneğini **kapatın**. Böylece yalnızca sizin açtığınız hesaplar girebilir, Google ile de dışarıdan kayıt olunamaz.
4. **Authentication → URL Configuration**
   - *Site URL:* `https://crm.stagayrimenkul.com.tr`
   - *Redirect URLs:* `https://crm.stagayrimenkul.com.tr/**` (Vercel’in verdiği `....vercel.app` adresini de ekleyin)
5. **Authentication → Users → Add user → Create new user:** kendi e-postanızı ve şifrenizi girin, *Auto Confirm User* işaretli olsun. **İlk açılan kullanıcı otomatik olarak yönetici olur.**
6. **Project Settings → API** sayfasındaki *Project URL* ve *anon / publishable key* değerlerini `web/config.js` dosyasına yazın. Bu anahtar herkese açık olabilir. *service_role / secret* anahtarını hiçbir yere yazmayın.

### 2. Google ile giriş

1. [console.cloud.google.com](https://console.cloud.google.com) → yeni proje → **APIs & Services → OAuth consent screen** → *External*, uygulama adı “STA CRM”.
2. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - *Authorized redirect URIs:* `https://<proje-kodunuz>.supabase.co/auth/v1/callback` (Supabase’deki Google ayar sayfasında bu adres yazar).
3. Çıkan *Client ID* ve *Client secret*’ı Supabase’de **Authentication → Sign In / Providers → Google** bölümüne yapıştırıp açın.

Danışmanın Google ile girebilmesi için hesabının o Gmail adresiyle açılmış olması gerekir.

### 3. Claude (Anthropic API)

1. [console.anthropic.com](https://console.anthropic.com) → hesap açın → **Billing** bölümünden ödeme yöntemi ekleyin → **API Keys → Create Key**.
2. Supabase’de **Edge Functions → Secrets** bölümüne `ANTHROPIC_API_KEY` adıyla bu anahtarı ekleyin.

### 4. Sunucu fonksiyonları

Supabase’de **Edge Functions → Deploy a new function → Via Editor**:

- Adı `ai` olan bir fonksiyon açın, `supabase/functions/ai/index.ts` içeriğini yapıştırıp **Deploy**’a basın.
- Adı `admin-users` olan bir fonksiyon açın, `supabase/functions/admin-users/index.ts` içeriğini yapıştırıp **Deploy**’a basın.
- Adı `fx` olan bir fonksiyon açın, `supabase/functions/fx/index.ts` içeriğini yapıştırıp **Deploy**’a basın (TCMB kurları).

Komut satırını tercih ederseniz:

```bash
npx supabase functions deploy ai admin-users fx --project-ref <proje-kodunuz>
```

### 5. Vercel (site)

1. [vercel.com](https://vercel.com) → GitHub ile giriş → **Add New → Project** → bu depoyu seçin → ayarlara dokunmadan **Deploy**. `vercel.json` sitenin `web/` klasöründen yayınlanmasını sağlar.
2. **Project → Settings → Domains → Add** → `crm.stagayrimenkul.com.tr`. Vercel size bir **CNAME** değeri gösterir.

### 6. Alan adı (Pixelibol)

`stagayrimenkul.com.tr` alan adının DNS kayıtları Pixelibol’de duruyor (ns1/ns2.pixelibol.com). Pixelibol paneline şu kaydı ekleyin:

| Tür | Ad / Host | Değer |
|---|---|---|
| CNAME | `crm` | Vercel’in gösterdiği değer (genellikle `cname.vercel-dns.com`) |

Ana site (Wix) bu işlemden etkilenmez. Kayıt genellikle birkaç dakikada, en geç birkaç saatte etkin olur. Vercel güvenli bağlantı (https) sertifikasını kendisi kurar.

### 7. İlk kullanım

1. `crm.stagayrimenkul.com.tr` adresine kendi hesabınızla girin.
2. Sağ üstte günün TCMB kuru görünür. TCMB’ye ulaşılamadığı nadir durumlarda **Kuru güncelle** ile elle girebilirsiniz.
3. **Ekip** sekmesinden danışman hesaplarını açın: ad, e-posta, geçici şifre. Danışman ilk girişte **Hesabım** sayfasından şifresini değiştirir.
4. **Rehber yükle** sekmesinden rehberinizi yükleyin.

## Testler

```bash
npm test
```

```bash
npm run test:db
```

İkinci komut makinede PostgreSQL kurulu olmasını ister. Bir danışmanın başka danışmanın kişilerini göremediğini, yöneticinin herkesi gördüğünü ve iki adımlı doğrulamayı açan birinin kod girmeden veri göremediğini dener.

## Maliyet

- Vercel ve Supabase’in ücretsiz paketleri başlangıç için yeterlidir. Ücretsiz Supabase projesi bir hafta hiç kullanılmazsa duraklatılır; ekip her gün kullanacaksa sorun olmaz. Sürekli açık kalması ve günlük yedek için Supabase Pro paketi aylık yaklaşık 25 $.
- Claude kullanıldıkça ücretlendirilir: bir WhatsApp mesajı ya da not ayrıştırma birkaç kuruş tutar. Büyük bir rehberi notlardan taramak daha fazla tutar.

## Kişisel veriler (KVKK)

Bu sistem üçüncü kişilerin telefon numaralarını ve onlar hakkındaki notları saklar. Aydınlatma metni, açık rıza ve veri saklama süreleri konusunda bir hukukçuya danışın. Veriler Supabase’in Frankfurt’taki sunucularında durur. Claude’a yalnızca mesaj yazarken ilgili kişinin bilgileri, tarama yaparken de notlar gönderilir.
