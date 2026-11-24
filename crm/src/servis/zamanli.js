// Zamanlanmış işler: günlük dolar kuru (TCMB), gece yeniden eşleştirme, süresi dolan kayıtların temizliği.
import { ayar } from "../ayar.js";
import { sistem } from "../db.js";
import { kurKaydet } from "./ortak.js";
import { hepsiniHesapla } from "./eslesme.js";
import { bugun } from "../lib/metin.js";

// TCMB "today.xml" içinden dolar satış kurunu okur. → { kur, bultenTarihi } ya da null
export function tcmbOku(xml) {
  const blok = /<Currency[^>]*(?:CurrencyCode|Kod)="USD"[^>]*>([\s\S]*?)<\/Currency>/.exec(xml);
  if (!blok) return null;
  const satis = /<ForexSelling>\s*([\d.,]+)\s*<\/ForexSelling>/.exec(blok[1]);
  const kur = satis ? Number(satis[1].replace(",", ".")) : NaN;
  if (!(kur > 0)) return null;
  const tarih = /Tarih="(\d{2}\.\d{2}\.\d{4})"/.exec(xml);
  return { kur, bultenTarihi: tarih ? tarih[1] : "" };
}
export async function kurGuncelle() {
  const r = await fetch(ayar.kurAdresi, { signal: AbortSignal.timeout(15000), headers: { accept: "application/xml" } });
  if (!r.ok) throw new Error("TCMB yanıtı: " + r.status);
  const v = tcmbOku(await r.text());
  if (!v) throw new Error("TCMB kur dosyası okunamadı");
  await sistem((q) => kurKaydet(q, bugun(), v.kur, `TCMB dolar satış${v.bultenTarihi ? " · " + v.bultenTarihi + " bülteni" : ""}`));
  return v;
}
export async function temizlik() {
  await sistem(async (q) => {
    await q("delete from oturumlar where bitis_at < now()");
    await q("delete from eposta_jetonlari where bitis_at < now() - interval '7 days'");
    await q("delete from davetler where bitis_at < now() - interval '30 days'");
    await q("delete from yukleme_taslaklari where olusturma_at < now() - interval '2 days'");
  });
}

let sonGece = "", sonKur = "";
async function tik() {
  const gun = bugun(), saat = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }));
  try {
    const dilim = gun + (saat >= 16 ? "b" : "a"); // TCMB yeni kuru 15.30'da açıklar: öğleden sonra bir kez daha al
    if (ayar.kurOtomatik && sonKur !== dilim) { await kurGuncelle(); sonKur = dilim; await sistem((q) => hepsiniHesapla(q)); }
  } catch (e) { console.error("kur alınamadı:", e.message); }
  try {
    if (saat >= 3 && saat < 6 && sonGece !== gun) { sonGece = gun; await temizlik(); await sistem((q) => hepsiniHesapla(q)); }
  } catch (e) { console.error("gece işi:", e.message); }
}
export function zamanlayiciBaslat() {
  setTimeout(tik, 5000).unref();
  setInterval(tik, 30 * 60 * 1000).unref();
}
