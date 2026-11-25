// Toplu aktarım: aktarım çalışma kitabındaki satırları Satal kayıtlarına çevirir.
// Okunan sayfalar: Kişiler, Geçmiş ilgiler, Talepler, Aranacaklar, Mülkler. Kitaptaki öbür sayfalar (Okuyun, Ofis grubu,
// Keep notları, WhatsApp…) yalnızca danışmanın kendi başvurusu içindir; okunmaz.
// Kontrol listesi: Kişiler, Geçmiş ilgiler ve Mülkler sayfasındaki "Kontrol" sütunu kaydın teyit notu olur (danışman
// "kontrol ettim" diyene kadar listede bekler). "Tanıştıran durumu" (Kişiler) ve "Getiren durumu" (Mülkler) sütununa
// "Rehberde yok" ya da "Bilinmiyor" yazılırsa adıyla yazılmış kişi için "bu kim?" sorusu yanıtlanmış sayılır.
// Veritabanına dokunmaz; ne ekleneceğini, hangi satırların neden alınmadığını ve hangi bilginin eksik girdiğini döndürür.
// Yazma işini src/servis/aktarim.js yapar.
import { norm, telefonNorm, sayiOku } from "./metin.js";
import { KATEGORILER, ODA_SECENEKLERI, mulkAlanlari } from "../alan/kategoriler.js";
import { sayfaNesneleri } from "./xlsx-oku.js";

// Başlıklar küçük farklarla yazılabilir; başlığın baş kısmına göre bulunur ("Danışman e-postası (boşsa Sadık)" → "danisman")
// Başlık tam olarak varsa (boş olsa bile) o sütun kullanılır; "İl" sütunu boşken "İlçe" okunmaz.
function alan(o, ...adlar) {
  const deger = (v) => (v == null ? "" : typeof v === "string" ? v.trim() : v);
  for (const ad of adlar) {
    const n = norm(ad);
    const tam = Object.keys(o).find((k) => k !== "_satir" && norm(k) === n);
    if (tam !== undefined) { if (deger(o[tam]) !== "") return deger(o[tam]); continue; }
    for (const [k, v] of Object.entries(o)) if (k !== "_satir" && norm(k).startsWith(n) && deger(v) !== "") return deger(v);
  }
  return "";
}
const evetMi = (v) => !/^(hayir|h|no|0|false)$/.test(norm(v));
const parcala = (v) => String(v ?? "").split(/[;\n]/).map((x) => x.trim()).filter(Boolean);

const HITAP = { bey: "bey", hanim: "hanim", abi: "abi", abla: "abla" };
const YATIRIMCI = { yatirimci: "yatirimci", "al-satci": "al_satci", "al satci": "al_satci", alsatci: "al_satci", "olursa alir": "olursa_alir", "olursa-alir": "olursa_alir" };
const SONUC = { ilgilendi: "ilgilendi", "teklif verdi": "teklif_verdi", aldi: "aldi", olmadi: "olmadi" };
const BAG_DURUMU = { "rehberde yok": "rehberde_yok", bilinmiyor: "bilinmiyor", hatirlamiyorum: "bilinmiyor", hatirlanmiyor: "bilinmiyor" };
// Kitaptaki "Durum": Satışta → aktif, Arşiv → pasif (eşleştirmeye girmez), Satıldı → satıldı
const mulkDurumu = (v) => {
  const n = norm(v);
  if (!n || /^(satista|aktif)/.test(n)) return "aktif";
  if (/^(arsiv|pasif)/.test(n)) return "pasif";
  if (/^(satildi|kiralandi)/.test(n)) return "satildi";
  if (/^opsiyon/.test(n)) return "opsiyonlu";
  return null;
};

export function telefonlariAyir(...degerler) {
  const cikti = [];
  for (const d of degerler) {
    for (const parca of String(d ?? "").split(/[,;\/\n]|\s{2,}/)) {
      const t = telefonNorm(parca);
      if (t && !cikti.includes(t)) cikti.push(t);
    }
  }
  return cikti;
}

