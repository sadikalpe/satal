// Eşleştirme motoru: bir talep ile bir mülkü karşılaştırır. Veritabanından ve arayüzden bağımsızdır.
// Kural (karar 23.11.2026): önce ele, sonra puanla. Fiyat ve ana kategori puan vermez, yalnızca eler.
// Puan: konum 45 · özellikler 40 · alt tür 15 (oturum alıcısı). 80+ A · 60–79 B · 40–59 C · altı listelenmez.
import { kategori, kalip, turYakinligi, aliciTipi, PROJE_KARSILIGI, turdenImar, altTurAdi } from "./kategoriler.js";

export const VARSAYILAN_AYAR = {
  agirliklar: {
    oturum: { alt_tur: 15, konum: 45, ozellik: 40 },
    ticari: { alt_tur: 15, konum: 35, ozellik: 50 },
  },
  // Konum basamakları, konum puanı 45 iken alınan puanlar; başka ağırlıkta aynı oranla ölçeklenir.
  konum_basamak: { tam: 45, komsu_mahalle: 32, ayni_ilce: 18, komsu_ilce: 7 },
  butce_payi: 10, // bütçeyi en çok yüzde kaç aşan mülk gösterilir
  sinir_a: 80, sinir_b: 60, sinir_c: 40,
  gunluk_mesaj_siniri: 20,
  talep_teyit_ay: 3,
  aranmayan_gun: 60,
};

const sayi = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
export function usd(tutar, para, kur) {
  const t = sayi(tutar);
  if (t == null) return null;
  if (para === "USD") return t;
  return kur > 0 ? t / kur : null;
}

// ---------- Konum ----------
// konum: { ilceKomsu(a, b), mahalleKomsu(a, b) }
export function konumDegerlendir(talep, mulk, konum, yerOnemsiz) {
  const bolgeler = talep.bolgeler || [];
  if (yerOnemsiz || !bolgeler.length) return { belirtilmedi: true };
  if (!mulk.ilce_id) return { eksik: true };
  let en = null; // tam > komsu_mahalle > ayni_ilce > komsu_ilce
  const sira = { tam: 4, komsu_mahalle: 3, ayni_ilce: 2, komsu_ilce: 1 };
  let mahalleEksik = false;
  for (const b of bolgeler) {
    let s = null;
    if (!b.mahalle) {
      if (mulk.ilce_id === b.ilce) s = "tam";
      else if (konum.ilceKomsu(mulk.ilce_id, b.ilce)) s = "komsu_ilce";
    } else if (mulk.mahalle_id && mulk.mahalle_id === b.mahalle) s = "tam";
    else if (mulk.mahalle_id && konum.mahalleKomsu(mulk.mahalle_id, b.mahalle)) s = "komsu_mahalle";
    else if (mulk.ilce_id === b.ilce) { s = "ayni_ilce"; if (!mulk.mahalle_id) mahalleEksik = true; }
    else if (konum.ilceKomsu(mulk.ilce_id, b.ilce)) s = "komsu_ilce";
    if (s && (!en || sira[s] > sira[en])) en = s;
  }
  if (!en) return { elendi: true };
  if (talep.sadece_bu_bolgeler && en !== "tam") return { elendi: true };
  return { basamak: en, mahalleEksik: mahalleEksik && en === "ayni_ilce" };
}
const KONUM_METNI = { tam: "istenen bölgede", komsu_mahalle: "komşu mahallede", ayni_ilce: "aynı ilçede, başka mahallede", komsu_ilce: "komşu ilçede" };

