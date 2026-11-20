// Arayüzden bağımsız saf fonksiyonlar: telefon, sayı, rehber dosyası okuma ve eşleştirme.
// Tarayıcıda ve Node testlerinde aynen kullanılır.

export const TYPES = ["Arsa", "Villa", "Daire", "Müstakil ev", "Tarla / bağ", "Ticari", "Ofis", "Otel / turizm"];
export const OUTCOMES = ["İlgilendi", "Portföy sunuldu", "Teklif verdi", "Satın aldı", "Olmadı"];
export const REGIONS = ["Alaçatı", "Aliağa", "Balçova", "Bayraklı", "Bergama", "Bornova", "Buca", "Çeşme", "Çiğli", "Dikili", "Foça", "Gaziemir", "Güzelbahçe", "Karaburun", "Karşıyaka", "Kemalpaşa", "Konak", "Menderes", "Narlıdere", "Seferihisar", "Selçuk", "Torbalı", "Urla", "Bodrum", "İstanbul"];

export const norm = (s) => String(s || "").toLocaleLowerCase("tr")
  .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// "6.000.000", "6,5 milyon", "450 bin", "2.5M", "1.250,50" → sayı
export function parseNum(s) {
  if (s == null) return null;
  let t = String(s).trim().toLocaleLowerCase("tr");
  if (!t) return null;
  let mult = 1;
  if (/(milyon|\bmn\b|\d\s*m\b)/.test(t)) mult = 1e6;
  else if (/(\bbin\b|\d\s*k\b)/.test(t)) mult = 1e3;
  t = t.replace(/[^\d.,]/g, "");
  if (!t) return null;
  if (mult > 1) { const v = parseFloat(t.replace(",", ".")); return Number.isFinite(v) ? v * mult : null; }
  // binlik ayraçları kaldır (nokta ya da virgül, ardından tam 3 hane)
  t = t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

// Türkiye numaralarını 905XXXXXXXXX biçimine getirir; yabancı numaraları ülke koduyla bırakır.
export function phoneNorm(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && /^[2-5]/.test(d)) d = "90" + d;
  else if (d.length === 11 && d.startsWith("0")) d = "9" + d;
  return d.length >= 8 && d.length <= 15 ? d : "";
}

export function phoneFmt(p) {
  if (/^90\d{10}$/.test(p)) return `+90 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10)}`;
  return "+" + p;
}

export const fmtUSD = (n) => (n == null || n === "" ? "" : "$" + Math.round(n).toLocaleString("tr-TR"));
export function fmtShort(n) {
  if (n == null) return "";
  if (n >= 1e6) return "$" + (n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + "M";
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
  return "$" + n;
}

export function monthsAgo(iso, now = Date.now()) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((now - d.getTime()) / 2.6298e9));
}
export function agoTxt(iso, now = Date.now()) {
  const m = monthsAgo(iso, now);
  if (m == null) return "";
  if (m < 1) return "bu ay";
  if (m < 12) return m + " ay önce";
  const y = Math.floor(m / 12), r = m % 12;
  return y + (r >= 6 ? ",5" : "") + " yıl önce";
}

// ---------- vCard ----------
function decodeQP(s, charset) {
  const bytes = [];
  const enc = new TextEncoder();
  s = s.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else bytes.push(...enc.encode(ch));
  }
  try { return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes)); }
  catch { return new TextDecoder().decode(new Uint8Array(bytes)); }
}

export function parseVCF(text) {
  const raw = String(text).replace(/\r\n?/g, "\n");
  const lines = [];
  for (const ln of raw.split("\n")) {
    const last = lines.length - 1;
    if (/^[ \t]/.test(ln) && last >= 0) lines[last] += ln.slice(1);
    else if (last >= 0 && /ENCODING=QUOTED-PRINTABLE/i.test(lines[last]) && lines[last].endsWith("=")) lines[last] = lines[last].slice(0, -1) + ln;
    else lines.push(ln);
  }
  const out = [];
  let cur = null;
  for (const ln of lines) {
    if (/^BEGIN:VCARD/i.test(ln)) { cur = { phones: [], fn: "", n: "", note: "", org: "" }; continue; }
    if (/^END:VCARD/i.test(ln)) { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = ln.indexOf(":");
    if (i < 0) continue;
    const key = ln.slice(0, i), val0 = ln.slice(i + 1);
    const prop = key.split(";")[0].replace(/^item\d+\./i, "").toUpperCase();
    let val = val0;
    if (/ENCODING=QUOTED-PRINTABLE/i.test(key)) val = decodeQP(val0, (key.match(/CHARSET=([^;:]+)/i) || [])[1]);
    val = val.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";");
    if (prop === "FN") cur.fn = val.trim();
    else if (prop === "N") cur.n = val.split(";").slice(0, 3).reverse().filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    else if (prop === "TEL") cur.phones.push(val);
    else if (prop === "NOTE") cur.note = val.trim();
    else if (prop === "ORG") cur.org = val.replace(/;/g, " ").trim();
  }
  return out.map((c) => ({ name: c.fn || c.n, phones: c.phones, note: [c.org, c.note].filter(Boolean).join(" · ") }));
}