// "07.09.2023", "7/9/2023", "2023-09-07", Excel'in tarih sayısı → gün; "2023" → yalnızca yıl (yaklasik).
// Dönen: { tarih: "YYYY-AA-GG" | null, yaklasik } ya da okunamadıysa { tarih: null, yaklasik: false, okunamadi: true }
export function tarihOku(v) {
  const bos = { tarih: null, yaklasik: false };
  if (v == null || v === "") return bos;
  const gun = (y, a, g) => {
    const d = new Date(Date.UTC(y, a - 1, g));
    if (y < 1950 || y > 2100 || d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return { ...bos, okunamadi: true };
    return { tarih: d.toISOString().slice(0, 10), yaklasik: false };
  };
  const yil = (y) => (y >= 1950 && y <= 2100 ? { tarih: `${y}-01-01`, yaklasik: true } : { ...bos, okunamadi: true });
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= 1950 && v <= 2100) return yil(v);
    // Excel tarihi: 30.12.1899'dan bu yana geçen gün sayısı
    if (v > 18000 && v < 80000) return { tarih: new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10), yaklasik: false };
    return { ...bos, okunamadi: true };
  }
  const s = String(v).trim();
  let m;
  if ((m = /^(\d{4})$/.exec(s))) return yil(Number(m[1]));
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))) return gun(Number(m[3]), Number(m[2]), Number(m[1]));
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return gun(Number(m[1]), Number(m[2]), Number(m[3]));
  return { ...bos, okunamadi: true };
}

function kategoriBul(ad) {
  const n = norm(ad);
  if (!n) return null;
  return KATEGORILER.find((k) => norm(k.ad) === n || k.kod === n || norm(k.ad).replace(/\s/g, "") === n.replace(/\s/g, "")) || null;
}
function altTurBul(kat, ad) {
  const n = norm(ad).replace(/&/g, "ve");
  if (!n) return null;
  return kat.turler.find((t) => norm(t.ad).replace(/&/g, "ve") === n || t.kod === n) || kat.turler.find((t) => norm(t.ad).replace(/&/g, "ve").startsWith(n)) || null;
}

// konum: { iller:[{id,ad}], ilceler:[{id,il_id,ad}], mahalleler:[{id,ilce_id,ad}] }
export function konumBulucu(konum, varsayilanIl = "İzmir") {
  const il = new Map(konum.iller.map((x) => [norm(x.ad), x]));
  const ilceAd = new Map();
  for (const d of konum.ilceler) { const k = norm(d.ad); if (!ilceAd.has(k)) ilceAd.set(k, []); ilceAd.get(k).push(d); }
  const mahIlce = new Map();
  for (const m of konum.mahalleler) { if (!mahIlce.has(m.ilce_id)) mahIlce.set(m.ilce_id, []); mahIlce.get(m.ilce_id).push(m); }
  const vIl = il.get(norm(varsayilanIl));
  return function bul(ilAdi, ilceAdi, mahalleAdi) {
    const adaylar = ilceAd.get(norm(ilceAdi)) || [];
    if (!adaylar.length) return { hata: ilceAdi ? `“${ilceAdi}” adında ilçe bulunamadı` : "ilçe yazılmamış" };
    let ilce;
    if (ilAdi) {
      const i = il.get(norm(ilAdi));
      if (!i) return { hata: `“${ilAdi}” adında il bulunamadı` };
      ilce = adaylar.find((d) => d.il_id === i.id);
      if (!ilce) return { hata: `${ilAdi} ilinde “${ilceAdi}” ilçesi yok` };
    } else ilce = adaylar.length === 1 ? adaylar[0] : adaylar.find((d) => d.il_id === vIl?.id);
    if (!ilce) return { hata: `“${ilceAdi}” birden çok ilde var; il sütununu doldurun` };
    let mahalle = null, konumNotu = "";
    if (mahalleAdi) {
      const n = norm(mahalleAdi), liste = mahIlce.get(ilce.id) || [];
      const tam = liste.filter((m) => norm(m.ad) === n);
      const bas = tam.length ? tam : liste.filter((m) => norm(m.ad).startsWith(n + " ") || norm(m.ad).startsWith(n));
      if (bas.length === 1) mahalle = bas[0].id;
      else konumNotu = String(mahalleAdi);
    }
    return { il_id: ilce.il_id, ilce_id: ilce.id, mahalle_id: mahalle, konum_notu: konumNotu };
  };
}

