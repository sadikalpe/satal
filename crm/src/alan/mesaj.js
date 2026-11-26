// WhatsApp mesaj şablonları. Mesajı Satal hazırlar, danışman kendi telefonundan gönderir.
// Mesajda tam adres, ada/parsel ya da karşı tarafın bilgisi yer almaz.
import { altTurAdi, kategori } from "./kategoriler.js";
import { ilkAd, paraKisa, paraYaz, sayiYaz } from "../lib/metin.js";

// "Ahmet Bey", "Ayşe Hanım", "Ahmet Abi" …
// "adsiz": kayıt bir kişi adıyla değil firma ya da tarifle duruyor ("Mavi Asansör", "kiralık evi soran"); seslenilecek ad yoktur, boş döner.
export function hitapYaz(k) {
  if (k.hitap_turu === "adsiz") return "";
  const ad = (k.hitap_adi || "").trim() || ilkAd(k.ad);
  switch (k.hitap_turu) {
    case "bey": return ad + " Bey";
    case "hanim": return ad + " Hanım";
    case "abi": return ad + " Abi";
    case "abla": return ad + " Abla";
    case "ozel": return (k.hitap_ozel || "").trim() || ad;
    default: return ad;
  }
}
// "Merhaba Ahmet Bey," — seslenilecek ad yoksa yalnızca "Merhaba,"
export const selamYaz = (soz, hitap) => (hitap ? `${soz} ${hitap},` : `${soz},`);
export const imzaYaz = (kullanici) => (kullanici.imza || "").trim() || `${kullanici.ad}\nSTA Gayrimenkul`;

// "130 m² 3+1 daire", "2.400 m² konut imarlı arsa"
export function mulkKisaTarif(m) {
  const o = m.ozellikler || {};
  let tur = altTurAdi(m.kategori, m.alt_tur).toLocaleLowerCase("tr");
  const kalip = kategori(m.kategori)?.kalip;
  if (m.kategori === "proje") tur = o.proje_adi ? `${o.proje_adi} projesinden yer` : "yeni proje";
  else if (kalip === "arsa" && /imarlı|alanı|için|izinli/.test(tur)) tur += " arsa";
  else if (m.kategori === "devren") tur = "devren " + tur;
  const m2 = o.m2 ? sayiYaz(o.m2) + " m² " : "";
  return `${m2}${kalip === "konut" && o.oda ? o.oda + " " : ""}${tur}`;
}
const EN_TUR = { konut: "home", arsa: "plot of land", kat_karsiligi: "plot of land", is_yeri: "commercial property", devren: "business for transfer", turistik: "hospitality property", proje: "new development" };
const EN_KONUT = { daire: "apartment", villa: "villa", mustakil_ev: "detached house", rezidans: "residence apartment", yazlik: "summer house" };

// yer: { ilce, mahalle } adları
export function aliciMesaji({ kisi, mulk, yer, kullanici, fiyatDustu = false }) {
  const hitap = hitapYaz(kisi), imza = imzaYaz(kullanici), kiralik = mulk.islem === "kiralik";
  if (kisi.dil === "en") {
    const tur = (mulk.kategori === "konut" && EN_KONUT[mulk.alt_tur]) || EN_TUR[mulk.kategori] || "property";
    const o = mulk.ozellikler || {};
    const tarif = [o.m2 ? `${sayiYaz(o.m2)} m²` : "", mulk.kategori === "konut" && o.oda ? o.oda : "", tur].filter(Boolean).join(" ");
    const fiyat = mulk.fiyat_tutar != null ? ` The ${kiralik ? "monthly rent" : "price"} is ${mulk.fiyat_para === "USD" ? "$" + Math.round(mulk.fiyat_tutar).toLocaleString("en-US") : Math.round(mulk.fiyat_tutar).toLocaleString("en-US") + " TL"}.` : "";
    return `${selamYaz("Hello", hitap)}\n\nA ${tarif} ${kiralik ? "for rent " : ""}has come up in ${[yer.mahalle, yer.ilce].filter(Boolean).join(", ")}.${fiyat} Let me know if you are interested and I will send the details.\n\n${imza}`;
  }
  const sen = kisi.sen_siz === "sen", ton = kullanici.mesaj_tonu || "samimi";
  const selam = selamYaz(ton === "resmi" ? "İyi günler" : "Merhaba", hitap);
  const yerYazi = yer.mahalle ? `${yer.ilce}, ${yer.mahalle} mahallesinde` : `${yer.ilce} ilçesinde`;
  const tarif = (kiralik ? "kiralık " : "") + mulkKisaTarif(mulk);
  const fiyat = mulk.fiyat_tutar == null ? "" : fiyatDustu ? ` Fiyatı düştü; yeni ${kiralik ? "kirası" : "fiyatı"} ${paraKisa(mulk.fiyat_tutar, mulk.fiyat_para)}.` : ` ${kiralik ? "Aylık kirası" : "Fiyatı"} ${paraKisa(mulk.fiyat_tutar, mulk.fiyat_para)}.`;
  const kapanis = ton === "kisa" ? (sen ? "İlgilenir misin?" : "İlgilenir misiniz?")
    : ton === "resmi" ? (sen ? "İlgilenirsen ayrıntıları iletebilirim." : "İlgilenirseniz ayrıntıları iletmekten memnuniyet duyarım.")
    : (sen ? "İlgilenirsen ayrıntıları göndereyim." : "İlgilenirseniz ayrıntıları göndereyim.");
  const giris = fiyatDustu ? `${yerYazi} ${tarif} vardı.` : `${yerYazi} ${tarif} geldi.`;
  return `${selam}\n\n${giris}${fiyat} ${kapanis}\n\n${imza}`;
}

