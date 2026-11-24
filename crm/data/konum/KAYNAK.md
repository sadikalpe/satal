# Konum verisi: kaynak ve lisans

Bu klasördeki dosyalar `scripts/konum-verisi-uret.mjs` ile üretildi (üretim tarihi: 2026-11-23).

| Dosya | İçerik | Kaynak | Lisans |
| --- | --- | --- | --- |
| iller.json, ilceler.json, mahalleler.json | 81 il, 973 ilçe, 32254 mahalle adı | [turkiye-api](https://github.com/ubeydeozdmr/turkiye-api) 2025 veri seti (TÜİK MEDAS, PTT, Harita Genel Müdürlüğü verilerinden derlenmiş) | MIT |
| ilce_komsu.json | 2199 komşu ilçe çifti (913 ilçe sınırından) | OpenStreetMap idari sınırları, [geojsons-of-turkey](https://github.com/izzetkalic/geojsons-of-turkey) derlemesi | © OpenStreetMap katkıcıları, ODbL 1.0 |
| mahalle_komsu.json | 9044 komşu mahalle çifti (3899 mahalle sınırından) | aynı | aynı |

Notlar:
- Mahalle sınırı OpenStreetMap'te her mahalle için çizilmiş değil. Sınırı bulunan mahalleler mahalleler.json'da
  dördüncü alanla (1) işaretli; diğerlerinde "komşu mahalle" basamağı çalışmaz, "aynı ilçe" puanı verilir.
  Eksik komşuluklar yönetim ekranından elle eklenebilir.
- Komşuluk, sınırların ortak köşe noktalarından hesaplanır; resmi belge yerine geçmez.
