// Kontrol listesinin arayüzden bağımsız kısmı: "kimden geldi" / "kim tanıştırdı" notunda yazılı adı çıkarır,
// aynı kişiye ait olması muhtemel notları tek öbekte toplar ve rehberden aday önerir.
// Örnek: "Feride Hanım", "Feride Hanım üzerinden" ve "Feride'nin arkadaşı" aynı öbeğe düşer; anahtarları "feride"dir.
import { norm } from "../lib/metin.js";

// Rehbere bağlanmamış getiren / tanıştıran için danışmanın verdiği yanıt
export const BAG_DURUMU = { rehberde_yok: "rehberde yok", bilinmiyor: "kim olduğu bilinmiyor" };

// "Varsayım yanlış çıktı" denince görüşme notunun sonuna eklenen açıklamanın başı. Toplu aktarım da buna bakar:
// yanlış çıktığı işaretlenen görüşme, kitap yeniden yüklenince eski varsayımıyla geri gelmez.
export const YANLIS_NOTU = "(Kontrol edildi, yanlış çıktı: ";

// Adın parçası olmayan sözcükler: unvanlar, bağlantı sözleri, yakınlık bildirenler
const UNVAN = "bey hanim abi abla amca teyze dayi dede hoca hocam usta efendi".split(" ");
const ATLA = new Set([...UNVAN, ...`
  uzerinden yonlendirdi tanistirdi tavsiye etti verdi getirdi gonderdi onerdi soyledi geldi taniyor tanir iyi ile ve de da ya diye
  irtibat irtibati araciligiyla vasitasiyla sayesinde referansi yer aldi satti is
  sahibi sahibinin emlakci arkadasi akrabasi yegeni musterisi tanidigi esi kardesi damadi yardimcisi dayisi oglu kizi kuzeni komsusu
  yatirimcisi ortagi babasi annesi amcasi abisi ablasi kiracisi`.split(/\s+/).filter(Boolean)]);
// Kesme imi konmadan ek almış unvan da addan sayılmaz: "Feride hanımın yeğeni", "Zühtü abiden". [1] unvan, [2] eki
const EKLI_UNVAN = new RegExp(`^(${UNVAN.join("|")})(n?[iu]n|y?[ae]|[dt][ae]n|y?l[ae])$`);

// Notun sözcükleri: yazi = yazıldığı gibi (kesme iminden sonraki ek atılmış), n = karşılaştırma biçimi. Ayraç içi açıklamadır, atılır.
const ayracsiz = (notu) => String(notu || "").replace(/\([^)]*\)/g, " ");
const sozcukleriAl = (notu) => ayracsiz(notu).split(/[^\p{L}\p{N}'’]+/u).filter(Boolean)
  .map((ham) => { const yazi = ham.replace(/['’].*$/, ""); return { yazi, n: norm(yazi) }; });

// "Feride Hanım'ın (emlakçı) arkadaşı" → "feride". Ad çıkmıyorsa notun kendisi anahtar olur (her not kendi öbeğinde kalır).
export function adAnahtari(notu) {
  const anahtar = [];
  for (const { n } of sozcukleriAl(notu)) {
    if (n.length < 2 || ATLA.has(n) || EKLI_UNVAN.test(n) || anahtar.includes(n)) continue;
    anahtar.push(n);
  }
  return anahtar.slice(0, 3).join(" ") || norm(ayracsiz(notu));
}

// Öbek başlığında gösterilecek ad: anahtardaki sözcükler notta yazıldığı biçimde, hemen ardından geliyorsa unvanıyla.
// "Feride Hanım'ın (emlakçı) yeğeni" → "Feride Hanım";  "Zühtü abinin arkadaşı" → "Zühtü abi";  "Feride üzerinden" → "Feride"
export function adYaz(notu) {
  const kalan = new Set(adAnahtari(notu).split(" ")), yazilan = [];
  let sonAd = false;
  for (const { yazi, n } of sozcukleriAl(notu)) {
    const ek = EKLI_UNVAN.exec(n);
    if (sonAd && (UNVAN.includes(n) || ek)) yazilan.push(ek ? yazi.slice(0, -ek[2].length) : yazi);   // adın hemen ardındaki unvan
    sonAd = kalan.delete(n);
    if (sonAd) yazilan.push(yazi);
    else if (!kalan.size) break;
  }
  return yazilan.join(" ") || String(notu || "").trim();
}

// kayitlar: [{ notu, ... }] → [{ anahtar, baslik, kayitlar }]; en çok kayıtlı öbek üstte.
// Başlık, adın öbekte en sık yazılan biçimi; eşitlikte en kısası ("Feride Hanım üzerinden" ile "Feride Hanım" → "Feride Hanım").
export function obekle(kayitlar) {
  const obekler = new Map();
  for (const k of kayitlar) {
    const anahtar = adAnahtari(k.notu);
    if (!obekler.has(anahtar)) obekler.set(anahtar, { anahtar, kayitlar: [] });
    obekler.get(anahtar).kayitlar.push(k);
  }
  for (const o of obekler.values()) {
    const sayim = new Map();
    for (const k of o.kayitlar) { const ad = adYaz(k.notu); sayim.set(ad, (sayim.get(ad) || 0) + 1); }
    o.baslik = [...sayim.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], "tr"))[0][0];
  }
  return [...obekler.values()].sort((a, b) => b.kayitlar.length - a.kayitlar.length || a.anahtar.localeCompare(b.anahtar, "tr"));
}

// rehber: [{ id, ad }] → anahtardaki her sözcüğü adında taşıyan kişiler (en çok `sinir` tane, kısa ad üstte).
// Sözcükler tam sözcük olarak aranır: "ali" anahtarı "Halil"i önermez.
export function adaylariBul(rehber, anahtar, sinir = 6) {
  const sozcukler = anahtar.split(" ").filter((s) => s.length >= 2);
  if (!sozcukler.length) return [];
  const uyan = [];
  for (const k of rehber) {
    const ad = (k.adNorm ??= " " + norm(k.ad).replace(/[^a-z0-9]+/g, " ") + " ");
    if (sozcukler.every((s) => ad.includes(" " + s + " "))) uyan.push(k);
  }
  return uyan.sort((a, b) => a.ad.length - b.ad.length || a.ad.localeCompare(b.ad, "tr")).slice(0, sinir);
}