function paraKodu(v) {
  const n = norm(v);
  if (!n || n === "tl" || n === "try" || n === "₺") return "TRY";
  if (n === "usd" || n === "$" || n === "dolar") return "USD";
  return null;
}

// sayfalar: xlsxOku sonucu.
// Dönen: { kisiler, talepler, mulkler, ilgiler, aranacaklar, alinmayan:[{sayfa, satir, ad, neden}], uyarilar:[{sayfa, satir, ad, neden}] }
//   alinmayan: satır hiç girmez. uyarilar: satır girer ama bir bilgisi eksik kalır (ör. tanınmayan çalışma bölgesi).
// Para birimi olarak yalnızca TL ve USD kabul edilir (Satal'ın kur kuralı dolara göre çalışır).
export function aktarimHazirla(sayfalar, { konum, varsayilanDanisman, varsayilanIl = "İzmir" }) {
  const sayfa = (ad) => {
    const k = Object.keys(sayfalar).find((x) => norm(x) === norm(ad));
    return k ? sayfaNesneleri(sayfalar[k]) : [];
  };
  const yerBul = konumBulucu(konum, varsayilanIl);
  const alinmayan = [], uyarilar = [];
  const atla = (s, o, neden) => alinmayan.push({ sayfa: s, satir: o._satir, ad: alan(o, "ad soyad"), neden });
  const uyar = (s, o, neden) => uyarilar.push({ sayfa: s, satir: o._satir, ad: alan(o, "ad soyad"), neden });
  const kontrolNotu = (o) => String(alan(o, "kontrol")).replace(/\s+/g, " ").slice(0, 500);
  // "Bu kim?" yanıtı. Yalnızca ad yazılıysa ve rehberdeki bir kişiye bağlanmıyorsa anlamlıdır; öbür durumda yok sayılır.
  const bagDurumu = (s, o, baslik) => {
    const v = alan(o, baslik), d = BAG_DURUMU[norm(v)] || null;
    if (v && !d) uyar(s, o, `“${baslik}” sütunundaki “${v}” tanınmadı (Rehberde yok ya da Bilinmiyor yazın); boş bırakıldı`);
    return d;
  };

  // "Menderes" · "Menderes; Buca" · "Aydın/Didim" (il/ilçe) · "Torbalı/Çapak" (ilçe/mahalle) → [{ ilce, mahalle }]
  const bolgeleriCoz = (s, o, deger) => {
    const cikti = [], gorulen = new Set();
    for (const parca of parcala(deger)) {
      const p = parca.split("/").map((x) => x.trim()).filter(Boolean);
      let yer = p.length === 1 ? yerBul("", p[0], "") : p.length >= 3 ? yerBul(p[0], p[1], p[2]) : yerBul(p[0], p[1], "");
      if (yer.hata && p.length === 2) yer = yerBul("", p[0], p[1]);
      if (yer.hata) { uyar(s, o, `çalışma bölgesi “${parca}” tanınmadı; boş bırakıldı`); continue; }
      if (yer.konum_notu) uyar(s, o, `çalışma bölgesinde “${yer.konum_notu}” mahallesi listede yok; ilçenin tamamı yazıldı`);
      const anahtar = yer.ilce_id + ":" + (yer.mahalle_id || "");
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      cikti.push({ ilce: yer.ilce_id, mahalle: yer.mahalle_id });
    }
    return cikti;
  };

  // ---------- Kişiler ----------
  const kisiler = [], kisiNo = new Map(), numara = new Map();
  for (const o of sayfa("Kişiler")) {
    if (!evetMi(alan(o, "aktar"))) { atla("Kişiler", o, "Aktar: Hayır"); continue; }
    const ad = String(alan(o, "ad soyad", "ad")).replace(/\s+/g, " ").slice(0, 200);
    const telefonlar = telefonlariAyir(alan(o, "telefon"), alan(o, "diger telefon"));
    if (!telefonlar.length) { atla("Kişiler", o, "geçerli telefon numarası yok"); continue; }
    const danisman = String(alan(o, "danisman") || varsayilanDanisman || "").toLowerCase();
    if (!danisman) { atla("Kişiler", o, "danışman belirtilmemiş"); continue; }
    // Aynı danışmanda aynı numara: Satal'da bir numara tek kişiye aittir; ikinci satır birinciye eklenir
    const ayni = telefonlar.map((t) => numara.get(danisman + "|" + t)).find(Boolean);
    const no = String(alan(o, "kisi no") || `satır ${o._satir}`);
    if (ayni) {
      for (const t of telefonlar) if (!ayni.telefonlar.includes(t)) { ayni.telefonlar.push(t); numara.set(danisman + "|" + t, ayni); }
      const not = alan(o, "notlar");
      ayni.notlar = [ayni.notlar, `[${ad}]${not ? " " + not : ""}`].filter(Boolean).join("\n");
      kisiNo.set(no, ayni);
      atla("Kişiler", o, `aynı numara ${ayni.satir}. satırda da var; o kişiye eklendi`);
      continue;
    }
    const ek = [];
    if (alan(o, "e-posta", "eposta")) ek.push("E-posta: " + alan(o, "e-posta", "eposta"));
    if (alan(o, "sehir")) ek.push("Şehir: " + alan(o, "sehir"));
    const grup = alan(o, "grup");
    if (grup && norm(grup) !== "diger") ek.push("Grup: " + grup);
    const pot = String(alan(o, "potansiyel")).toUpperCase();
    const ss = norm(alan(o, "sen"));
    const tipAdi = alan(o, "yatirimci");
    const tip = YATIRIMCI[norm(tipAdi)] || null;
    if (tipAdi && !tip) uyar("Kişiler", o, `yatırımcı tipi “${tipAdi}” tanınmadı (Yatırımcı, Al-satçı ya da Olursa alır yazın)`);
    const turler = [];
    for (const t of parcala(alan(o, "calisma turleri"))) {
      const kat = kategoriBul(t);
      if (!kat) uyar("Kişiler", o, `çalışma türü “${t}” tanınmadı; boş bırakıldı`);
      else if (!turler.includes(kat.kod)) turler.push(kat.kod);
    }
    const guc = sayiOku(alan(o, "alim gucu")), gucPara = paraKodu(alan(o, "alim gucu para"));
    if (guc != null && !gucPara) uyar("Kişiler", o, `alım gücünün para birimi “${alan(o, "alim gucu para")}” tanınmadı (TL ya da USD yazın); alım gücü boş bırakıldı`);
    const k = {
      no, satir: o._satir, danisman, ad: ad || "(adsız)", telefonlar,
      hitap_turu: HITAP[norm(alan(o, "hitap"))] || "bey_hanim_yok",
      sen_siz: ss === "sen" ? "sen" : "siz",
      potansiyel: ["A", "B", "C"].includes(pot) ? pot : null,
      yatirimci_tipi: tip,
      // Çalışma alanı Satal'da yalnızca tipi yazılı kişide tutulur
      calisma_bolgeleri: tip ? bolgeleriCoz("Kişiler", o, alan(o, "calisma bolgeleri")) : [],
      calisma_kategorileri: tip ? turler : [],
      alim_gucu: guc != null && guc > 0 && gucPara ? { tutar: guc, para: gucPara } : null,
      meslek: String(alan(o, "meslek")).slice(0, 200),
      sirket: String(alan(o, "sirket")).slice(0, 200),
      referans_notu: String(alan(o, "kim tanistirdi")).slice(0, 300),
      referans_no: String(alan(o, "tanistiran kisi no") || ""),
      referans: null, referans_durumu: bagDurumu("Kişiler", o, "Tanıştıran durumu"), kontrol_notu: kontrolNotu(o),
      notlar: [String(alan(o, "notlar")), ek.join(" · ")].filter(Boolean).join("\n\n").slice(0, 10000),
    };
    if (!tip && (alan(o, "calisma bolgeleri") || alan(o, "calisma turleri"))) uyar("Kişiler", o, "çalışma bölgesi ya da türü yazılmış ama yatırımcı tipi boş; çalışma alanı alınmadı");
    kisiler.push(k);
    kisiNo.set(no, k);
    for (const t of telefonlar) numara.set(danisman + "|" + t, k);
  }
  // Kim tanıştırdı: bütün kişiler okunduktan sonra bağlanır (tanıştıran kişi listede daha aşağıda olabilir)
  for (const k of kisiler) {
    if (!k.referans_no) continue;
    const r = kisiNo.get(k.referans_no);
    const o = { _satir: k.satir, "Ad Soyad": k.ad };
    if (!r) uyar("Kişiler", o, `tanıştıran “${k.referans_no}” Kişiler sayfasında yok ya da aktarılmıyor; yalnızca notu yazıldı`);
    else if (r === k) uyar("Kişiler", o, "tanıştıran olarak kişinin kendisi yazılmış; bağlantı kurulmadı");
    else if (r.danisman !== k.danisman) uyar("Kişiler", o, "tanıştıran başka bir danışmanın rehberinde; yalnızca notu yazıldı");
    else k.referans = r;
  }
  for (const k of kisiler) if (k.referans || !k.referans_notu) k.referans_durumu = null;

  const kisiyiBul = (s, o) => {
    const no = String(alan(o, "kisi no") || "");
    const k = no && kisiNo.get(no);
    if (!k) { atla(s, o, no ? `“${no}” numaralı kişi Kişiler sayfasında yok ya da aktarılmıyor` : "Kişi No boş"); return null; }
    return k;
  };
  const kategoriVeTur = (s, o) => {
    const kat = kategoriBul(alan(o, "kategori"));
    if (!kat) { atla(s, o, alan(o, "kategori") ? `“${alan(o, "kategori")}” kategorisi tanınmadı` : "kategori boş"); return null; }
    const tur = altTurBul(kat, alan(o, "alt tur"));
    if (alan(o, "alt tur") && !tur) { atla(s, o, `“${alan(o, "alt tur")}” ${kat.ad} için tanınmadı`); return null; }
    return { kat, tur };
  };
  const oda = (o, kat) => {
    const v = String(alan(o, "oda")).replace(/\s/g, "");
    return kat.kod === "konut" && ODA_SECENEKLERI.includes(v) ? v : null;
  };
  const islem = (o) => (/kira/.test(norm(alan(o, "satilik"))) ? "kiralik" : "satilik");
  const tarih = (s, o, baslik) => {
    const t = tarihOku(alan(o, baslik));
    if (t.okunamadi) uyar(s, o, `tarih “${alan(o, baslik)}” okunamadı (gün.ay.yıl ya da yalnızca yıl yazın); tarihsiz girdi`);
    return t;
  };

  // ---------- Geçmiş ilgiler (görüşme kaydı olarak girer; talep değildir, eşleştirmede "geçmiş" işareti verir) ----------
  const ilgiler = [];
  for (const o of sayfa("Geçmiş ilgiler")) {
    if (!evetMi(alan(o, "aktar"))) { atla("Geçmiş ilgiler", o, "Aktar: Hayır"); continue; }
    const k = kisiyiBul("Geçmiş ilgiler", o); if (!k) continue;
    let kt = { kat: null, tur: null };
    if (alan(o, "kategori")) { kt = kategoriVeTur("Geçmiş ilgiler", o); if (!kt) continue; }
    const yer = alan(o, "ilce") ? yerBul(alan(o, "il"), alan(o, "ilce"), alan(o, "mahalle")) : null;
    if (yer?.hata) { atla("Geçmiş ilgiler", o, yer.hata); continue; }
    const sonucAdi = alan(o, "sonuc"), sonuc = SONUC[norm(sonucAdi)] || null;
    if (sonucAdi && !sonuc) uyar("Geçmiş ilgiler", o, `sonuç “${sonucAdi}” tanınmadı (İlgilendi, Teklif verdi, Aldı ya da Olmadı yazın); boş bırakıldı`);
    const t = tarih("Geçmiş ilgiler", o, "tarih");
    const not = String(alan(o, "not"));
    const od = kt.kat ? oda(o, kt.kat) : null;
    ilgiler.push({
      satir: o._satir, kisi: k, tarih: t.tarih, tarih_yaklasik: t.yaklasik,
      islem: alan(o, "satilik") ? islem(o) : null, kategori: kt.kat?.kod || null, alt_tur: kt.tur?.kod || null,
      ilce_id: yer?.ilce_id || null, mahalle_id: yer?.mahalle_id || null, sonuc,
      notu: [not, od && !not.includes(od) ? "Oda: " + od : "", yer?.konum_notu ? "Mahalle: " + yer.konum_notu : ""].filter(Boolean).join("\n").slice(0, 2000),
      kontrol_notu: kontrolNotu(o),
    });
  }

  // ---------- Talepler ----------
  const talepler = [];
  for (const o of sayfa("Talepler")) {
    if (!evetMi(alan(o, "aktar"))) { atla("Talepler", o, "Aktar: Hayır"); continue; }
    const k = kisiyiBul("Talepler", o); if (!k) continue;
    const kt = kategoriVeTur("Talepler", o); if (!kt) continue;
    // İlçe sütununa birden çok ilçe yazılabilir: "Çeşme; Seferihisar; Urla"
    const ilceler = parcala(alan(o, "ilce")), bolgeler = [], mahalleNotu = [];
    let yerHatasi = null;
    for (const ilceAdi of ilceler) {
      const yer = yerBul(alan(o, "il"), ilceAdi, ilceler.length === 1 ? alan(o, "mahalle") : "");
      if (yer.hata) { yerHatasi = yer.hata; break; }
      if (yer.konum_notu) mahalleNotu.push(yer.konum_notu);
      if (!bolgeler.some((b) => b.ilce === yer.ilce_id && b.mahalle === yer.mahalle_id)) bolgeler.push({ ilce: yer.ilce_id, mahalle: yer.mahalle_id });
    }
    if (yerHatasi) { atla("Talepler", o, yerHatasi); continue; }
    if (ilceler.length > 1 && alan(o, "mahalle")) mahalleNotu.push(String(alan(o, "mahalle")));
    const butce = sayiOku(alan(o, "butce")), para = paraKodu(alan(o, "para"));
    if (!para) { atla("Talepler", o, `para birimi “${alan(o, "para")}” tanınmadı (TL ya da USD yazın)`); continue; }
    const od = oda(o, kt.kat);
    const t = tarih("Talepler", o, "tarih");
    const notlar = [alan(o, "nottan"), mahalleNotu.length ? "Mahalle: " + mahalleNotu.join(", ") : ""].filter(Boolean).join("\n");
    talepler.push({
      satir: o._satir, kisi: k, islem: islem(o), kategoriler: [kt.kat.kod], alt_turler: kt.tur ? [kt.kat.kod + ":" + kt.tur.kod] : [],
      bolgeler, butce_max: butce, butce_para: para,
      kriterler: od ? { oda: { d: [od], sart: false } } : {}, notlar,
      // Talebin söylendiği gün: "hâlâ arıyor mu?" sorusu bu tarihe göre sorulur. Yalnızca yıl yazılıysa kullanılmaz.
      tarih: t.tarih && !t.yaklasik ? t.tarih : null,
    });
  }

  // ---------- Aranacaklar (geri arama hatırlatması olarak girer) ----------
  const aranacaklar = [];
  for (const o of sayfa("Aranacaklar")) {
    if (!evetMi(alan(o, "aktar"))) { atla("Aranacaklar", o, "Aktar: Hayır"); continue; }
    if (/^arandi/.test(norm(alan(o, "durum")))) { atla("Aranacaklar", o, "Durum: Arandı"); continue; }
    if (!String(alan(o, "kisi no") || "")) { atla("Aranacaklar", o, "Kişi No boş: kişi rehberde yok; numarası Kişiler sayfasına eklenince girer"); continue; }
    const k = kisiyiBul("Aranacaklar", o); if (!k) continue;
    const t = tarih("Aranacaklar", o, "ne zaman");
    aranacaklar.push({ satir: o._satir, kisi: k, tarih: t.tarih && !t.yaklasik ? t.tarih : null, notu: String(alan(o, "ne icin") || "Aranacak").slice(0, 500) });
  }

  // ---------- Mülkler ----------
  const mulkler = [];
  for (const o of sayfa("Mülkler")) {
    if (!evetMi(alan(o, "aktar"))) { atla("Mülkler", o, "Aktar: Hayır"); continue; }
    // Kişi No boşsa mülk ofis mülkü olarak girer (sahibi rehberde değil)
    const ofis = !String(alan(o, "kisi no") || "");
    const k = ofis ? null : kisiyiBul("Mülkler", o);
    if (!ofis && !k) continue;
    const danisman = k ? k.danisman : String(alan(o, "danisman") || varsayilanDanisman || "").toLowerCase();
    if (!danisman) { atla("Mülkler", o, "danışman belirtilmemiş"); continue; }
    const kt = kategoriVeTur("Mülkler", o); if (!kt) continue;
    if (!kt.tur) { atla("Mülkler", o, "mülkte alt tür boş olamaz"); continue; }
    const yer = yerBul(alan(o, "il"), alan(o, "ilce"), alan(o, "mahalle"));
    if (yer.hata) { atla("Mülkler", o, yer.hata); continue; }
    const fiyat = sayiOku(alan(o, "fiyat")), para = paraKodu(alan(o, "para"));
    if (!para) { atla("Mülkler", o, `para birimi “${alan(o, "para")}” tanınmadı (TL ya da USD yazın)`); continue; }
    const durum = mulkDurumu(alan(o, "durum"));
    if (!durum) { atla("Mülkler", o, `durum “${alan(o, "durum")}” tanınmadı (Satışta, Arşiv ya da Satıldı yazın)`); continue; }
    // Özellikler: yalnızca o türün formunda karşılığı olan alanlar yazılır; karşılığı yoksa bilgi nota eklenir
    const izinli = new Set(mulkAlanlari(kt.kat.kod, kt.tur.kod).map((a) => a.anahtar));
    const ozellikler = {}, notEki = [];
    const od = oda(o, kt.kat);
    if (od && izinli.has("oda")) ozellikler.oda = od;
    const m2 = sayiOku(alan(o, "alan m²", "alan"));
    if (m2 != null && m2 > 0) { if (izinli.has("m2")) ozellikler.m2 = m2; else notEki.push(`Alan: ${m2} m²`); }
    const emsal = sayiOku(alan(o, "emsal"));
    if (emsal != null && emsal > 0) { if (izinli.has("emsal")) ozellikler.emsal = emsal; else notEki.push(`Emsal: ${emsal}`); }
    // Kimden geldi
    const kaynakNo = String(alan(o, "kaynak kisi no") || "");
    let kaynak = null;
    if (kaynakNo) {
      const r = kisiNo.get(kaynakNo);
      if (!r) uyar("Mülkler", o, `getiren “${kaynakNo}” Kişiler sayfasında yok ya da aktarılmıyor; yalnızca notu yazıldı`);
      else if (r.danisman !== danisman) uyar("Mülkler", o, "getiren kişi başka bir danışmanın rehberinde; yalnızca notu yazıldı");
      else kaynak = r;
    }
    const t = tarih("Mülkler", o, "not tarihi");
    const kaynakNotu = String(alan(o, "kimden geldi")).slice(0, 300), kaynakDurumu = bagDurumu("Mülkler", o, "Getiren durumu");
    mulkler.push({
      satir: o._satir, kisi: k, danisman, ofis_mulku: ofis, islem: islem(o), kategori: kt.kat.kod, alt_tur: kt.tur.kod,
      baslik: String(alan(o, "baslik")).slice(0, 120), ada: String(alan(o, "ada")).slice(0, 20), parsel: String(alan(o, "parsel")).slice(0, 20),
      il_id: yer.il_id, ilce_id: yer.ilce_id, mahalle_id: yer.mahalle_id, konum_notu: yer.konum_notu.slice(0, 300),
      fiyat, fiyat_para: para, durum, ozellikler,
      kaynak, kaynak_notu: kaynakNotu, kaynak_durumu: kaynak || !kaynakNotu ? null : kaynakDurumu, kontrol_notu: kontrolNotu(o),
      // Yerin size geldiği gün (notun tarihi): listede sıralama buna göre olur. Yalnızca yıl yazılıysa o yılın başı sayılır.
      tarih: t.tarih,
      notlar: [String(alan(o, "nottan")), ...notEki].filter(Boolean).join("\n").slice(0, 5000),
    });
  }
  return { kisiler, talepler, mulkler, ilgiler, aranacaklar, alinmayan, uyarilar };
}
