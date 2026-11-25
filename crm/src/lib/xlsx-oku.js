// Excel (.xlsx) okuyucu: ek paket gerektirmeden sayfaları satır satır okur.
// .xlsx bir zip dosyasıdır; içindeki XML'lerden yalnızca hücre değerleri alınır (biçim, formül sonucu dışındakiler alınmaz).
import zlib from "node:zlib";

function zipAc(buf) {
  // Merkezi dizin kaydının sonunu bul
  let son = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { son = i; break; }
  }
  if (son < 0) throw new Error("Dosya bir Excel (.xlsx) dosyası değil.");
  const adet = buf.readUInt16LE(son + 10);
  let p = buf.readUInt32LE(son + 16);
  const dosyalar = new Map();
  for (let n = 0; n < adet; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Excel dosyası bozuk.");
    const yontem = buf.readUInt16LE(p + 10), boy = buf.readUInt32LE(p + 20);
    const adBoy = buf.readUInt16LE(p + 28), ekBoy = buf.readUInt16LE(p + 30), yorumBoy = buf.readUInt16LE(p + 32);
    const yerel = buf.readUInt32LE(p + 42);
    const ad = buf.subarray(p + 46, p + 46 + adBoy).toString("utf8");
    dosyalar.set(ad, { yontem, boy, yerel });
    p += 46 + adBoy + ekBoy + yorumBoy;
  }
  return (ad) => {
    const d = dosyalar.get(ad);
    if (!d) return null;
    const bas = d.yerel + 30 + buf.readUInt16LE(d.yerel + 26) + buf.readUInt16LE(d.yerel + 28);
    const veri = buf.subarray(bas, bas + d.boy);
    if (d.yontem === 0) return veri.toString("utf8");
    if (d.yontem === 8) return zlib.inflateRawSync(veri).toString("utf8");
    throw new Error("Excel dosyası desteklenmeyen biçimde sıkıştırılmış.");
  };
}

const varlik = (s) => s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, v) => {
  const k = v.toLowerCase();
  if (k === "lt") return "<"; if (k === "gt") return ">"; if (k === "quot") return '"'; if (k === "apos") return "'"; if (k === "amp") return "&";
  return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});
// <t> parçalarını birleştirir (zengin metin birden çok <t> içerebilir)
const metinler = (xml) => varlik([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
const nitelik = (etiket, ad) => (etiket.match(new RegExp(`\\s${ad}="([^"]*)"`)) || [])[1];

function sutunNo(ref) {
  const harf = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const h of harf) n = n * 26 + (h.charCodeAt(0) - 64);
  return n - 1;
}

// Dönen değer: { "Sayfa adı": [[hücre, hücre, ...], ...] } — hücreler metin ya da sayı, boşlar "".
export function xlsxOku(buf) {
  const oku = zipAc(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  const paylasilan = [];
  const ss = oku("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) paylasilan.push(metinler(m[1]));
  const kitap = oku("xl/workbook.xml") || "";
  const iliski = oku("xl/_rels/workbook.xml.rels") || "";
  const hedefler = new Map([...iliski.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [nitelik(m[0], "Id"), nitelik(m[0], "Target")]));
  const sonuc = {};
  for (const m of kitap.matchAll(/<sheet\b[^>]*>/g)) {
    const ad = varlik(nitelik(m[0], "name") || "");
    let hedef = hedefler.get(nitelik(m[0], "r:id")) || "";
    hedef = hedef.startsWith("/") ? hedef.slice(1) : "xl/" + hedef.replace(/^\.\//, "");
    const xml = oku(hedef);
    if (!xml) continue;
    const satirlar = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const satirNo = Number(nitelik(r[0], "r")) - 1;
      const satir = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = nitelik(" " + c[1], "r");
        const tur = nitelik(" " + c[1], "t");
        const ic = c[2] || "";
        let deger = "";
        if (tur === "s") deger = paylasilan[Number((ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1])] ?? "";
        else if (tur === "inlineStr") deger = metinler(ic);
        else {
          const v = (ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (v != null) deger = tur === "str" || tur === "e" ? varlik(v) : tur === "b" ? v === "1" : Number(v);
        }
        satir[ref ? sutunNo(ref) : satir.length] = deger;
      }
      for (let i = 0; i < satir.length; i++) if (satir[i] === undefined) satir[i] = "";
      satirlar[Number.isFinite(satirNo) && satirNo >= 0 ? satirNo : satirlar.length] = satir;
    }
    for (let i = 0; i < satirlar.length; i++) if (!satirlar[i]) satirlar[i] = [];
    sonuc[ad] = satirlar;
  }
  return sonuc;
}

// Başlık satırına göre satırları nesneye çevirir: [{ "Ad Soyad": "...", ... }]
export function sayfaNesneleri(satirlar) {
  if (!satirlar?.length) return [];
  const bas = satirlar[0].map((x) => String(x ?? "").trim());
  return satirlar.slice(1).map((r, i) => {
    const o = { _satir: i + 2 };
    bas.forEach((b, j) => { if (b) o[b] = typeof r[j] === "string" ? r[j].trim() : r[j] ?? ""; });
    return o;
  }).filter((o) => bas.some((b) => b && o[b] !== "" && o[b] != null));
}
