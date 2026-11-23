import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ayar } from "../ayar.js";
import { KullaniciHatasi } from "./ortak.js";

// Dosya saklama (belgeler ve profil fotoğrafları): rastgele adla, uygulama klasörünün dışında.
const IMZALAR = [
  { mime: "application/pdf", uzanti: "pdf", test: (b) => b.subarray(0, 5).toString() === "%PDF-" },
  { mime: "image/jpeg", uzanti: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", uzanti: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", uzanti: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { mime: "image/heic", uzanti: "heic", test: (b) => b.subarray(4, 8).toString() === "ftyp" && /^(heic|heix|mif1|hevc)/.test(b.subarray(8, 12).toString()) },
];
// Dosyanın türü adından değil içeriğinden anlaşılır.
export function dosyaTuru(veri, yalnizResim = false) {
  const t = IMZALAR.find((i) => i.test(veri));
  if (!t || (yalnizResim && !t.mime.startsWith("image/")) || (yalnizResim && t.mime === "image/heic")) return null;
  return t;
}
export async function dosyaKaydet(altKlasor, veri, uzanti) {
  const klasor = path.join(ayar.yuklemeKlasoru, altKlasor);
  await fs.promises.mkdir(klasor, { recursive: true });
  const ad = crypto.randomBytes(16).toString("hex") + "." + uzanti;
  await fs.promises.writeFile(path.join(klasor, ad), veri, { mode: 0o600 });
  return altKlasor + "/" + ad;
}
export function dosyaYolu(goreli) {
  const tam = path.resolve(ayar.yuklemeKlasoru, goreli);
  if (!tam.startsWith(path.resolve(ayar.yuklemeKlasoru) + path.sep)) throw new KullaniciHatasi("Dosya bulunamadı.", 404);
  return tam;
}
export async function dosyaSil(goreli) { if (goreli) await fs.promises.rm(dosyaYolu(goreli), { force: true }); }

