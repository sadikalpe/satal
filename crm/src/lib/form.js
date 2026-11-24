// Form değerlerini okuma yardımcıları.
import { sayiOku } from "./metin.js";

export const metin = (v, en = 500) => String(Array.isArray(v) ? v[0] ?? "" : v ?? "").replace(/\u0000/g, "").trim().slice(0, en);
export const dizi = (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]).map(String);
export const sayi = (v) => { const n = sayiOku(Array.isArray(v) ? v[0] : v); return n == null || n < 0 || n > 1e13 ? null : n; };
export const evetHayir = (v) => (v === "evet" ? true : v === "hayir" ? false : null);
export const isaretli = (v) => v === "1" || v === "on" || v === "evet";
export const secim = (v, izinli, varsayilan = null) => (izinli.includes(String(v)) ? String(v) : varsayilan);
export const uuidMi = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
export const tarih = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
