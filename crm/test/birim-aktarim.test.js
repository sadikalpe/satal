// Toplu aktarımın birim testleri: Excel okuma ve satırların Satal kayıtlarına çevrilmesi (veritabanı gerekmez).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { xlsxOku, sayfaNesneleri } from "../src/lib/xlsx-oku.js";
import { aktarimHazirla, telefonlariAyir, konumBulucu } from "../src/lib/aktarim-hazirla.js";

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