// ---------- CSV (Google, Outlook, Excel) ----------
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, "");
  const first = text.split("\n")[0];
  const delim = first.includes("\t") ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(f); f = ""; }
    else if (ch === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (ch !== "\r") f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  if (rows.length < 2) return [];
  const hd = rows[0].map((x) => norm(x));
  const idx = (re) => hd.map((x, i) => (re.test(x) ? i : -1)).filter((i) => i >= 0);
  const full = idx(/^(name|ad soyad|adi soyadi|isim soyisim|isim|full name|display name|kisi|musteri)$/);
  const firstI = idx(/^(first name|given name|ad|adi)$/);
  const mid = idx(/^(middle name|additional name)$/);
  const last = idx(/^(last name|family name|soyad|soyadi|soyisim)$/);
  const ph = idx(/(phone|tel|telefon|mobile|cep|gsm|numara)/).filter((i) => !/(type|label|etiket|turu)/.test(hd[i]));
  const nt = idx(/^(notes?|not|notlar|aciklama)$/);
  const org = idx(/(organization.*name|^company$|sirket|firma)/);
  return rows.slice(1).filter((r) => r.some((x) => x.trim())).map((r) => {
    const g = (a) => a.map((i) => (r[i] || "").trim()).filter(Boolean);
    const name = g(full)[0] || [...g(firstI), ...g(mid), ...g(last)].join(" ");
    const phones = g(ph).flatMap((p) => p.split(/\s*:::\s*|\s*\/\s*|,/));
    return { name, phones, note: [...g(org), ...g(nt)].join(" · ") };
  });
}

// Okunan kayıtları birincil numaraya göre tekilleştirir. existing: zaten kayıtlı numaralar (Set)
export function prepareImport(records, existing = new Set()) {
  const fresh = new Map();
  let dup = 0, nophone = 0;
  for (const r of records) {
    const ps = [...new Set((r.phones || []).map(phoneNorm).filter(Boolean))];
    if (!ps.length) { nophone++; continue; }
    const main = ps.find((p) => /^905/.test(p)) || ps[0];
    if (existing.has(main) || fresh.has(main)) { dup++; continue; }
    fresh.set(main, { phone: main, name: (r.name || "").slice(0, 200), note: (r.note || "").slice(0, 2000), extra_phones: ps.filter((p) => p !== main) });
  }
  return { rows: [...fresh.values()], dup, nophone, total: records.length };
}

// ---------- Eşleştirme ----------
// listing: {id, region, hood, prop_type, price_usd}
// contacts: [{id, phone, owner_id, budget_min, budget_max, tier, regions, types, note, hist:[{happened_on, region, prop_type, outcome, listing_id}]}]
// Aynı telefon birden çok danışmanın rehberindeyse tek satırda birleştirilir.
export function matchContacts(L, contacts, now = Date.now()) {
  const R = norm(L.region), H = norm(L.hood), T = L.prop_type, P = Number(L.price_usd) || 0;
  const regionHit = (x) => { const v = norm(x); return !!v && (v === R || (H && v === H) || (R && v.length > 3 && (R.includes(v) || v.includes(R))) || (H && H.length > 3 && v.includes(H))); };
  const byPhone = new Map();
  for (const c of contacts) {
    let s = 0;
    const why = [];
    const max = c.budget_max ? Number(c.budget_max) : null, min = c.budget_min ? Number(c.budget_min) : null;
    if (max && P) {
      if (max >= P * 0.9 && (!min || min <= P * 1.25)) { s += 40; why.push({ k: "money", t: "Bütçe " + (min ? fmtShort(min) + "–" : "") + fmtShort(max) }); }
      else if (max >= P * 0.7 && max < P * 0.9) { s += 18; why.push({ k: "money", t: "Bütçe biraz altında (" + fmtShort(max) + ")" }); }
      else if (min && min > P * 1.25) { s += 5; why.push({ k: "warn", t: "Daha büyük bütçe arıyor (" + fmtShort(min) + "+)" }); }
    } else if (!max && c.tier === "A" && P >= 500000) { s += 12; why.push({ k: "money", t: "Yüksek potansiyel (A)" }); }

    const regMatch = (c.regions || []).some(regionHit);
    if (regMatch) { s += 28; why.push({ k: "region", t: L.region + " ile ilgileniyor" }); }

    const hist = c.hist || [];
    let best = null;
    for (const h of hist) {
      if (h.listing_id && h.listing_id === L.id) continue;
      if (regionHit(h.region) && (!best || (h.happened_on || "") > (best.happened_on || ""))) best = h;
    }
    if (best) {
      s += best.outcome === "Satın aldı" ? 38 : 32;
      why.push({ k: "hist", t: `${agoTxt(best.happened_on, now) || "Daha önce"} ${best.region}${best.prop_type ? " " + best.prop_type.toLocaleLowerCase("tr") : ""} · ${best.outcome || "görüşüldü"}` });
    }
    if (!best && !regMatch && R && norm(c.note).includes(R)) { s += 15; why.push({ k: "region", t: "Notunda " + L.region + " geçiyor" }); }

    if (T && (c.types || []).includes(T)) { s += 14; why.push({ k: "", t: T + " arıyor" }); }
    else if (T && hist.some((h) => h.prop_type === T)) { s += 8; why.push({ k: "", t: "Daha önce " + T.toLocaleLowerCase("tr") + " konuşuldu" }); }
    if (hist.some((h) => h.outcome === "Satın aldı")) s += 6;

    const pitched = hist.filter((h) => h.listing_id === L.id && h.outcome === "Portföy sunuldu").sort((a, b) => (b.happened_on || "").localeCompare(a.happened_on || ""))[0];
    if (pitched) why.push({ k: "warn", t: "Bu portföy " + (agoTxt(pitched.happened_on, now) || "daha önce") + " gönderildi" });

    if (s < 28) continue;
    const score = Math.min(99, s);
    const prev = byPhone.get(c.phone);
    if (!prev) byPhone.set(c.phone, { c, s: score, why, owners: [c.owner_id], others: [] });
    else {
      prev.owners.push(c.owner_id);
      if (score > prev.s) { prev.others.push(prev.c); prev.c = c; prev.s = score; prev.why = why; }
      else prev.others.push(c);
    }
  }
  return [...byPhone.values()].sort((a, b) => b.s - a.s || (a.c.name || "").localeCompare(b.c.name || "", "tr"));
}

