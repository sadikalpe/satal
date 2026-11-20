# Kaldığımız yer (20.11.2026)

## Yayında olanlar
- CRM: https://stagayrimenkul.com.tr/crm (Wix sayfasında tam ekran çerçeve) ve https://sadikalpe.github.io/satal
- Supabase projesi `satal` (ref `sifhvpfzxijohkkuozgg`, Tokyo bölgesi): şema, erişim kuralları, `fx` / `admin-users` / `ai` fonksiyonları kurulu.
- Yönetici hesapları: Sadık, Recep Önen. Deneme danışmanı: "deneme deneme".
- Google ile giriş kapalı (düğme gizli). Claude özellikleri kapalı (API anahtarı yok).
- Supabase yönetim kodu (sbp_...) iptal edildi; yeni kod gerekiyor.

## Son eklenenler (tarayıcı testinden geçti, yayında)
1. Eşleşme listesinde her alıcının altında belirgin "Danışmanı: Ad Soyad (e-posta)" satırı;
   portföy başlığında "Portföyü giren: ..." ve kaç alıcının başka danışmanlarda olduğu.
2. "Ekip eşleşmeleri" sekmesi artık yöneticinin portföyleri dahil bütün portföyleri tarıyor:
   her satırda "Alıcının danışmanı → portföy sahibi". Paylaştım/İlgisiz durumu `settings`
   tablosunda (`match_status`) saklanıyor.
3. Dolar bütçe 50 milyon $'ın üstündeyse "TL mi girdiniz?" uyarısı (ekranda $1.000M ve $500M
   bütçeler görüldü; büyük ihtimalle TL tutarlar dolar kutusuna yazılmış).

## Yarın yapılacaklar
- Kullanıcıyla Ekip eşleşmeleri ekranını birlikte kontrol etmek.
- Yeni Supabase erişim kodu istemek (kullanıcı onayladı): güvenli forma `sbp_...` yapıştırılacak.
- Kullanıcıya: yüksek görünen dolar bütçeleri ₺ TL'ye çevirip kaydetmesini söylemek.
- Sonra: Google girişi, crm.stagayrimenkul.com.tr için Pixelibol CNAME (`crm` → `sadikalpe.github.io`),
  isteğe bağlı Claude API anahtarı.