// Mülk sahibine: alıcı hakkında hiçbir bilgi verilmez.
export function saticiMesaji({ kisi, mulk, yer, kullanici }) {
  const hitap = hitapYaz(kisi), imza = imzaYaz(kullanici), sen = kisi.sen_siz === "sen";
  if (kisi.dil === "en") return `${selamYaz("Hello", hitap)}\n\nWe have a suitable ${mulk.islem === "kiralik" ? "tenant" : "buyer"} for your property in ${[yer.mahalle, yer.ilce].filter(Boolean).join(", ")}. Could we talk when you are available?\n\n${imza}`;
  const selam = selamYaz(kullanici.mesaj_tonu === "resmi" ? "İyi günler" : "Merhaba", hitap);
  const yerYazi = `${[yer.ilce, yer.mahalle].filter(Boolean).join(" ")} bölgesindeki`;
  const mulkAdi = sen ? "mülkün" : "mülkünüz";
  return `${selam}\n\n${yerYazi} ${mulkAdi} için uygun bir ${mulk.islem === "kiralik" ? "kiracımız" : "alıcımız"} var. ${sen ? "Müsait olduğunda görüşebilir miyiz?" : "Müsait olduğunuzda görüşebilir miyiz?"}\n\n${imza}`;
}

// Claude'a gönderilecek tarif: kişi adı, telefon, tam adres, ada/parsel içermez.
export function claudeIstegi({ kisi, mulk, yer, kullanici, yon }) {
  const o = mulk.ozellikler || {};
  const ozet = [
    `İşlem: ${mulk.islem === "kiralik" ? "kiralık" : "satılık"}`,
    `Yer: ${[yer.ilce, yer.mahalle].filter(Boolean).join(" / ")}`,
    `Mülk: ${mulkKisaTarif(mulk)}`,
    mulk.fiyat_tutar != null ? `Fiyat: ${paraYaz(mulk.fiyat_tutar, mulk.fiyat_para)}` : null,
    o.bina_yasi != null ? `Bina yaşı: ${o.bina_yasi}` : null,
    o.manzara ? `Manzara: ${o.manzara}` : null,
    mulk.acil ? "Acil satılık" : null,
  ].filter(Boolean).join("\n");
  const sistem = `Sen bir gayrimenkul danışmanının WhatsApp mesajlarını yazan yardımcısısın. Kısa (en çok 60 kelime), doğal, abartısız bir mesaj yaz. Emoji kullanma, uydurma bilgi ekleme, yalnızca verilen bilgileri kullan. Tam adres, ada/parsel ya da üçüncü kişiler hakkında bilgi yazma. ${hitapYaz(kisi) ? "Hitap için tam olarak {HITAP} yer tutucusunu kullan" : "Kişinin adı bilinmiyor: mesajı adsız bir selamla başlat (“Merhaba,” gibi), ad ya da yer tutucu yazma"}; imza yazma. Yalnızca mesaj metnini döndür.`;
  const kullaniciMetni = yon === "saticiya"
    ? `Mülk sahibine yaz: mülkü için uygun bir ${mulk.islem === "kiralik" ? "kiracı" : "alıcı"} olduğunu, görüşmek istediğimizi söyle. Alıcı hakkında bilgi verme.\nDil: ${kisi.dil === "en" ? "İngilizce" : "Türkçe"}. Hitap biçimi: ${kisi.sen_siz === "sen" ? "sen" : "siz"}. Ton: ${kullanici.mesaj_tonu}.\n\n${ozet}`
    : `Olası alıcıya yaz: aradığına uygun bir mülk geldiğini haber ver, ilgilenirse ayrıntı göndereceğini söyle.\nDil: ${kisi.dil === "en" ? "İngilizce" : "Türkçe"}. Hitap biçimi: ${kisi.sen_siz === "sen" ? "sen" : "siz"}. Ton: ${kullanici.mesaj_tonu}.\n\n${ozet}`;
  return { sistem, kullaniciMetni };
}
