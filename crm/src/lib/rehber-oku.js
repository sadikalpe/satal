// Rehber dosyası okuma: iPhone / Android .vcf ve Google / Outlook / Excel .csv.
import { norm, telefonNorm } from "./metin.js";

// Dosyanın kodlamasını çözer: UTF-8 (BOM'lu/BOM'suz), UTF-16, yoksa eski Türkçe Windows kodlaması.
export function metneCevir(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^﻿/, ""); }
  catch { return new TextDecoder("windows-1254").decode(b); }
}

function qpCoz(s, kodlama) {
  const bayt = [];
  const enc = new TextEncoder();
  s = s.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { bayt.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else bayt.push(...enc.encode(ch));
  }
  try { return new TextDecoder(kodlama || "utf-8").decode(new Uint8Array(bayt)); }
  catch { return new TextDecoder().decode(new Uint8Array(bayt)); }
}

export function vcfOku(metin) {
  const hamMetin = String(metin).replace(/\r\n?/g, "\n");
  const satirlar = [];
  for (const ln of hamMetin.split("\n")) {
    const son = satirlar.length - 1;
    if (/^[ \t]/.test(ln) && son >= 0) satirlar[son] += ln.slice(1);
    else if (son >= 0 && /ENCODING=QUOTED-PRINTABLE/i.test(satirlar[son]) && satirlar[son].endsWith("=")) satirlar[son] = satirlar[son].slice(0, -1) + ln;
    else satirlar.push(ln);
  }
  const cikti = [];
  let k = null;
  for (const ln of satirlar) {
    if (/^BEGIN:VCARD/i.test(ln)) { k = { telefonlar: [], fn: "", n: "", not: "", sirket: "", unvan: "" }; continue; }
    if (/^END:VCARD/i.test(ln)) { if (k) cikti.push(k); k = null; continue; }
    if (!k) continue;
    const i = ln.indexOf(":");
    if (i < 0) continue;
    const anahtar = ln.slice(0, i), deger0 = ln.slice(i + 1);
    const ozellik = anahtar.split(";")[0].replace(/^item\d+\./i, "").toUpperCase();
    let deger = deger0;
    if (/ENCODING=QUOTED-PRINTABLE/i.test(anahtar)) deger = qpCoz(deger0, (anahtar.match(/CHARSET=([^;:]+)/i) || [])[1]);
    deger = deger.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";");
    if (ozellik === "FN") k.fn = deger.trim();
    else if (ozellik === "N") k.n = deger.split(";").slice(0, 3).reverse().filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    else if (ozellik === "TEL") k.telefonlar.push(deger);
    else if (ozellik === "NOTE") k.not = deger.trim();
    else if (ozellik === "ORG") k.sirket = deger.replace(/;/g, " ").trim();
    else if (ozellik === "TITLE") k.unvan = deger.trim();
  }
  return cikti.map((c) => ({ ad: c.fn || c.n, telefonlar: c.telefonlar, sirket: c.sirket, meslek: c.unvan, not: c.not }));
}

export function csvOku(metin) {
  metin = String(metin).replace(/^﻿/, "");
  const ilk = metin.split("\n")[0];
  const ayrac = ilk.includes("\t") ? "\t" : ilk.split(";").length > ilk.split(",").length ? ";" : ",";
  const satirlar = [];
  let satir = [], f = "", tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const ch = metin[i];
    if (tirnak) { if (ch === '"') { if (metin[i + 1] === '"') { f += '"'; i++; } else tirnak = false; } else f += ch; }
    else if (ch === '"') tirnak = true;
    else if (ch === ayrac) { satir.push(f); f = ""; }
    else if (ch === "\n") { satir.push(f); satirlar.push(satir); satir = []; f = ""; }
    else if (ch !== "\r") f += ch;
  }
  if (f || satir.length) { satir.push(f); satirlar.push(satir); }
  if (satirlar.length < 2) return [];
  const bas = satirlar[0].map((x) => norm(x));
  const bul = (re) => bas.map((x, i) => (re.test(x) ? i : -1)).filter((i) => i >= 0);
  const tam = bul(/^(name|ad soyad|adi soyadi|isim soyisim|isim|full name|display name|kisi|musteri)$/);
  const ilkI = bul(/^(first name|given name|ad|adi)$/);
  const orta = bul(/^(middle name|additional name)$/);
  const son = bul(/^(last name|family name|soyad|soyadi|soyisim)$/);
  const tel = bul(/(phone|tel|telefon|mobile|cep|gsm|numara)/).filter((i) => !/(type|label|etiket|turu)/.test(bas[i]));
  const nt = bul(/^(notes?|not|notlar|aciklama)$/);
  const sirket = bul(/(organization.*name|^company$|sirket|firma)/);
  const meslek = bul(/(organization.*title|^job title$|^title$|meslek|unvan)/);
  return satirlar.slice(1).filter((r) => r.some((x) => x.trim())).map((r) => {
    const g = (a) => a.map((i) => (r[i] || "").trim()).filter(Boolean);
    const ad = g(tam)[0] || [...g(ilkI), ...g(orta), ...g(son)].join(" ");
    const telefonlar = g(tel).flatMap((p) => p.split(/\s*:::\s*|\s*\/\s*|,|;/));
    return { ad, telefonlar, sirket: g(sirket).join(" "), meslek: g(meslek).join(" "), not: g(nt).join(" · ") };
  });
}

export function dosyaOku(buf, dosyaAdi = "") {
  const metin = metneCevir(buf);
  if (/\.vcf$/i.test(dosyaAdi) || /BEGIN:VCARD/i.test(metin.slice(0, 2000))) return vcfOku(metin);
  return csvOku(metin);
}

// Okunan kayıtları yüklemeye hazırlar: numaraları tek biçime getirir, dosya içindeki tekrarları ve numarasızları ayırır.
// mevcut: Map(numara → kisi_id) — danışmanın rehberinde zaten kayıtlı numaralar.
export function yuklemeHazirla(kayitlar, mevcut = new Map()) {
  const satirlar = [];
  const gorulen = new Map();
  let numarasiz = 0, tekrar = 0;
  for (const r of kayitlar) {
    const tel = [...new Set((r.telefonlar || []).map(telefonNorm).filter(Boolean))];
    if (!tel.length) { numarasiz++; continue; }
    const ad = String(r.ad || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const onceki = tel.map((t) => gorulen.get(t)).find((x) => x !== undefined);
    if (onceki !== undefined) {
      // aynı dosyada aynı numara ikinci kez: numaraları ilk kayda ekle
      const s = satirlar[onceki];
      for (const t of tel) if (!s.telefonlar.includes(t)) { s.telefonlar.push(t); gorulen.set(t, onceki); }
      tekrar++;
      continue;
    }
    const ana = tel.find((p) => /^905/.test(p)) || tel[0];
    const kayitli = tel.map((t) => mevcut.get(t)).find(Boolean) || null;
    const i = satirlar.length;
    for (const t of tel) gorulen.set(t, i);
    satirlar.push({
      ad: ad || "(adsız)", telefonlar: [ana, ...tel.filter((t) => t !== ana)],
      sirket: String(r.sirket || "").slice(0, 200), meslek: String(r.meslek || "").slice(0, 200), not: String(r.not || "").slice(0, 2000),
      kayitli_kisi_id: kayitli,
    });
  }
  return {
    satirlar,
    ozet: { okunan: kayitlar.length, yeni: satirlar.filter((s) => !s.kayitli_kisi_id).length, kayitli: satirlar.filter((s) => s.kayitli_kisi_id).length, numarasiz, tekrar },
  };
}
