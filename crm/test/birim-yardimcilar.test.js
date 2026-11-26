// Küçük yardımcıların birim testleri: telefon biçimi, rehber dosyası okuma, TCMB kuru, mesaj şablonları.
import test from "node:test";
import assert from "node:assert/strict";
import { telefonNorm, telefonYaz, sayiOku, basHarfBuyut } from "../src/lib/metin.js";
import { vcfOku, csvOku, dosyaOku, yuklemeHazirla } from "../src/lib/rehber-oku.js";
import { tcmbOku } from "../src/servis/zamanli.js";
import { hitapYaz, aliciMesaji, saticiMesaji, claudeIstegi } from "../src/alan/mesaj.js";

test("telefon: farklı yazımlar tek biçime gelir", () => {
  for (const ham of ["0555 111 22 33", "+90 555 111 22 33", "5551112233", "0090 (555) 111-22-33", "905551112233"]) {
    assert.equal(telefonNorm(ham), "905551112233", ham);
  }
  assert.equal(telefonNorm("+49 151 2345 6789"), "4915123456789");
  assert.equal(telefonNorm("123"), "");
  assert.equal(telefonNorm(""), "");
  assert.equal(telefonYaz("905551112233"), "+90 555 111 22 33");
});

test("sayı okuma: Türkçe yazım", () => {
  assert.equal(sayiOku("1.250.000"), 1250000);
  assert.equal(sayiOku("12,5"), 12.5);
  assert.equal(sayiOku(""), null);
  assert.equal(basHarfBuyut("ıŞIK İNCE"), "Işık İnce");
});

test("vCard: iPhone ve eski Android dosyaları okunur", () => {
  const vcf = [
    "BEGIN:VCARD", "VERSION:3.0", "N:Yılmaz;Ahmet;;;", "FN:Ahmet Yılmaz", "item1.TEL;type=CELL:+90 555 111 22 33", "TEL;type=HOME:0232 444 55 66",
    "ORG:Örnek İnşaat;", "NOTE:Urla'da arsa bakıyor\\, acelesi yok", "END:VCARD",
    "BEGIN:VCARD", "VERSION:2.1", "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=87elik;=C5=9E=C3=BCkr=C3=BC;;;", "TEL;CELL:05321234567", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "FN:Numarasız Kişi", "END:VCARD",
  ].join("\r\n");
  const k = vcfOku(vcf);
  assert.equal(k.length, 3);
  assert.equal(k[0].ad, "Ahmet Yılmaz");
  assert.deepEqual(k[0].telefonlar, ["+90 555 111 22 33", "0232 444 55 66"]);
  assert.equal(k[0].sirket, "Örnek İnşaat");
  assert.equal(k[0].not, "Urla'da arsa bakıyor, acelesi yok");
  assert.equal(k[1].ad, "Şükrü Çelik");
});

test("CSV: Google ve Excel (noktalı virgül) dışa aktarımları okunur", () => {
  const google = 'First Name,Last Name,Phone 1 - Label,Phone 1 - Value,Notes\nAyşe,Kaya,Mobile,+90 555 222 33 44 ::: 0532 111 00 00,"Bornova, 3+1"\n';
  const g = csvOku(google);
  assert.equal(g[0].ad, "Ayşe Kaya");
  assert.deepEqual(g[0].telefonlar, ["+90 555 222 33 44", "0532 111 00 00"]);
  assert.equal(g[0].not, "Bornova, 3+1");
  const excel = "Ad Soyad;Telefon;Not\r\nMehmet Demir;0555 333 44 55;yatırımcı\r\n;;\r\n";
  const e = csvOku(excel);
  assert.equal(e.length, 1);
  assert.equal(e[0].ad, "Mehmet Demir");
  assert.equal(dosyaOku(new TextEncoder().encode(excel), "rehber.csv")[0].telefonlar[0], "0555 333 44 55");
});

test("yükleme hazırlığı: tekrarlar birleşir, numarasızlar ayrılır, kayıtlı olanlar işaretlenir", () => {
  const h = yuklemeHazirla([
    { ad: "Ali", telefonlar: ["0555 111 22 33"] },
    { ad: "Ali Bey", telefonlar: ["+905551112233", "0532 000 11 22"] },
    { ad: "Numarasız", telefonlar: [] },
    { ad: "Veli", telefonlar: ["0544 111 22 33"] },
  ], new Map([["905441112233", "kisi-7"]]));
  assert.equal(h.satirlar.length, 2);
  assert.deepEqual(h.satirlar[0].telefonlar, ["905551112233", "905320001122"]);
  assert.equal(h.satirlar[1].kayitli_kisi_id, "kisi-7");
  assert.equal(h.ozet.numarasiz, 1);
  assert.equal(h.ozet.tekrar, 1);
});

