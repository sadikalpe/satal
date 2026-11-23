// Giriş altyapısı: şifre, jeton, oturum, hız sınırı.
import crypto from "node:crypto";
import { ayar } from "./ayar.js";

const N = 16384;
export function sifreHash(sifre) {
  const tuz = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(sifre).normalize("NFKC"), tuz, 64, { N });
  return `scrypt$${N}$${tuz.toString("base64")}$${h.toString("base64")}`;
}
export function sifreDogru(sifre, kayitli) {
  const p = String(kayitli || "").split("$");
  if (p.length !== 4 || p[0] !== "scrypt") return false;
  const tuz = Buffer.from(p[2], "base64"), beklenen = Buffer.from(p[3], "base64");
  const h = crypto.scryptSync(String(sifre).normalize("NFKC"), tuz, beklenen.length, { N: Number(p[1]) });
  return crypto.timingSafeEqual(h, beklenen);
}
export function sifreUygunMu(sifre) {
  const s = String(sifre || "");
  if (s.length < 10) return "Şifre en az 10 karakter olmalı.";
  if (s.length > 200) return "Şifre çok uzun.";
  if (/^(.)\1+$/.test(s) || /^(0123456789|1234567890|12345678910|qwertyuiop|sifresifre|password123)$/i.test(s)) return "Bu şifre çok kolay tahmin edilir; başka bir şifre seçin.";
  return null;
}
export const jetonUret = () => crypto.randomBytes(32).toString("base64url");
export const jetonHash = (j) => crypto.createHash("sha256").update(String(j)).digest("hex");
export function sabitKarsilastir(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const CEREZ = "satal_oturum";
export const cerezAyari = (saniye) => ({ path: "/", httpOnly: true, sameSite: "lax", secure: ayar.uretim, maxAge: saniye });

export async function oturumAc(q, kullaniciId, req, reply) {
  const jeton = jetonUret();
  await q(
    `insert into oturumlar (kullanici_id, jeton_hash, bitis_at, cihaz, ip) values ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [kullaniciId, jetonHash(jeton), ayar.oturumGun, String(req.headers["user-agent"] || "").slice(0, 300), req.ip || ""],
  );
  reply.setCookie(CEREZ, jeton, cerezAyari(ayar.oturumGun * 86400));
}
export async function oturumKullanicisi(q, jeton) {
  if (!jeton) return null;
  return q.bir(
    `select k.*, o.id as oturum_id from oturumlar o join kullanicilar k on k.id = o.kullanici_id
      where o.jeton_hash = $1 and o.bitis_at > now() and k.durum = 'aktif'`, [jetonHash(jeton)]);
}

// Basit hız sınırı (tek sunucu için yeterli): anahtar başına pencere içinde en çok n deneme.
const sayaclar = new Map();
export function hizSiniri(anahtar, n, pencereSn) {
  const simdi = Date.now();
  let s = sayaclar.get(anahtar);
  if (!s || s.bitis < simdi) { s = { n: 0, bitis: simdi + pencereSn * 1000 }; sayaclar.set(anahtar, s); }
  s.n++;
  if (sayaclar.size > 20000) for (const [k, v] of sayaclar) if (v.bitis < simdi) sayaclar.delete(k);
  return s.n <= n;
}
export const hizSifirla = (anahtar) => sayaclar.delete(anahtar);
export const hizTemizle = () => sayaclar.clear();
