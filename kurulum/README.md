# Bilgisayarlar arasında çalışma

Satal'da evde, işte ya da hangi bilgisayarda olursanız olun kaldığınız yerden devam edebilirsiniz.
Bilgisayarlar arasındaki köprü GitHub'dır. Claude'un sohbet geçmişi bilgisayarlar arasında taşınmaz; kaldığımız
yer `DEVAM.md` dosyasında yazılı durur ve her bilgisayardaki Claude oturuma başlarken onu okur.

## Günlük kullanım
1. **Başlarken:** Claude uygulamasında Code sekmesini açın, klasör olarak `code\satal` klasörünü seçin.
   Claude açılırken GitHub'daki son hali kendiliğinden indirir. Başka bilgisayarda yarım kalan bir iş varsa söyler.
2. **Kalkarken:** Claude'a **"kaydet"** (ya da "bitirdim", "eve gidiyorum") yazın. Claude kaldığımız yeri
   `DEVAM.md`'ye yazar ve her şeyi GitHub'a gönderir.
3. **Öbür bilgisayarda:** 1. adımla devam edin. "Kaldığımız yerden devam et" demeniz yeterli.

"Kaydet" demeden kalkarsanız o bilgisayardaki son değişiklikler GitHub'a gitmemiş olur. Bilgisayar açık kaldıysa
sorun yok; sonraki sefer o bilgisayarda "kaydet" demeniz yeterli, hiçbir şey kaybolmaz.

## Yeni bir bilgisayar
1. Claude uygulamasını kurup hesabınızla giriş yapın.
2. Başlat menüsünden **Windows PowerShell**'i açın (yönetici olarak değil) ve şunu yapıştırın:
   ```powershell
   irm https://raw.githubusercontent.com/sadikalpe/satal/main/kurulum/yeni-bilgisayar.ps1 | iex
   ```
3. Kurulum sırasında Windows birkaç kez izin ister, "Evet" deyin. GitHub girişi için tarayıcı açılır, ekrandaki
   kodu girin.
4. Bitince Claude uygulamasını kapatıp açın ve `code\satal` klasörünü seçin.

Kurulan programlar: Git, Node.js, GitHub CLI, Python, VS Code, PostgreSQL 16. Proje `C:\Users\<kullanıcı>\code\satal`
klasörüne iner. Betiği tekrar çalıştırmak güvenlidir.

## Neden Google Drive değil?
Proje klasörünü Drive gibi bir eşitleme klasörüne koymak, iki bilgisayar aynı anda dosya yazınca projeyi bozabilir.
GitHub her değişikliği sırayla kaydeder ve geri alınabilir tutar. Drive'daki yedekleriniz ayrı kalabilir.