// ---------- Özellik ölçütleri ----------
const odaSayisi = (v) => { const m = /^(\d+)/.exec(String(v)); return m ? Number(m[1]) : null; };
function odaUyumu(istenen, mulkDegeri) {
  const m = Array.isArray(mulkDegeri) ? mulkDegeri : [mulkDegeri];
  let en = 0;
  for (const v of m) {
    if (istenen.includes(v)) return 1;
    const o = odaSayisi(v);
    if (o == null) continue;
    for (const i of istenen) {
      const io = odaSayisi(i);
      if (io == null) continue;
      const fark = o - io;
      const r = fark === 0 ? 0.7 : fark === 1 ? 0.7 : fark === -1 ? 0.4 : 0;
      if (r > en) en = r;
    }
  }
  return en;
}
// Sayı aralığı: içindeyse tam, aralığın %10 dışına kadar yarım puan.
function aralikUyumu(min, max, v) {
  const [a, b] = Array.isArray(v) ? v : [v, v];
  const lo = min ?? -Infinity, hi = max ?? Infinity;
  if (b >= lo && a <= hi) return 1;
  if (b < lo) return b >= lo * 0.9 ? 0.5 : 0;
  return a <= hi * 1.1 ? 0.5 : 0;
}
function mulkDegeri(mulk, anahtar, proje) {
  const o = mulk.ozellikler || {};
  if (proje) {
    if (anahtar === "oda") return Array.isArray(o.oda_tipleri) && o.oda_tipleri.length ? o.oda_tipleri : null;
    if (anahtar === "m2") { const a = sayi(o.m2_min), b = sayi(o.m2_max); return a == null && b == null ? null : [a ?? b, b ?? a]; }
  }
  if (anahtar === "imar_durumu") return o.imar_durumu || turdenImar(mulk.alt_tur);
  const v = o[anahtar];
  return v == null || v === "" ? null : v;
}
// → 0..1 ya da null (mülkte bilgi yok)
function olcutUyumu(olcut, istek, mulk, proje) {
  const v = mulkDegeri(mulk, olcut.anahtar, proje);
  if (v == null) return null;
  const d = istek.d;
  switch (olcut.tip) {
    case "coklu": {
      const liste = Array.isArray(d) ? d : [d];
      if (olcut.anahtar === "oda") return odaUyumu(liste, v);
      return (Array.isArray(v) ? v : [v]).some((x) => liste.includes(x)) ? 1 : 0;
    }
    case "aralik": return aralikUyumu(sayi(d?.min), sayi(d?.max), Array.isArray(v) ? v.map(Number) : Number(v));
    case "en_az": return aralikUyumu(sayi(d), null, Number(v));
    case "en_cok": return aralikUyumu(null, sayi(d), Number(v));
    case "evet": return v === true || v === "evet" ? 1 : 0;
    default: return null;
  }
}
const istekVar = (i) => i && i.d != null && i.d !== "" && !(Array.isArray(i.d) && !i.d.length)
  && !(typeof i.d === "object" && !Array.isArray(i.d) && i.d.min == null && i.d.max == null);

