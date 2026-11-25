// Toplu aktarımın birim testleri: Excel okuma ve satırların Satal kayıtlarına çevrilmesi (veritabanı gerekmez).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { xlsxOku, sayfaNesneleri } from "../src/lib/xlsx-oku.js";
import { aktarimHazirla, telefonlariAyir, konumBulucu, tarihOku } from "../src/lib/aktarim-hazirla.js";

// --- Testler için küçük bir .xlsx üretici (zip; sıkıştırmalı ve sıkıştırmasız kayıtlar) ---
function zip(dosyalar) {
  const yerel = [], merkez = [];
  let konum = 0;
  for (const [i, [ad, metin]] of Object.entries(dosyalar).entries()) {
    const veri = Buffer.from(metin, "utf8");
    const sikistir = i % 2 === 0;
    const govde = sikistir ? zlib.deflateRawSync(veri) : veri;
    const adB = Buffer.from(ad, "utf8");
    const crc = zlib.crc32(veri);
    const b = Buffer.alloc(30);
    b.writeUInt32LE(0x04034b50, 0); b.writeUInt16LE(20, 4); b.writeUInt16LE(sikistir ? 8 : 0, 8);
    b.writeUInt32LE(crc, 14); b.writeUInt32LE(govde.length, 18); b.writeUInt32LE(veri.length, 22); b.writeUInt16LE(adB.length, 26);
    yerel.push(b, adB, govde);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(sikistir ? 8 : 0, 10);
    m.writeUInt32LE(crc, 16); m.writeUInt32LE(govde.length, 20); m.writeUInt32LE(veri.length, 24); m.writeUInt16LE(adB.length, 28); m.writeUInt32LE(konum, 42);
    merkez.push(m, adB);
    konum += 30 + adB.length + govde.length;
  }
  const md = Buffer.concat(merkez);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(Object.keys(dosyalar).length, 8); son.writeUInt16LE(Object.keys(dosyalar).length, 10);
  son.writeUInt32LE(md.length, 12); son.writeUInt32LE(konum, 16);
  return Buffer.concat([...yerel, md, son]);
}
const kac = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const harf = (i) => String.fromCharCode(65 + i);
// sayfalar: { ad: [[...], ...] } — metinler paylaşılan metin, sayılar sayı hücresi olur; "!" ile başlayanlar satır içi metin.
function xlsx(sayfalar) {
  const paylasilan = [];
  const dosyalar = {};
  const adlar = Object.keys(sayfalar);
  adlar.forEach((ad, si) => {
    const satirlar = sayfalar[ad].map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = harf(ci) + (ri + 1);
      if (v === "" || v == null) return "";
      if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
      if (String(v).startsWith("!")) return `<c r="${ref}" t="inlineStr"><is><t>${kac(String(v).slice(1))}</t></is></c>`;
      paylasilan.push(v);
      return `<c r="${ref}" t="s"><v>${paylasilan.length - 1}</v></c>`;
    }).join("")}</row>`).join("");
    dosyalar[`xl/worksheets/sheet${si + 1}.xml`] = `<?xml version="1.0"?><worksheet><sheetData>${satirlar}</sheetData></worksheet>`;
  });
  dosyalar["xl/workbook.xml"] = `<workbook xmlns:r="r"><sheets>${adlar.map((ad, i) => `<sheet name="${kac(ad)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  dosyalar["xl/_rels/workbook.xml.rels"] = `<Relationships>${adlar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`;
  dosyalar["xl/sharedStrings.xml"] = `<sst>${paylasilan.map((s) => `<si><r><t>${kac(String(s).slice(0, 3))}</t></r><r><t xml:space="preserve">${kac(String(s).slice(3))}</t></r></si>`).join("")}</sst>`;
  return zip(dosyalar);
}

const KONUM = {
  iller: [{ id: 35, ad: "İzmir" }, { id: 9, ad: "Aydın" }, { id: 6, ad: "Ankara" }],
  ilceler: [{ id: 2009, il_id: 35, ad: "Gaziemir" }, { id: 1780, il_id: 35, ad: "Buca" }, { id: 1826, il_id: 35, ad: "Menderes" }, { id: 1, il_id: 6, ad: "Merkez" }, { id: 2, il_id: 9, ad: "Merkez" }],
  mahalleler: [{ id: 10, ilce_id: 1780, ad: "Yenigün" }, { id: 11, ilce_id: 1780, ad: "Kozağaç" }, { id: 12, ilce_id: 1826, ad: "Oğlananası Atatürk" }, { id: 13, ilce_id: 1826, ad: "Oğlananası Cumhuriyet" }],
};

test("xlsx okuma: paylaşılan ve satır içi metin, sayı, boş hücre, Türkçe karakter", () => {
  const buf = xlsx({ "Kişiler": [["Ad Soyad", "Telefon", "Not"], ["Şükrü Öztürk & Oğlu", "!0555 111 22 33", ""], ["Ayşe", 905551112244, "a<b"]], "İkinci": [["x"]] });
  const s = xlsxOku(buf);
  assert.deepEqual(Object.keys(s), ["Kişiler", "İkinci"]);
  assert.deepEqual(s["Kişiler"][1], ["Şükrü Öztürk & Oğlu", "0555 111 22 33"]);
  assert.equal(s["Kişiler"][2][1], 905551112244);
  assert.equal(s["Kişiler"][2][2], "a<b");
  const o = sayfaNesneleri(s["Kişiler"]);
  assert.equal(o.length, 2);
  assert.equal(o[0]["Ad Soyad"], "Şükrü Öztürk & Oğlu");
  assert.equal(o[0]._satir, 2);
  assert.throws(() => xlsxOku(Buffer.from("bu bir excel değil")), /Excel/);
});

test("telefon ayırma: birden çok numara, yabancı numara, tekrar", () => {
  assert.deepEqual(telefonlariAyir("+90 555 111 22 33", "0555 111 22 33, +49 151 2345 6789"), ["905551112233", "4915123456789"]);
  assert.deepEqual(telefonlariAyir(""), []);
});

test("konum bulucu: varsayılan il, mahalle baş harfle, bilinmeyen ilçe", () => {
  const bul = konumBulucu(KONUM);
  assert.deepEqual(bul("", "Buca", "Yenigün"), { il_id: 35, ilce_id: 1780, mahalle_id: 10, konum_notu: "" });
  assert.equal(bul("", "Menderes", "Oğlananası").mahalle_id, null, "iki mahalleye uyan ad seçilmez");
  assert.equal(bul("", "Menderes", "Oğlananası").konum_notu, "Oğlananası");
  assert.match(bul("", "Narnia", "").hata, /bulunamadı/);
  assert.match(bul("", "Merkez", "").hata, /birden çok ilde/);
  assert.equal(bul("Ankara", "Merkez", "").ilce_id, 1);
});

const KISI_BAS = ["Kişi No", "Ad Soyad", "Telefon", "Diğer telefonlar", "E-posta", "Şehir", "Şirket / Unvan", "Grup", "Yatırımcı tipi", "Hitap", "Sen / Siz", "Potansiyel (A/B/C)", "Danışman e-postası (boşsa Sadık)", "Notlar", "Kontrol", "Aktar"];
const TALEP_BAS = ["Kişi No", "Ad Soyad", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Oda", "Bütçe (en çok)", "Para", "Not yılı", "Nottan", "Aktar"];
const MULK_BAS = ["Kişi No (sahibi)", "Ad Soyad", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Oda", "Fiyat", "Para", "Nottan", "Aktar"];

test("aktarım: kişiler, talepler, mülkler ve alınmayan satırlar", () => {
  const sayfalar = xlsxOku(xlsx({
    "Kişiler": [KISI_BAS,
      ["K1", "Ahmet Bey", "+90 555 000 00 01", "0555 000 00 02", "a@ornek.test", "İzmir", "Örnek Ltd", "Alıcı / kiracı adayı", "Yatırımcı", "Bey", "Siz", "a", "", "Gaziemir'de 1+1 arıyor", "", "Evet"],
      ["K2", "Zeynep Abla", "05550000003", "", "", "", "", "Diğer", "", "Abla", "Sen", "", "diger@ornek.test", "", "", "Evet"],
      ["K3", "Aynı numara", "0555 000 00 02", "", "", "", "", "Diğer", "", "", "", "", "", "ikinci kayıt", "", "Evet"],
      ["K4", "Kurum", "0555 000 00 04", "", "", "", "", "Diğer", "", "", "", "", "", "", "", "Hayır"],
      ["K5", "Numarasız", "123", "", "", "", "", "Diğer", "", "", "", "", "", "", "", "Evet"]],
    "Talepler": [TALEP_BAS,
      ["K1", "Ahmet Bey", "Satılık", "Konut", "Daire", "", "Gaziemir", "", "1+1", "2.500.000", "TL", "", "nottan", "Evet"],
      ["K3", "Aynı numara", "Kiralık", "Arsa", "Tarla", "", "Menderes", "Oğlananası", "", "", "", "", "", "Evet"],
      ["K4", "Kurum", "Satılık", "Konut", "Daire", "", "Buca", "", "", "", "", "", "", "Evet"],
      ["K2", "Zeynep", "Satılık", "Uçak", "", "", "Buca", "", "", "", "", "", "", "Evet"],
      ["K2", "Zeynep", "Satılık", "Konut", "Daire", "", "Buca", "", "", "", "", "", "", "Hayır"]],
    "Mülkler": [MULK_BAS,
      ["K2", "Zeynep", "Satılık", "Konut", "Villa", "", "Buca", "Kozağaç", "3+1", 9500000, "TL", "bahçeli", "Evet"],
      ["", "(ofis mülkü)", "Satılık", "Arsa", "Muhtelif arsa", "İzmir", "Menderes", "", "", 1000000, "USD", "Keep", "Evet"],
      ["", "(ofis mülkü)", "Satılık", "Arsa", "Tarla", "", "Menderes", "", "", 1000000, "EUR", "euro", "Evet"],
      ["K1", "Ahmet", "Satılık", "İş yeri", "", "", "Gaziemir", "", "", "", "", "", "Evet"]],
  }));
  const p = aktarimHazirla(sayfalar, { konum: KONUM, varsayilanDanisman: "Sadik@Ornek.Test" });

  assert.equal(p.kisiler.length, 2);
  const [ahmet, zeynep] = p.kisiler;
  assert.equal(ahmet.danisman, "sadik@ornek.test");
  assert.deepEqual(ahmet.telefonlar, ["905550000001", "905550000002"]);
  assert.equal(ahmet.hitap_turu, "bey");
  assert.equal(ahmet.potansiyel, "A");
  assert.equal(ahmet.yatirimci_tipi, "yatirimci");
  assert.equal(ahmet.sirket, "Örnek Ltd");
  assert.match(ahmet.notlar, /Gaziemir'de 1\+1 arıyor/);
  assert.match(ahmet.notlar, /E-posta: a@ornek\.test · Şehir: İzmir · Grup: Alıcı/);
  assert.match(ahmet.notlar, /\[Aynı numara\] ikinci kayıt/, "aynı numaralı ikinci satırın notu birinciye eklenir");
  assert.equal(zeynep.danisman, "diger@ornek.test");
  assert.equal(zeynep.hitap_turu, "abla");
  assert.equal(zeynep.sen_siz, "sen");
  assert.doesNotMatch(zeynep.notlar, /Grup/);

  assert.equal(p.talepler.length, 2);
  const [t1, t2] = p.talepler;
  assert.equal(t1.kisi, ahmet);
  assert.deepEqual(t1.kategoriler, ["konut"]);
  assert.deepEqual(t1.alt_turler, ["konut:daire"]);
  assert.deepEqual(t1.bolgeler, [{ ilce: 2009, mahalle: null }]);
  assert.equal(t1.butce_max, 2500000);
  assert.equal(t1.butce_para, "TRY");
  assert.deepEqual(t1.kriterler, { oda: { d: ["1+1"], sart: false } });
  assert.equal(t2.kisi, ahmet, "birleştirilen kişinin numarasıyla gelen talep aynı kişiye bağlanır");
  assert.equal(t2.islem, "kiralik");
  assert.match(t2.notlar, /Mahalle: Oğlananası/);

  assert.equal(p.mulkler.length, 2);
  const [m1, m2] = p.mulkler;
  assert.equal(m1.kisi, zeynep);
  assert.equal(m1.danisman, "diger@ornek.test");
  assert.equal(m1.ofis_mulku, false);
  assert.deepEqual([m1.kategori, m1.alt_tur, m1.ilce_id, m1.mahalle_id, m1.fiyat, m1.fiyat_para], ["konut", "villa", 1780, 11, 9500000, "TRY"]);
  assert.deepEqual(m1.ozellikler, { oda: "3+1" });
  assert.equal(m2.ofis_mulku, true);
  assert.equal(m2.kisi, null);
  assert.equal(m2.danisman, "sadik@ornek.test");
  assert.equal(m2.fiyat_para, "USD");

  const neden = p.alinmayan.map((a) => `${a.sayfa}:${a.satir}:${a.neden}`);
  assert.ok(neden.some((n) => /^Kişiler:4:aynı numara 2\. satırda/.test(n)));
  assert.ok(neden.includes("Kişiler:5:Aktar: Hayır"));
  assert.ok(neden.includes("Kişiler:6:geçerli telefon numarası yok"));
  assert.ok(neden.some((n) => /^Talepler:4:.*aktarılmıyor/.test(n)), "aktarılmayan kişinin talebi alınmaz");
  assert.ok(neden.some((n) => /^Talepler:5:.*kategorisi tanınmadı/.test(n)));
  assert.ok(neden.includes("Talepler:6:Aktar: Hayır"));
  assert.ok(neden.some((n) => /^Mülkler:4:para birimi/.test(n)), "euro kabul edilmez");
  assert.ok(neden.includes("Mülkler:5:mülkte alt tür boş olamaz"));
});

test("aktarım: danışman yoksa kişi alınmaz", () => {
  const p = aktarimHazirla(xlsxOku(xlsx({ "Kişiler": [KISI_BAS, ["K1", "Ali", "05550000001", "", "", "", "", "", "", "", "", "", "", "", "", ""]] })), { konum: KONUM });
  assert.equal(p.kisiler.length, 0);
  assert.equal(p.alinmayan[0].neden, "danışman belirtilmemiş");
});

// ---------- Yeni düzen: kişi tipi ve çalışma alanı, kim tanıştırdı, geçmiş ilgiler, aranacaklar, mülkün kimden geldiği ----------
test("tarih okuma: gün, yalnızca yıl, Excel'in tarih sayısı, okunamayan", () => {
  assert.deepEqual(tarihOku("07.09.2023"), { tarih: "2023-09-07", yaklasik: false });
  assert.deepEqual(tarihOku("7/9/2023"), { tarih: "2023-09-07", yaklasik: false });
  assert.deepEqual(tarihOku("2023-09-07"), { tarih: "2023-09-07", yaklasik: false });
  assert.deepEqual(tarihOku("2021"), { tarih: "2021-01-01", yaklasik: true });
  assert.deepEqual(tarihOku(2021), { tarih: "2021-01-01", yaklasik: true }, "sayı hücresine yazılmış yıl");
  assert.deepEqual(tarihOku(45176), { tarih: "2023-09-07", yaklasik: false }, "Excel tarihi");
  assert.deepEqual(tarihOku(""), { tarih: null, yaklasik: false });
  assert.equal(tarihOku("31.02.2023").okunamadi, true, "olmayan gün");
  assert.equal(tarihOku("geçen yaz").okunamadi, true);
  assert.equal(tarihOku("1850").okunamadi, true);
});

const satir = (basliklar, o) => { for (const k of Object.keys(o)) assert.ok(basliklar.includes(k), "başlık yok: " + k); return basliklar.map((b) => o[b] ?? ""); };
const KISI2 = ["Kişi No", "Ad Soyad", "Telefon", "Diğer telefonlar", "E-posta", "Şehir", "Şirket / Unvan", "Meslek", "Grup", "Yatırımcı tipi", "Çalışma bölgeleri", "Çalışma türleri", "Alım gücü", "Alım gücü para",
  "Kim tanıştırdı / yakınlığı", "Tanıştıran Kişi No", "Hitap", "Sen / Siz", "Potansiyel (A/B/C)", "Danışman e-postası (boşsa Sadık)", "Notlar", "Kontrol", "Aktar"];
const ILGI2 = ["Kişi No", "Ad Soyad", "Tarih", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Oda", "Sonuç", "Not", "Kontrol", "Aktar", "Neden Hayır"];
const TALEP2 = ["Kişi No", "Ad Soyad", "Tarih", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Oda", "Bütçe (en çok)", "Para", "Nottan", "Aktar", "Neden Hayır"];
const ARA2 = ["Kişi No", "Ad Soyad", "Telefon", "Ne için aranacak", "Ne zaman", "Durum", "Not"];
const MULK2 = ["Kişi No (sahibi)", "Ad Soyad", "Başlık", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Ada", "Parsel", "Alan m²", "Emsal", "Oda", "Fiyat", "Para", "Durum", "Kimden geldi", "Kaynak Kişi No",
  "Not tarihi", "Nottan", "Kontrol", "Aktar", "Neden Hayır"];

function yeniKitap() {
  return xlsxOku(xlsx({
    "Okuyun": [["Bu sayfa okunmaz"]],
    "Kişiler": [KISI2,
      satir(KISI2, { "Kişi No": "K1", "Ad Soyad": "Feride Emlakçı", "Telefon": "0555 000 00 01", "Meslek": "Emlakçı" }),
      satir(KISI2, { "Kişi No": "K2", "Ad Soyad": "Nurten Hanım", "Telefon": "0555 000 00 02", "Yatırımcı tipi": "Olursa alır", "Çalışma bölgeleri": "Menderes; Aydın/Merkez; Buca/Yenigün; Narnia; Menderes", "Çalışma türleri": "Arsa; İş yeri; Uçak",
        "Alım gücü": "5 milyon", "Alım gücü para": "TL", "Kim tanıştırdı / yakınlığı": "Feride Hanım'ın müşterisi", "Tanıştıran Kişi No": "K1", "Aktar": "Evet" }),
      satir(KISI2, { "Kişi No": "K3", "Ad Soyad": "Mualla Hanım", "Telefon": "0555 000 00 03", "Çalışma bölgeleri": "Buca", "Alım gücü": 100000, "Alım gücü para": "EUR", "Tanıştıran Kişi No": "K9", "Kim tanıştırdı / yakınlığı": "komşusu" }),
      satir(KISI2, { "Kişi No": "K4", "Ad Soyad": "Başka Danışmanın Kişisi", "Telefon": "0555 000 00 04", "Tanıştıran Kişi No": "K1", "Danışman e-postası (boşsa Sadık)": "diger@ornek.test" }),
      satir(KISI2, { "Kişi No": "K5", "Ad Soyad": "Kendi Kendine", "Telefon": "0555 000 00 05", "Tanıştıran Kişi No": "K5", "Yatırımcı tipi": "Al-satçı", "Çalışma türleri": "Konut" }),
      satir(KISI2, { "Kişi No": "K6", "Ad Soyad": "Bilinmeyen Tip", "Telefon": "0555 000 00 06", "Yatırımcı tipi": "Belki" })],
    "Geçmiş ilgiler": [ILGI2,
      satir(ILGI2, { "Kişi No": "K2", "Tarih": "07.09.2023", "Satılık / Kiralık": "Satılık", "Kategori": "Arsa", "Alt tür": "Tarla", "İlçe": "Menderes", "Mahalle": "Oğlananası", "Sonuç": "İlgilendi", "Not": "Ilıca'da tarla sordu", "Aktar": "Evet" }),
      satir(ILGI2, { "Kişi No": "K2", "Tarih": 2021, "Not": "eski not" }),
      satir(ILGI2, { "Kişi No": "K2", "Tarih": "geçen yaz", "Satılık / Kiralık": "Kiralık", "Kategori": "Konut", "Alt tür": "Daire", "İlçe": "Buca", "Oda": "2+1", "Sonuç": "Bakacak", "Not": "daire baktı" }),
      satir(ILGI2, { "Kişi No": "K9", "Not": "kişisi yok" }),
      satir(ILGI2, { "Kişi No": "K1", "Not": "alınmasın", "Aktar": "Hayır", "Neden Hayır": "özel" }),
      satir(ILGI2, { "Kişi No": "K1", "Kategori": "Uçak", "Not": "tanınmayan kategori" }),
      satir(ILGI2, { "Kişi No": "K1", "İlçe": "Narnia", "Not": "tanınmayan ilçe" })],
    "Talepler": [TALEP2,
      satir(TALEP2, { "Kişi No": "K2", "Tarih": "01.10.2026", "Satılık / Kiralık": "Satılık", "Kategori": "Arsa", "İlçe": "Menderes; Buca; Menderes", "Mahalle": "Yenigün", "Bütçe (en çok)": "3 milyon", "Para": "TL", "Nottan": "yola yakın olsun", "Aktar": "Evet" }),
      satir(TALEP2, { "Kişi No": "K1", "Tarih": "2025", "Satılık / Kiralık": "Kiralık", "Kategori": "Konut", "Alt tür": "Daire", "İlçe": "Buca", "Mahalle": "Yenigün", "Oda": "2+1" })],
    "Aranacaklar": [ARA2,
      satir(ARA2, { "Kişi No": "K1", "Ad Soyad": "Feride Emlakçı", "Ne için aranacak": "Menderes'teki tarla için dönecek", "Ne zaman": "15.12.2026", "Durum": "Bekliyor" }),
      satir(ARA2, { "Kişi No": "K2", "Ad Soyad": "Nurten Hanım", "Ne için aranacak": "Fiyat sorulacak", "Durum": "Bekliyor" }),
      satir(ARA2, { "Kişi No": "K2", "Ad Soyad": "Nurten Hanım", "Ne için aranacak": "Tapu günü", "Durum": "Arandı" }),
      satir(ARA2, { "Ad Soyad": "Rehberde Olmayan", "Telefon": "0555 999 99 99", "Ne için aranacak": "Numarası yok" })],
    "Mülkler": [MULK2,
      satir(MULK2, { "Ad Soyad": "(ofis mülkü)", "Başlık": "Ilıca depo arkası", "Satılık / Kiralık": "Satılık", "Kategori": "Arsa", "Alt tür": "Tarla", "İlçe": "Menderes", "Ada": "1234", "Parsel": 9, "Alan m²": 12500, "Emsal": 0.3, "Para": "TL",
        "Durum": "Satışta", "Kimden geldi": "Feride emlakçı", "Kaynak Kişi No": "K1", "Not tarihi": "05.03.2026", "Nottan": "yola cephe", "Aktar": "Evet" }),
      satir(MULK2, { "Kişi No (sahibi)": "K2", "Ad Soyad": "Nurten Hanım", "Satılık / Kiralık": "Kiralık", "Kategori": "Konut", "Alt tür": "Daire", "İlçe": "Buca", "Mahalle": "Kozağaç", "Alan m²": 120, "Oda": "3+1", "Fiyat": 25000, "Para": "TL",
        "Durum": "Arşiv", "Kimden geldi": "eski ilan", "Kaynak Kişi No": "K9", "Not tarihi": "2024", "Nottan": "eski ilan" }),
      satir(MULK2, { "Satılık / Kiralık": "Satılık", "Kategori": "Arsa", "Alt tür": "Muhtelif arsa", "İlçe": "Menderes", "Emsal": 1.5, "Fiyat": 400000, "Para": "USD", "Durum": "Satıldı" }),
      satir(MULK2, { "Satılık / Kiralık": "Satılık", "Kategori": "Arsa", "Alt tür": "Tarla", "İlçe": "Menderes", "Durum": "Belirsiz" })],
    "Ofis grubu": [["Tarih", "Kim", "Kişi No", "Yer / Arayış / Sonuç"], ["01.01.2026", "Bir danışman", "", "Bu sayfa aktarılmaz"]],
  }));
}

test("aktarım (yeni düzen): kişi tipi, çalışma alanı, alım gücü ve kim tanıştırdı", () => {
  const p = aktarimHazirla(yeniKitap(), { konum: KONUM, varsayilanDanisman: "sadik@ornek.test" });
  assert.equal(p.kisiler.length, 6);
  const [feride, nurten, mualla, baska, kendi, belki] = p.kisiler;
  assert.equal(feride.meslek, "Emlakçı");
  assert.equal(feride.yatirimci_tipi, null);
  assert.equal(nurten.yatirimci_tipi, "olursa_alir");
  assert.deepEqual(nurten.calisma_bolgeleri, [{ ilce: 1826, mahalle: null }, { ilce: 2, mahalle: null }, { ilce: 1780, mahalle: 10 }], "ilçe · il/ilçe · ilçe/mahalle; tekrar ve tanınmayan atılır");
  assert.deepEqual(nurten.calisma_kategorileri, ["arsa", "is_yeri"]);
  assert.deepEqual(nurten.alim_gucu, { tutar: 5000000, para: "TRY" });
  assert.equal(nurten.referans, feride);
  assert.equal(nurten.referans_notu, "Feride Hanım'ın müşterisi");
  assert.equal(mualla.alim_gucu, null, "para birimi tanınmayan alım gücü yazılmaz");
  assert.deepEqual(mualla.calisma_bolgeleri, [], "tipi olmayan kişide çalışma alanı tutulmaz");
  assert.equal(mualla.referans, null);
  assert.equal(mualla.referans_notu, "komşusu", "tanıştıran bulunamasa da not kalır");
  assert.equal(baska.referans, null, "başka danışmanın kişisine bağlanmaz");
  assert.equal(kendi.referans, null);
  assert.equal(kendi.yatirimci_tipi, "al_satci");
  assert.deepEqual(kendi.calisma_kategorileri, ["konut"]);
  assert.equal(belki.yatirimci_tipi, null);
  const uyari = p.uyarilar.map((u) => `${u.sayfa}:${u.satir}:${u.neden}`);
  for (const beklenen of [/^Kişiler:3:çalışma bölgesi “Narnia” tanınmadı/, /^Kişiler:3:çalışma türü “Uçak” tanınmadı/, /^Kişiler:4:alım gücünün para birimi “EUR” tanınmadı/, /^Kişiler:4:çalışma bölgesi ya da türü yazılmış ama yatırımcı tipi boş/,
    /^Kişiler:4:tanıştıran “K9” Kişiler sayfasında yok/, /^Kişiler:5:tanıştıran başka bir danışmanın rehberinde/, /^Kişiler:6:tanıştıran olarak kişinin kendisi/, /^Kişiler:7:yatırımcı tipi “Belki” tanınmadı/]) {
    assert.ok(uyari.some((u) => beklenen.test(u)), String(beklenen) + "\n" + uyari.join("\n"));
  }
});

test("aktarım (yeni düzen): geçmiş ilgiler, çok ilçeli talep ve aranacaklar", () => {
  const p = aktarimHazirla(yeniKitap(), { konum: KONUM, varsayilanDanisman: "sadik@ornek.test" });
  const [feride, nurten] = p.kisiler;
  assert.equal(p.ilgiler.length, 3);
  const [g1, g2, g3] = p.ilgiler;
  assert.deepEqual({ ...g1, kisi: null, satir: 0 }, { satir: 0, kisi: null, tarih: "2023-09-07", tarih_yaklasik: false, islem: "satilik", kategori: "arsa", alt_tur: "tarla", ilce_id: 1826, mahalle_id: null, sonuc: "ilgilendi",
    notu: "Ilıca'da tarla sordu\nMahalle: Oğlananası", kontrol_notu: "" });
  assert.equal(g1.kisi, nurten);
  assert.deepEqual([g2.tarih, g2.tarih_yaklasik, g2.islem, g2.kategori, g2.ilce_id, g2.notu], ["2021-01-01", true, null, null, null, "eski not"], "yalnızca yılı bilinen ilgi");
  assert.deepEqual([g3.tarih, g3.tarih_yaklasik, g3.islem, g3.kategori, g3.alt_tur, g3.ilce_id, g3.sonuc, g3.notu], [null, false, "kiralik", "konut", "daire", 1780, null, "daire baktı\nOda: 2+1"], "tarihi okunamayan ilgi tarihsiz girer");

  assert.equal(p.talepler.length, 2);
  const [t1, t2] = p.talepler;
  assert.deepEqual(t1.bolgeler, [{ ilce: 1826, mahalle: null }, { ilce: 1780, mahalle: null }], "birden çok ilçe; tekrar atılır");
  assert.equal(t1.notlar, "yola yakın olsun\nMahalle: Yenigün", "çok ilçeli talepte mahalle nota düşer");
  assert.equal(t1.tarih, "2026-10-01");
  assert.deepEqual(t1.alt_turler, []);
  assert.equal(t1.butce_max, 3000000);
  assert.deepEqual(t2.bolgeler, [{ ilce: 1780, mahalle: 10 }]);
  assert.equal(t2.tarih, null, "yalnızca yıl yazılı talep tarihi kullanılmaz");
  assert.equal(t2.kisi, feride);

  assert.equal(p.aranacaklar.length, 2);
  assert.deepEqual([p.aranacaklar[0].kisi, p.aranacaklar[0].tarih, p.aranacaklar[0].notu], [feride, "2026-12-15", "Menderes'teki tarla için dönecek"]);
  assert.deepEqual([p.aranacaklar[1].kisi, p.aranacaklar[1].tarih, p.aranacaklar[1].notu], [nurten, null, "Fiyat sorulacak"]);

  const neden = p.alinmayan.map((a) => `${a.sayfa}:${a.satir}:${a.neden}`);
  for (const beklenen of [/^Geçmiş ilgiler:5:“K9” numaralı kişi/, /^Geçmiş ilgiler:6:Aktar: Hayır/, /^Geçmiş ilgiler:7:“Uçak” kategorisi tanınmadı/, /^Geçmiş ilgiler:8:“Narnia” adında ilçe bulunamadı/,
    /^Aranacaklar:4:Durum: Arandı/, /^Aranacaklar:5:Kişi No boş/]) assert.ok(neden.some((n) => beklenen.test(n)), String(beklenen) + "\n" + neden.join("\n"));
  const uyari = p.uyarilar.map((u) => `${u.sayfa}:${u.satir}:${u.neden}`);
  assert.ok(uyari.some((u) => /^Geçmiş ilgiler:4:sonuç “Bakacak” tanınmadı/.test(u)));
  assert.ok(uyari.some((u) => /^Geçmiş ilgiler:4:tarih “geçen yaz” okunamadı/.test(u)));
  assert.equal(p.alinmayan.filter((a) => /Okuyun|Ofis grubu/.test(a.sayfa)).length, 0, "öbür sayfalar hiç okunmaz");
});

test("aktarım (yeni düzen): mülkün durumu, ada / parsel, özellikleri, kimden geldiği ve tarihi", () => {
  const p = aktarimHazirla(yeniKitap(), { konum: KONUM, varsayilanDanisman: "sadik@ornek.test" });
  const [feride, nurten] = p.kisiler;
  assert.equal(p.mulkler.length, 3);
  const [m1, m2, m3] = p.mulkler;
  assert.deepEqual([m1.ofis_mulku, m1.kisi, m1.baslik, m1.ada, m1.parsel, m1.durum, m1.fiyat, m1.fiyat_para, m1.tarih], [true, null, "Ilıca depo arkası", "1234", "9", "aktif", null, "TRY", "2026-03-05"]);
  assert.deepEqual(m1.ozellikler, { m2: 12500 });
  assert.equal(m1.notlar, "yola cephe\nEmsal: 0.3", "tarlada emsal alanı yok: bilgi nota eklenir");
  assert.equal(m1.kaynak, feride);
  assert.equal(m1.kaynak_notu, "Feride emlakçı");
  assert.deepEqual([m2.ofis_mulku, m2.kisi, m2.islem, m2.durum, m2.mahalle_id, m2.fiyat, m2.tarih, m2.kaynak, m2.kaynak_notu], [false, nurten, "kiralik", "pasif", 11, 25000, "2024-01-01", null, "eski ilan"]);
  assert.deepEqual(m2.ozellikler, { oda: "3+1", m2: 120 });
  assert.deepEqual([m3.durum, m3.fiyat, m3.fiyat_para, m3.tarih], ["satildi", 400000, "USD", null]);
  assert.deepEqual(m3.ozellikler, { emsal: 1.5 });
  assert.ok(p.alinmayan.some((a) => a.sayfa === "Mülkler" && a.satir === 5 && /durum “Belirsiz” tanınmadı/.test(a.neden)));
  assert.ok(p.uyarilar.some((u) => u.sayfa === "Mülkler" && u.satir === 3 && /getiren “K9”/.test(u.neden)));
});

test("aktarım (kontrol listesi): “Kontrol” sütunu teyit notu olur; “Tanıştıran durumu” ve “Getiren durumu” yalnızca adla yazılmış kişi için geçerlidir", () => {
  const KISI3 = [...KISI2, "Tanıştıran durumu"], MULK3 = [...MULK2, "Getiren durumu"];
  const mulk = (o) => satir(MULK3, { "Satılık / Kiralık": "Satılık", "Kategori": "Arsa", "Alt tür": "Tarla", "İlçe": "Menderes", "Para": "TL", "Durum": "Satışta", ...o });
  const p = aktarimHazirla(xlsxOku(xlsx({
    "Kişiler": [KISI3,
      satir(KISI3, { "Kişi No": "K1", "Ad Soyad": "Feride Emlakçı", "Telefon": "0555 000 00 01", "Kontrol": "Ad  tam okunamadı;\ndüzeltin" }),
      satir(KISI3, { "Kişi No": "K2", "Ad Soyad": "Adıyla Tanıştırılan", "Telefon": "0555 000 00 02", "Kim tanıştırdı / yakınlığı": "Mualla Hanım", "Tanıştıran durumu": "Bilinmiyor" }),
      satir(KISI3, { "Kişi No": "K3", "Ad Soyad": "Bağlı Tanıştırılan", "Telefon": "0555 000 00 03", "Kim tanıştırdı / yakınlığı": "Feride Hanım", "Tanıştıran Kişi No": "K1", "Tanıştıran durumu": "Rehberde yok" }),
      satir(KISI3, { "Kişi No": "K4", "Ad Soyad": "Notsuz", "Telefon": "0555 000 00 04", "Tanıştıran durumu": "Rehberde yok" }),
      satir(KISI3, { "Kişi No": "K5", "Ad Soyad": "Tanınmayan Yanıt", "Telefon": "0555 000 00 05", "Kim tanıştırdı / yakınlığı": "Nurten Hanım", "Tanıştıran durumu": "Belki" }),
      satir(KISI3, { "Kişi No": "K6", "Ad Soyad": "Yanıtsız", "Telefon": "0555 000 00 06", "Kim tanıştırdı / yakınlığı": "Nurten Hanım" }),
      satir(KISI3, { "Kişi No": "K7", "Ad Soyad": "Rehberde Olmayanla Gelen", "Telefon": "0555 000 00 07", "Kim tanıştırdı / yakınlığı": "ilan sitesi", "Tanıştıran durumu": "rehberde yok" })],
    "Geçmiş ilgiler": [ILGI2,
      satir(ILGI2, { "Kişi No": "K1", "Kategori": "Arsa", "İlçe": "Menderes", "Not": "tarla sordu", "Kontrol": "İlçe varsayıldı: Menderes" }),
      satir(ILGI2, { "Kişi No": "K1", "Not": "varsayımsız" })],
    "Mülkler": [MULK3,
      mulk({ "Başlık": "Adıyla gelen", "Kimden geldi": "Mualla Hanım", "Getiren durumu": "Hatırlamıyorum", "Kontrol": "İlçe varsayıldı: Menderes" }),
      mulk({ "Başlık": "Bağlı gelen", "Kimden geldi": "Feride Hanım", "Kaynak Kişi No": "K1", "Getiren durumu": "Bilinmiyor" }),
      mulk({ "Başlık": "Rehberde olmayan", "Kimden geldi": "sahibinden ilan", "Getiren durumu": "Rehberde yok" }),
      mulk({ "Başlık": "Yanıtsız", "Kimden geldi": "Nurten Hanım" }),
      mulk({ "Başlık": "Getireni yazılmamış", "Getiren durumu": "Bilinmiyor" }),
      mulk({ "Başlık": "Tanınmayan yanıt", "Kimden geldi": "Nurten Hanım", "Getiren durumu": "sonra" })],
  })), { konum: KONUM, varsayilanDanisman: "sadik@ornek.test" });
  assert.deepEqual(p.kisiler.map((k) => [k.no, k.referans_durumu, k.kontrol_notu]), [["K1", null, "Ad tam okunamadı; düzeltin"], ["K2", "bilinmiyor", ""], ["K3", null, ""], ["K4", null, ""], ["K5", null, ""], ["K6", null, ""], ["K7", "rehberde_yok", ""]],
    "rehberdeki kişiye bağlanan ya da notu olmayan kayıtta yanıt yok sayılır");
  assert.equal(p.kisiler[2].referans, p.kisiler[0]);
  assert.deepEqual(p.ilgiler.map((g) => g.kontrol_notu), ["İlçe varsayıldı: Menderes", ""]);
  assert.deepEqual(p.mulkler.map((m) => [m.baslik, m.kaynak_durumu, m.kontrol_notu]), [["Adıyla gelen", "bilinmiyor", "İlçe varsayıldı: Menderes"], ["Bağlı gelen", null, ""], ["Rehberde olmayan", "rehberde_yok", ""], ["Yanıtsız", null, ""],
    ["Getireni yazılmamış", null, ""], ["Tanınmayan yanıt", null, ""]]);
  const uyari = p.uyarilar.map((u) => `${u.sayfa}:${u.satir}:${u.neden}`);
  assert.deepEqual(uyari, ["Kişiler:6:“Tanıştıran durumu” sütunundaki “Belki” tanınmadı (Rehberde yok ya da Bilinmiyor yazın); boş bırakıldı",
    "Mülkler:7:“Getiren durumu” sütunundaki “sonra” tanınmadı (Rehberde yok ya da Bilinmiyor yazın); boş bırakıldı"]);
  // Eski düzen kitapta (bu sütunlar yok) hiçbir şey değişmez
  const eski = aktarimHazirla(yeniKitap(), { konum: KONUM, varsayilanDanisman: "sadik@ornek.test" });
  assert.ok(eski.kisiler.every((k) => k.referans_durumu === null && k.kontrol_notu === "") && eski.mulkler.every((m) => m.kaynak_durumu === null && m.kontrol_notu === ""));
});