test("TCMB: dolar satış kuru okunur; bozuk yanıtta kur yazılmaz", () => {
  const xml = '<?xml version="1.0"?><Tarih_Date Tarih="20.11.2026" Date="11/20/2026"><Currency Kod="USD" CurrencyCode="USD"><ForexBuying>42.1000</ForexBuying><ForexSelling>42.1759</ForexSelling></Currency><Currency Kod="EUR" CurrencyCode="EUR"><ForexSelling>48.9</ForexSelling></Currency></Tarih_Date>';
  assert.deepEqual(tcmbOku(xml), { kur: 42.1759, bultenTarihi: "20.11.2026" });
  assert.equal(tcmbOku("<html>bakımdayız</html>"), null);
  assert.equal(tcmbOku('<Currency Kod="USD"><ForexSelling></ForexSelling></Currency>'), null);
});

test("mesaj: hitap ve şablonlar; tam adres ve mal sahibi mesajda yer almaz", () => {
  assert.equal(hitapYaz({ ad: "ahmet yılmaz", hitap_turu: "bey", hitap_adi: "Ahmet" }), "Ahmet Bey");
  assert.equal(hitapYaz({ ad: "Ayşe Kaya", hitap_turu: "hanim" }), "Ayşe Hanım");
  assert.equal(hitapYaz({ ad: "Ali Can", hitap_turu: "ozel", hitap_ozel: "Ali Hocam" }), "Ali Hocam");
  const mulk = { kategori: "konut", alt_tur: "daire", islem: "satilik", fiyat_tutar: 6500000, fiyat_para: "TRY", ozellikler: { m2: 130, oda: "3+1" }, adres: "Gizli Sokak No 5", ada: "123", parsel: "45", baslik: "Deniz manzaralı" };
  const kullanici = { ad: "Ayşe Danışman", imza: "" };
  const a = aliciMesaji({ kisi: { ad: "Burak Alıcı", hitap_turu: "bey" }, mulk, yer: { ilce: "Karşıyaka", mahalle: "Bostanlı" }, kullanici });
  assert.match(a, /Burak Bey/);
  assert.match(a, /Karşıyaka/);
  assert.match(a, /STA Gayrimenkul/);
  assert.doesNotMatch(a, /Gizli Sokak|123|parsel/i);
  const s = saticiMesaji({ kisi: { ad: "Selim Malik", hitap_turu: "bey" }, mulk, yer: { ilce: "Karşıyaka", mahalle: "Bostanlı" }, kullanici });
  assert.match(s, /Selim Bey/);
  assert.doesNotMatch(s, /Burak|Gizli Sokak/);
  // Kayıt kişi adıyla değil firma adı ya da tarifle duruyorsa mesaj adsız başlar
  const adsiz = { ad: "Mavi Asansör", hitap_turu: "adsiz", hitap_adi: "Mavi" };
  assert.equal(hitapYaz(adsiz), "");
  assert.ok(aliciMesaji({ kisi: adsiz, mulk, yer: { ilce: "Karşıyaka", mahalle: "Bostanlı" }, kullanici }).startsWith("Merhaba,\n\nKarşıyaka"));
  assert.ok(saticiMesaji({ kisi: adsiz, mulk, yer: { ilce: "Karşıyaka", mahalle: "Bostanlı" }, kullanici: { ...kullanici, mesaj_tonu: "resmi" } }).startsWith("İyi günler,\n\n"));
  assert.ok(aliciMesaji({ kisi: { ...adsiz, dil: "en" }, mulk, yer: { ilce: "Karşıyaka", mahalle: "Bostanlı" }, kullanici }).startsWith("Hello,\n\n"));
  assert.match(claudeIstegi({ kisi: adsiz, mulk, yer: { ilce: "Karşıyaka", mahalle: "Bostanlı" }, kullanici, yon: "aliciya" }).sistem, /adsız bir selamla/);
  assert.match(claudeIstegi({ kisi: { ad: "Burak Alıcı", hitap_turu: "bey" }, mulk, yer: { ilce: "Karşıyaka", mahalle: "Bostanlı" }, kullanici, yon: "aliciya" }).sistem, /\{HITAP\} yer tutucusunu kullan/);
});