// ---------- Ana işlev ----------
// talep.kisi: { alim_gucu_usd } — talepte bütçe yoksa kişinin tahmini alım gücü kullanılır.
// Dönen değer: null (elendi) ya da { puan, sinif, puansiz, tavan_b, para_bilinmiyor, parcalar, nedenler, notlar, tahmin }
export function eslestir(talep, mulk, { kur, ayarlar = VARSAYILAN_AYAR, konum }) {
  if (talep.islem !== mulk.islem) return null;
  if (mulk.durum === "satildi" || mulk.durum === "pasif") return null;

  // 1) Ana kategori (ön şart). Proje, karşılık geldiği kategorinin talebiyle eşleşir.
  const proje = mulk.kategori === "proje";
  let kat = mulk.kategori;
  if (proje) {
    kat = (PROJE_KARSILIGI[mulk.alt_tur] || []).find((k) => talep.kategoriler.includes(k));
    if (!kat) return null;
  } else if (!talep.kategoriler.includes(kat)) return null;
  const katTanim = kategori(kat);
  const tip = aliciTipi(talep.alici_tipi);
  const nedenler = [], notlar = [];
  let tavanB = false;

  // 2) Bütçe (ön şart): üst sınırı payı kadar aşan çıkar ama en fazla B olur; daha fazlası elenir.
  const fiyat = usd(mulk.fiyat_tutar, mulk.fiyat_para, kur);
  const ust = sayi(talep.butce_max_usd) ?? sayi(talep.kisi?.alim_gucu_usd);
  const alt = sayi(talep.butce_min_usd);
  const pay = (ayarlar.butce_payi ?? 10) / 100;
  let paraBilinmiyor = false;
  const butce = { durum: "icinde" };
  if (fiyat == null) { butce.durum = "fiyat_yok"; notlar.push({ tur: "teyit", metin: "Mülkün fiyatı girilmemiş, teyit et" }); tavanB = true; }
  else if (ust == null) { paraBilinmiyor = true; butce.durum = "bilinmiyor"; }
  else if (fiyat > ust * (1 + pay) + 1e-9) return null;
  else if (fiyat > ust + 1e-9) {
    butce.durum = "ustunde"; butce.yuzde = Math.round(((fiyat - ust) / ust) * 100) || 1;
    notlar.push({ tur: "butce", metin: `Bütçenin %${butce.yuzde} üstünde` }); tavanB = true;
  } else if (alt != null && fiyat < alt) { butce.durum = "altinda"; notlar.push({ tur: "bilgi", metin: "Bütçesinin altında" }); }
  if (butce.durum === "icinde") nedenler.push("bütçe içinde");

  // 3) Alt tür grubu (ön şart): grup dışı çıkmaz; aynı gruptaki yakın tür çıkar, en fazla B olur.
  const istenenTurler = (talep.alt_turler || []).filter((x) => x.startsWith(kat + ":")).map((x) => x.slice(kat.length + 1));
  const mulkTuru = proje ? (kat === "konut" ? "daire" : "ofis") : mulk.alt_tur;
  const yakinlik = turYakinligi(kat, istenenTurler, mulkTuru);
  const turSarti = talep.kriterler?._tur_sart !== false;
  let turOran = null;
  if (yakinlik === "ayni") turOran = 1;
  else if (yakinlik === "yakin") { turOran = 0.5; tavanB = true; notlar.push({ tur: "tur", metin: `Yakın tür: ${altTurAdi(mulk.kategori, mulk.alt_tur)}` }); }
  else if (yakinlik === "uzak") {
    if (katTanim.turSartiVarsayilan && !turSarti) { turOran = 0; tavanB = true; notlar.push({ tur: "tur", metin: `Farklı tür: ${altTurAdi(mulk.kategori, mulk.alt_tur)}` }); }
    else return null;
  }
  if (proje) notlar.push({ tur: "bilgi", metin: "Proje" });

  // 4) Konum dış sınırı (ön şart): komşu ilçeden uzaktaki çıkmaz.
  const k = konumDegerlendir(talep, mulk, konum, !!tip.yerOnemsiz);
  if (k.elendi) return null;
  let konumOran = null;
  if (k.eksik) { notlar.push({ tur: "teyit", metin: "Mülkün ilçesi girilmemiş, teyit et" }); tavanB = true; }
  else if (!k.belirtilmedi) {
    const bas = ayarlar.konum_basamak || VARSAYILAN_AYAR.konum_basamak;
    konumOran = (bas[k.basamak] ?? 0) / (bas.tam || 45);
    nedenler.push(KONUM_METNI[k.basamak]);
    if (k.mahalleEksik) notlar.push({ tur: "eksik", metin: "Mülkün mahallesi girilmemiş" });
  }

  // 5) Olmazsa olmazlar ve özellik puanı.
  const istekler = talep.kriterler || {};
  const kalemler = [];
  let toplamAgirlik = 0, toplamPuan = 0;
  for (const kalem of kalip(kat)) {
    let sayilan = 0, toplam = 0, belirtilen = 0;
    for (const olcut of kalem.olcutler) {
      const istek = istekler[olcut.anahtar];
      if (!istekVar(istek)) continue;
      belirtilen++;
      const r = olcutUyumu(olcut, istek, mulk, proje);
      const ad = olcut.kisa || olcut.ad.toLocaleLowerCase("tr");
      if (r == null) {
        if (istek.sart) { tavanB = true; notlar.push({ tur: "teyit", metin: `Teyit et: ${ad}` }); }
        else notlar.push({ tur: "eksik", metin: `Bilgi eksik: ${ad}` });
        continue;
      }
      if (istek.sart && r < 1) return null;
      sayilan++; toplam += r;
      if (r === 1) {
        if (olcut.anahtar === "oda") nedenler.push(proje ? "oda tipi uyuyor" : String(mulkDegeri(mulk, "oda", false)));
        else if (olcut.tip === "evet") nedenler.push(ad + " var");
      }
      else if (r === 0) notlar.push({ tur: "uymuyor", metin: olcut.tip === "evet" ? `${ad} yok` : `${ad} uymuyor` });
      else notlar.push({ tur: "kismi", metin: `${ad} yakın` });
    }
    if (!belirtilen || !sayilan) continue;
    const puan = (toplam / sayilan) * kalem.agirlik;
    toplamAgirlik += kalem.agirlik; toplamPuan += puan;
    kalemler.push({ ad: kalem.ad, oran: toplam / sayilan });
  }
  // Arsada imar durumu: alt türle belirtildiği için ayrıca ölçüt olarak istenmişse (olmazsa olmaz) burada elenir.
  const imarIstek = istekler.imar_durumu;
  if (istekVar(imarIstek)) {
    const v = mulkDegeri(mulk, "imar_durumu", false);
    const liste = Array.isArray(imarIstek.d) ? imarIstek.d : [imarIstek.d];
    if (v == null) { if (imarIstek.sart) { tavanB = true; notlar.push({ tur: "teyit", metin: "Teyit et: imar durumu" }); } }
    else if (!liste.includes(v) && imarIstek.sart) return null;
  }
  const ozellikOran = toplamAgirlik > 0 ? toplamPuan / toplamAgirlik : null;

  // Tahminler (danışmanın mülk kartına yazdıkları): kazanç, satış süresi, kira getirisi.
  const tahmin = {};
  const deger = usd(mulk.tahmini_deger_tutar, mulk.tahmini_deger_para || mulk.fiyat_para, kur);
  if (deger != null && fiyat > 0) tahmin.kazanc_yuzde = Math.round(((deger - fiyat) / fiyat) * 100);
  if (sayi(mulk.tahmini_satis_ay) != null) tahmin.satis_ay = sayi(mulk.tahmini_satis_ay);
  const kira = usd(mulk.tahmini_kira_tutar, "TRY", kur);
  if (kira != null && kira > 0 && fiyat > 0 && mulk.islem === "satilik") {
    tahmin.kira_getirisi_yuzde = Math.round(((kira * 12) / fiyat) * 1000) / 10;
    tahmin.geri_donus_yil = Math.round((fiyat / (kira * 12)) * 10) / 10;
  }
  if (mulk.acil) nedenler.push("acil satılık");
  if (mulk.pazarlik_payi) nedenler.push("pazarlık payı var");
  if (mulk.durum === "opsiyonlu") notlar.push({ tur: "bilgi", metin: "Mülk opsiyonlu" });

  const ortak = { tavan_b: tavanB, para_bilinmiyor: paraBilinmiyor, butce, nedenler, notlar, tahmin, kategori: kat };

  // Yatırımcı ve al-satçı tipleri: ekspertiz modülü gelene kadar puan verilmez, yalnızca eleme yapılır.
  if (!tip.puanli) {
    const enAz = sayi(talep.en_az_kazanc);
    if (enAz != null) {
      if (tahmin.kazanc_yuzde == null) notlar.push({ tur: "teyit", metin: "Tahmini piyasa değeri girilmemiş, kazanç hesaplanamadı" });
      else if (tahmin.kazanc_yuzde < enAz) return null;
    }
    return { ...ortak, puan: null, sinif: null, puansiz: true, parcalar: {} };
  }

  // 6) Puan: yalnızca alıcının söylediği ölçütler sayılır; söylenmeyenin puanı diğerlerine dağılır.
  const ag = ayarlar.agirliklar?.[tip.kod] || VARSAYILAN_AYAR.agirliklar[tip.kod] || VARSAYILAN_AYAR.agirliklar.oturum;
  const parcalar = {};
  let payda = 0, pay2 = 0;
  const ekle = (ad, oran, agirlik) => { if (oran == null) return; payda += agirlik; pay2 += oran * agirlik; parcalar[ad] = { oran, agirlik }; };
  ekle("konum", konumOran, ag.konum);
  ekle("ozellik", ozellikOran, ag.ozellik);
  ekle("alt_tur", turOran, ag.alt_tur);
  if (parcalar.ozellik) parcalar.ozellik.kalemler = kalemler;
  let puan;
  if (payda === 0) { puan = 100; tavanB = true; notlar.push({ tur: "bilgi", metin: "Talepte bölge, tür ve özellik belirtilmemiş" }); }
  else puan = Math.round((pay2 / payda) * 100);
  for (const p of Object.values(parcalar)) { p.en_cok = Math.round((p.agirlik / payda) * 100); p.puan = Math.round(((p.oran * p.agirlik) / payda) * 100); }
  // Bütçeyi biraz aşan, yakın türde olan ya da teyit bekleyen eşleşme en fazla B olur.
  const sinirA = ayarlar.sinir_a ?? 80, sinirB = ayarlar.sinir_b ?? 60, sinirC = ayarlar.sinir_c ?? 40;
  if (tavanB && puan >= sinirA) puan = sinirA - 1;
  if (puan < sinirC) return null;
  const sinif = puan >= sinirA ? "A" : puan >= sinirB ? "B" : "C";
  return { ...ortak, tavan_b: tavanB, puan, sinif, puansiz: false, parcalar };
}

