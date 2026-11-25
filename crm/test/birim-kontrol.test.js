// Kontrol listesinin birim testleri: nottan ad çıkarma, aynı ada ait notları öbekleme, rehberden aday önerme (veritabanı gerekmez).
import test from "node:test";
import assert from "node:assert/strict";
import { adAnahtari, adYaz, obekle, adaylariBul, BAG_DURUMU } from "../src/alan/kontrol.js";

test("ad anahtarı: unvan, ek, ayraç içi açıklama ve yakınlık sözleri atılır; aynı kişiye ait notlar aynı anahtara düşer", () => {
  for (const notu of ["Feride Hanım", "feride hanım üzerinden", "Feride’nin arkadaşı", "FERİDE HANIM'IN (emlakçı) yeğeni", "Feride Hanım tavsiye etti"]) assert.equal(adAnahtari(notu), "feride", notu);
  assert.equal(adAnahtari("Mualla Deneme Hanım"), "mualla deneme");
  assert.equal(adAnahtari("Nurten abla ile Mualla teyze"), "nurten mualla");
  assert.equal(adAnahtari("Dr. Nurten Hanım'ın kardeşi Mualla, Ilıca'dan"), "dr nurten mualla", "en çok üç sözcük");
  // Telefonda kesme imi çoğu kez yazılmaz: ek almış unvan da addan sayılmaz
  for (const notu of ["Feride hanımın yeğeni", "feride hanımdan", "Feride Hanımla geldi", "Feride ablaya gönderdi", "Feride Hanım'dan yer aldı", "Feride'nin iş ortağı"]) assert.equal(adAnahtari(notu), "feride", notu);
  assert.equal(adAnahtari("Zühtü abinin arkadaşı"), "zuhtu");
  assert.equal(adAnahtari("Zühtü beyin müşterisi"), "zuhtu");
  assert.equal(adAnahtari("Dedeoğlu Usta"), "dedeoglu", "unvanla başlayan ad bozulmaz");
  // Ad çıkmayan not kendi anahtarıyla kalır: başka notlarla aynı öbeğe düşmez
  assert.equal(adAnahtari("komşusu"), "komsusu");
  assert.equal(adAnahtari("eski ilan"), "eski ilan");
  assert.equal(adAnahtari(""), "");
  assert.equal(adAnahtari(null), "");
});

test("öbek başlığı: nottaki ad yazıldığı biçimde, ardından geliyorsa unvanıyla; bağlantı ve yakınlık sözleri başlığa girmez", () => {
  for (const [notu, ad] of [["Feride Hanım", "Feride Hanım"], ["Feride Hanım üzerinden", "Feride Hanım"], ["FERİDE HANIM'IN (emlakçı) yeğeni", "FERİDE HANIM"], ["Feride’nin arkadaşı", "Feride"],
    ["Feride yönlendirdi", "Feride"], ["Zühtü abinin arkadaşı", "Zühtü abi"], ["Zühtü Bey (emlakçı) verdi", "Zühtü Bey"], ["Mualla Deneme Hanım'ın kiracısı", "Mualla Deneme Hanım"],
    ["Nurten tanıyor; irtibat Nurten üzerinden", "Nurten"], ["Nurten abla ile Mualla teyze", "Nurten abla Mualla teyze"]]) assert.equal(adYaz(notu), ad, notu);
  // Ad çıkmayan not olduğu gibi kalır
  for (const notu of ["komşusu", "eski ilan", "sahibinden ilan", ""]) assert.equal(adYaz(notu), notu);
});

test("öbekleme: en çok kayıtlı öbek üstte; başlık adın en sık yazılan biçimi, eşitlikte en kısası", () => {
  const o = obekle([{ id: 1, notu: "Feride Hanım üzerinden" }, { id: 2, notu: "Nurten Hanım" }, { id: 3, notu: "Feride Hanım" }, { id: 4, notu: "mualla hanım" }, { id: 5, notu: "Feride Hanım" }, { id: 6, notu: "Mualla" }]);
  assert.deepEqual(o.map((x) => [x.anahtar, x.baslik, x.kayitlar.map((k) => k.id)]), [["feride", "Feride Hanım", [1, 3, 5]], ["mualla", "Mualla", [4, 6]], ["nurten", "Nurten Hanım", [2]]]);
  // "Nurten üzerinden" iki kez yazılmış olsa da başlık addır; bağlantı sözü başlığa girmez
  assert.deepEqual(obekle([{ notu: "Nurten üzerinden" }, { notu: "Nurten üzerinden" }, { notu: "Nurten Hanım'ın yeğeni" }]).map((x) => [x.anahtar, x.baslik]), [["nurten", "Nurten"]]);
  assert.deepEqual(obekle([]), []);
});

test("aday önerme: anahtardaki her sözcük adında tam sözcük olarak geçmeli; kısa ad üstte; sınır uygulanır", () => {
  const rehber = [{ id: 1, ad: "Feride Emlakçı" }, { id: 2, ad: "Halil Kurgu" }, { id: 3, ad: "Ali Deneme" }, { id: 4, ad: "Feride Deneme Kurgu" }, { id: 5, ad: "Feriha Hanım" }, { id: 6, ad: "FERİDE" }, { id: 7, ad: "Ali-Kurgu Bey" }];
  const adlar = (anahtar, sinir) => adaylariBul(rehber, anahtar, sinir).map((k) => k.ad);
  assert.deepEqual(adlar("feride"), ["FERİDE", "Feride Emlakçı", "Feride Deneme Kurgu"], "“Feriha” önerilmez; büyük-küçük harf ve Türkçe harf fark etmez");
  assert.deepEqual(adlar("ali"), ["Ali Deneme", "Ali-Kurgu Bey"], "“Halil” önerilmez");
  assert.deepEqual(adlar("feride kurgu"), ["Feride Deneme Kurgu"]);
  assert.deepEqual(adlar("feride", 2), ["FERİDE", "Feride Emlakçı"]);
  assert.deepEqual(adlar(""), []);
  assert.deepEqual(adlar("a"), [], "tek harf aranmaz");
  assert.deepEqual(Object.keys(BAG_DURUMU), ["rehberde_yok", "bilinmiyor"]);
});
