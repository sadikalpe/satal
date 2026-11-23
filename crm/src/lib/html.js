// Küçük, güvenli HTML şablonu: araya giren her değer kaçırılır; yalnızca Guvenli nesneler olduğu gibi yazılır.
export class Guvenli {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const KACIS = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const kacir = (v) => String(v).replace(/[&<>"']/g, (c) => KACIS[c]);
function yaz(v) {
  if (v == null || v === false || v === true) return "";
  if (v instanceof Guvenli) return v.s;
  if (Array.isArray(v)) return v.map(yaz).join("");
  return kacir(v);
}
export function html(parcalar, ...degerler) {
  let s = parcalar[0];
  for (let i = 0; i < degerler.length; i++) s += yaz(degerler[i]) + parcalar[i + 1];
  return new Guvenli(s);
}
export const ham = (s) => new Guvenli(String(s));
// Çok satırlı düz metni güvenli biçimde satır sonlarıyla gösterir
export const satirli = (s) => new Guvenli(kacir(s || "").replace(/\r?\n/g, "<br>"));
// attr`secili` gibi koşullu nitelikler
export const nitelik = (ad, kosul) => (kosul ? new Guvenli(" " + ad) : "");
// <script type="application/json"> içine güvenle veri gömer
export const jsonGom = (v) => new Guvenli(JSON.stringify(v).replace(/</g, "\\u003c"));
