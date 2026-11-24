// Toplu aktarım: aktarım çalışma kitabındaki (Kişiler, Talepler, Mülkler sayfaları) satırları Satal kayıtlarına çevirir.
// Veritabanına dokunmaz; ne ekleneceğini ve hangi satırların neden alınmadığını döndürür. Yazma işini scripts/aktar.js yapar.
import { norm, telefonNorm, sayiOku } from "./metin.js";
import { KATEGORILER, ODA_SECENEKLERI } from "../alan/kategoriler.js";
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

const HITAP = { bey: "bey", hanim: "hanim", abi: "abi", abla: "abla" };
const YATIRIMCI = { yatirimci: "yatirimci", "al-satci": "al_satci", "al satci": "al_satci", alsatci: "al_satci" };

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

// sayfalar: xlsxOku sonucu. Dönen: { kisiler, talepler, mulkler, alinmayan:[{sayfa, satir, ad, neden}] }
// Para birimi olarak yalnızca TL ve USD kabul edilir (Satal'ın kur kuralı dolara göre çalışır).
export function aktarimHazirla(sayfalar, { konum, varsayilanDanisman, varsayilanIl = "İzmir" }) {
  const sayfa = (ad) => {
    const k = Object.keys(sayfalar).find((x) => norm(x) === norm(ad));
    return k ? sayfaNesneleri(sayfalar[k]) : [];
  };
  const yerBul = konumBulucu(konum, varsayilanIl);
  const alinmayan = [];
  const atla = (s, o, neden) => alinmayan.push({ sayfa: s, satir: o._satir, ad: alan(o, "ad soyad"), neden });

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
    const k = {
      no, satir: o._satir, danisman, ad: ad || "(adsız)", telefonlar,
      hitap_turu: HITAP[norm(alan(o, "hitap"))] || "bey_hanim_yok",
      sen_siz: ss === "sen" ? "sen" : "siz",
      potansiyel: ["A", "B", "C"].includes(pot) ? pot : null,
      yatirimci_tipi: YATIRIMCI[norm(alan(o, "yatirimci"))] || null,
      sirket: String(alan(o, "sirket")).slice(0, 200),
      notlar: [String(alan(o, "notlar")), ek.join(" · ")].filter(Boolean).join("\n\n").slice(0, 10000),
    };
    kisiler.push(k);
    kisiNo.set(no, k);
    for (const t of telefonlar) numara.set(danisman + "|" + t, k);
  }

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

  // ---------- Talepler ----------
  const talepler = [];
  for (const o of sayfa("Talepler")) {
    if (!evetMi(alan(o, "aktar"))) { atla("Talepler", o, "Aktar: Hayır"); continue; }
    const k = kisiyiBul("Talepler", o); if (!k) continue;
    const kt = kategoriVeTur("Talepler", o); if (!kt) continue;
    const yer = alan(o, "ilce") ? yerBul(alan(o, "il"), alan(o, "ilce"), alan(o, "mahalle")) : null;
    if (yer?.hata) { atla("Talepler", o, yer.hata); continue; }
    const butce = sayiOku(alan(o, "butce")), para = paraKodu(alan(o, "para"));
    if (!para) { atla("Talepler", o, `para birimi “${alan(o, "para")}” tanınmadı (TL ya da USD yazın)`); continue; }
    const od = oda(o, kt.kat);
    const notlar = [alan(o, "nottan"), yer?.konum_notu ? "Mahalle: " + yer.konum_notu : ""].filter(Boolean).join("\n");
    talepler.push({
      satir: o._satir, kisi: k, islem: islem(o), kategoriler: [kt.kat.kod], alt_turler: kt.tur ? [kt.kat.kod + ":" + kt.tur.kod] : [],
      bolgeler: yer ? [{ ilce: yer.ilce_id, mahalle: yer.mahalle_id }] : [], butce_max: butce, butce_para: para,
      kriterler: od ? { oda: { d: [od], sart: false } } : {}, notlar,
    });
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
    const od = oda(o, kt.kat);
    mulkler.push({
      satir: o._satir, kisi: k, danisman, ofis_mulku: ofis, islem: islem(o), kategori: kt.kat.kod, alt_tur: kt.tur.kod,
      il_id: yer.il_id, ilce_id: yer.ilce_id, mahalle_id: yer.mahalle_id, konum_notu: yer.konum_notu.slice(0, 300),
      fiyat, fiyat_para: para, ozellikler: od ? { oda: od } : {}, notlar: String(alan(o, "nottan")).slice(0, 5000),
    });
  }
  return { kisiler, talepler, mulkler, alinmayan };
}