// Liste sırası: puanlılar puana göre; aynı puanda işareti olan (A potansiyel, bölgede görüşülmüş) üstte.
// Parası bilinmeyenler en altta ayrı durur.
export function sirala(liste) {
  const isaret = (e) => (e.isaretler?.length || 0);
  return [...liste].sort((a, b) =>
    (a.para_bilinmiyor ? 1 : 0) - (b.para_bilinmiyor ? 1 : 0)
    || (b.puan ?? -1) - (a.puan ?? -1)
    || (b.tahmin?.kazanc_yuzde ?? -999) - (a.tahmin?.kazanc_yuzde ?? -999)
    || isaret(b) - isaret(a));
}

// "Talebi yok ama alabilir": açık talebi olmayan ama parası ya da ilgisi olan kişi.
// kisi: { alim_gucu_usd, potansiyel, yatirimci_tipi (al_satci | yatirimci | olursa_alir), calisma_bolgeleri:[{ilce, mahalle}], calisma_kategorileri:[], gorusme_ilceleri:[ilce_id], aldigi_ilceler:[ilce_id] }
export function talepsizAday(kisi, mulk, { kur, ayarlar = VARSAYILAN_AYAR }) {
  const fiyat = usd(mulk.fiyat_tutar, mulk.fiyat_para, kur);
  const guc = sayi(kisi.alim_gucu_usd);
  const pay = (ayarlar.butce_payi ?? 10) / 100;
  if (guc != null && fiyat != null && fiyat > guc * (1 + pay)) return null;
  const nedenler = [];
  if (kisi.potansiyel === "A" && guc != null && fiyat != null) nedenler.push("A potansiyel, alım gücü yeterli");
  if (mulk.ilce_id && (kisi.aldigi_ilceler || []).includes(mulk.ilce_id)) nedenler.push("bu ilçede daha önce mülk aldı");
  else if (mulk.ilce_id && (kisi.gorusme_ilceleri || []).includes(mulk.ilce_id)) nedenler.push("bu ilçede daha önce görüşüldü");
  if (kisi.yatirimci_tipi) {
    const bolge = kisi.calisma_bolgeleri || [];
    const kat = kisi.calisma_kategorileri || [];
    const bolgeUyar = !bolge.length || bolge.some((b) => b.ilce === mulk.ilce_id && (!b.mahalle || b.mahalle === mulk.mahalle_id));
    const katUyar = !kat.length || kat.includes(mulk.kategori);
    const TIP = { al_satci: "al-satçı", yatirimci: "yatırımcı", olursa_alir: "olursa alır" };
    if (bolgeUyar && katUyar && (bolge.length || kat.length)) nedenler.push(`${TIP[kisi.yatirimci_tipi] || "yatırımcı"}, çalışma alanı uyuyor`);
  }
  if (!nedenler.length) return null;
  return { nedenler, para_bilinmiyor: guc == null };
}

// Konum bağlamı: komşuluk çiftlerinden hızlı sorgu nesnesi üretir.
export function konumBaglami(ilceKomsu, mahalleKomsu) {
  const anahtar = (a, b) => (a < b ? a + ":" + b : b + ":" + a);
  const ik = new Set(ilceKomsu.map(([a, b]) => anahtar(a, b)));
  const mk = new Set(mahalleKomsu.map(([a, b]) => anahtar(a, b)));
  return { ilceKomsu: (a, b) => ik.has(anahtar(a, b)), mahalleKomsu: (a, b) => mk.has(anahtar(a, b)) };
}
