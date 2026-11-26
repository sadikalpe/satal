// Arayüzden bağımsız yardımcılar: Türkçe metin, sayı, telefon, para ve tarih biçimleri.

export const norm = (s) => String(s || "").toLocaleLowerCase("tr")
  .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// "6.000.000", "6,5 milyon", "450 bin", "2.5M", "1.250,50" → sayı
export function sayiOku(s) {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let t = String(s).trim().toLocaleLowerCase("tr");
  if (!t) return null;
  let carpan = 1;
  if (/(milyon|\bmn\b|\d\s*m\b)/.test(t)) carpan = 1e6;
  else if (/(\bbin\b|\d\s*k\b)/.test(t)) carpan = 1e3;
  const eksi = /^\s*-/.test(t);
  t = t.replace(/[^\d.,]/g, "");
  if (!t) return null;
  let v;
  if (carpan > 1) v = parseFloat(t.replace(",", ".")) * carpan;
  else {
    // binlik ayraçlarını kaldır (nokta ya da virgül, ardından tam 3 hane)
    t = t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
    v = parseFloat(t);
  }
  if (!Number.isFinite(v)) return null;
  return eksi ? -v : v;
}

// Türkiye numaralarını 905XXXXXXXXX biçimine getirir; yabancı numaraları ülke koduyla bırakır.
export function telefonNorm(ham) {
  let d = String(ham || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && /^[2-5]/.test(d)) d = "90" + d;
  else if (d.length === 11 && d.startsWith("0")) d = "9" + d;
  return d.length >= 8 && d.length <= 15 ? d : "";
}
export function telefonYaz(p) {
  if (/^90\d{10}$/.test(p)) return `+90 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10)}`;
  return p ? "+" + p : "";
}
export const yabanciNumara = (p) => !!p && !p.startsWith("90");

const tr = (n, kesir = 0) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: kesir });
export const sayiYaz = (n, kesir = 0) => (n == null || n === "" ? "" : tr(n, kesir));
export function paraYaz(tutar, para) {
  if (tutar == null || tutar === "") return "";
  return para === "USD" ? "$" + tr(Math.round(tutar)) : tr(Math.round(tutar)) + " TL";
}
// 4.500.000 → "4,5 milyon TL", 850.000 → "850 bin TL"
export function paraKisa(tutar, para) {
  if (tutar == null || tutar === "") return "";
  const n = Number(tutar);
  let s;
  if (Math.abs(n) >= 1e6) s = tr(n / 1e6, 2) + " milyon";
  else if (Math.abs(n) >= 1e4) s = tr(n / 1e3, 0) + " bin";
  else s = tr(n, 0);
  return para === "USD" ? s + " $" : s + " TL";
}

export const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const tarihNesnesi = (t) => (t instanceof Date ? t : t ? new Date(t) : null);
// Sunucu saati ne olursa olsun tarihler Türkiye saatiyle gösterilir.
const TZ = "Europe/Istanbul";
export function tarihYaz(t) {
  const d = tarihNesnesi(t);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
}
export function tarihSaatYaz(t) {
  const d = tarihNesnesi(t);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function ayYilYaz(t) {
  const d = tarihNesnesi(t);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", { timeZone: TZ, month: "long", year: "numeric" });
}
// Türkiye saatiyle bugünün tarihi (YYYY-AA-GG)
export function bugun(simdi = new Date()) {
  return simdi.toLocaleDateString("sv-SE", { timeZone: TZ });
}
export function gunFarki(t, simdi = new Date()) {
  const d = tarihNesnesi(t);
  if (!d) return null;
  return Math.floor((simdi.getTime() - d.getTime()) / 864e5);
}
export function neKadarOnce(t, simdi = new Date()) {
  const g = gunFarki(t, simdi);
  if (g == null) return "";
  if (g <= 0) return "bugün";
  if (g === 1) return "dün";
  if (g < 30) return g + " gün önce";
  if (g < 365) return Math.floor(g / 30) + " ay önce";
  const y = Math.floor(g / 365);
  return y + " yıl önce";
}

// "Ahmet Yılmaz" → "Ahmet". Selamda kullanıldığı için tamamı büyük ya da tamamı küçük harfle yazılmış ad düzeltilir:
// "AHMET YILMAZ" / "ahmet yılmaz" → "Ahmet". İçinde iki türü de bulunan yazım ("McAllister") olduğu gibi kalır.
export const ilkAd = (ad) => {
  const s = String(ad || "").trim().split(/\s+/)[0] || "";
  const tekTur = s.length > 1 && /\p{L}/u.test(s) && (s === s.toLocaleUpperCase("tr") || s === s.toLocaleLowerCase("tr"));
  return tekTur ? basHarfBuyut(s) : s;
};
export const basHarfBuyut = (s) => String(s || "").toLocaleLowerCase("tr").replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase("tr"));