// Basit WhatsApp şablonu (Claude kullanılamadığında)
export function templateMessage(c, L, signer = "") {
  const first = (c.name || "").split(/\s+/)[0];
  const h = (c.hist || []).filter((x) => norm(x.region) === norm(L.region)).sort((a, b) => (b.happened_on || "").localeCompare(a.happened_on || ""))[0];
  const lines = [
    `Merhaba${first ? " " + first : ""}, nasılsınız?`,
    "",
    `${h ? `Bir süre önce ${h.region} tarafında ${(h.prop_type || "mülk").toLocaleLowerCase("tr")} konuşmuştuk. ` : ""}${L.region}${L.hood ? " " + L.hood : ""}’de yeni bir ${(L.prop_type || "mülk").toLocaleLowerCase("tr")} portföyümüz var ve aklıma siz geldiniz.`,
    "",
    `• ${L.title}`,
    ...(L.m2 ? [`• ${Number(L.m2).toLocaleString("tr-TR")} m²`] : []),
    `• Fiyat: ${fmtUSD(L.price_usd)}`,
    ...(L.description ? [`• ${String(L.description).slice(0, 180)}`] : []),
    "",
    "Detayları ve fotoğrafları paylaşabilirim. Uygun olduğunuzda kısa bir görüşme yapalım mı?",
    ...(signer ? ["", signer] : []),
  ];
  return lines.join("\n").trim();
}

export const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

export const fmtTRY = (n) => (n == null || n === "" ? "" : Math.round(n).toLocaleString("tr-TR") + " ₺");

// Alıcının bütçesi: her zaman dolar saklanır. TL girildiyse girildiği günün kuruyla sabitlenir.
// TL tutarlar değişmediyse eski kur ve tarih korunur (kişinin gücü o günkü dolar değerinde kalır).
// rate: bugünün kuru (TL girişinde gerekir), day: bugünün tarihi, prev: kişinin mevcut kaydı
export function budgetFields({ currency, min, max, rate, day, prev }) {
  if (currency !== "TRY") {
    return { budget_currency: "USD", budget_min: min ?? null, budget_max: max ?? null, budget_min_try: null, budget_max_try: null, budget_fx: null, budget_fx_day: null };
  }
  if (min == null && max == null) {
    return { budget_currency: "TRY", budget_min: null, budget_max: null, budget_min_try: null, budget_max_try: null, budget_fx: null, budget_fx_day: null };
  }
  const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.round(Number(a)) === Math.round(Number(b)));
  if (prev && prev.budget_currency === "TRY" && prev.budget_fx && same(prev.budget_min_try, min) && same(prev.budget_max_try, max)) {
    return { budget_currency: "TRY", budget_min: prev.budget_min, budget_max: prev.budget_max, budget_min_try: prev.budget_min_try, budget_max_try: prev.budget_max_try, budget_fx: prev.budget_fx, budget_fx_day: prev.budget_fx_day };
  }
  if (!(rate > 0)) throw new Error("rate_missing");
  const usd = (x) => (x == null ? null : Math.round(x / rate));
  return { budget_currency: "TRY", budget_min: usd(min), budget_max: usd(max), budget_min_try: min ?? null, budget_max_try: max ?? null, budget_fx: rate, budget_fx_day: day };
}
