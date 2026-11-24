// İl / ilçe / mahalle listesini ve komşuluk tablolarını üretir. Bir kez (ya da kaynaklar güncellenince) çalıştırılır;
// çıktısı data/konum/ altına yazılır ve depoda durur. Sunucuda yeniden çalıştırmak gerekmez.
//
// Kaynaklar (kullanım: node scripts/konum-verisi-uret.mjs <kaynak-klasörü>):
//   provinces.json, districts.json, neighborhoods.json — ubeydeozdmr/turkiye-api 2025 veri seti (MIT lisansı;
//     dayandığı kaynaklar: TÜİK MEDAS, PTT, Harita Genel Müdürlüğü).
//   l6.geojson, l8.geojson — OpenStreetMap idari sınırları (ilçe = admin_level 6, mahalle = admin_level 8),
//     izzetkalic/geojsons-of-turkey derlemesi. © OpenStreetMap katkıcıları, ODbL 1.0.
// Komşuluk: iki sınır en az iki ortak köşe noktası paylaşıyorsa komşudur (OSM'de komşu sınırlar aynı çizgiyi kullanır).
import fs from "node:fs";
import path from "node:path";

const kaynak = process.argv[2];
if (!kaynak) { console.error("Kullanım: node scripts/konum-verisi-uret.mjs <kaynak-klasörü>"); process.exit(1); }
const hedef = path.join(import.meta.dirname, "..", "data", "konum");
const oku = (f) => JSON.parse(fs.readFileSync(path.join(kaynak, f), "utf8"));

const norm = (s) => String(s || "").toLocaleLowerCase("tr")
  .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const mahNorm = (s) => norm(s).replace(/\b(mahallesi|mah|koyu|mh)\b/g, "").replace(/\s+/g, "");

const iller = oku("provinces.json").map((p) => ({ id: p.id, ad: p.name })).sort((a, b) => a.id - b.id);
const ilceler = oku("districts.json").map((d) => ({ id: d.id, il_id: d.provinceId, ad: d.name }));
const mahalleler = oku("neighborhoods.json").map((m) => ({ id: m.id, ilce_id: m.districtId, ad: m.name }));

// ---- geometri yardımcıları ----
const halkalar = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
function icinde(pt, g) {
  for (const poly of halkalar(g)) {
    let ic = false;
    const dis = poly[0];
    for (let i = 0, j = dis.length - 1; i < dis.length; j = i++) {
      const [xi, yi] = dis[i], [xj, yj] = dis[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ic = !ic;
    }
    if (ic) return true;
  }
  return false;
}
const kutu = (g) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of halkalar(g)) for (const [x, y] of poly[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
};
// Poligonun içinde olduğu kesin bir nokta (kutunun ortasından geçen yatay çizginin ilk iç aralığı)
function icNokta(g) {
  const [a, b, c, d] = kutu(g);
  for (const oran of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = b + (d - b) * oran;
    const xs = [];
    for (const poly of halkalar(g)) for (const h of poly) for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
      const [xi, yi] = h[i], [xj, yj] = h[j];
      if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((p, q) => p - q);
    if (xs.length >= 2) return [(xs[0] + xs[1]) / 2, y];
  }
  return [(a + c) / 2, (b + d) / 2];
}
const anahtar = ([x, y]) => x.toFixed(6) + "," + y.toFixed(6);
function komsuluk(ogeler) {
  // ogeler: [{id, g}] → ortak köşesi olan çiftler
  const nokta = new Map();
  for (const o of ogeler) {
    const gorulen = new Set();
    for (const poly of halkalar(o.g)) for (const h of poly) for (const p of h) gorulen.add(anahtar(p));
    for (const k of gorulen) { let l = nokta.get(k); if (!l) nokta.set(k, (l = [])); l.push(o.id); }
  }
  const sayac = new Map();
  for (const l of nokta.values()) {
    if (l.length < 2) continue;
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      if (l[i] === l[j]) continue;
      const k = l[i] < l[j] ? l[i] + "|" + l[j] : l[j] + "|" + l[i];
      sayac.set(k, (sayac.get(k) || 0) + 1);
    }
  }
  return [...sayac.entries()].filter(([, n]) => n >= 2).map(([k]) => k.split("|").map(Number)).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

// ---- ilçeler: OSM poligonunu veri setindeki ilçeyle eşle (plaka kodu + ad) ----
const l6 = oku("l6.geojson").features.filter((f) => f.geometry.type !== "Point" && f.properties.name);
const ilceAnahtar = new Map(ilceler.map((d) => [d.il_id + ":" + norm(d.ad), d.id]));
const ilAdindan = new Map(iller.map((p) => [norm(p.ad), p.id]));
const ilcePoly = [];
let ilceEslesmeyen = 0;
for (const f of l6) {
  const m = /^TR(\d\d)/.exec(f.properties.network || "");
  let id = m ? ilceAnahtar.get(Number(m[1]) + ":" + norm(f.properties.name)) : undefined;
  if (!id) {
    // plaka kodu yoksa: adı tek bir ilçeye uyuyorsa onu al
    const adaylar = ilceler.filter((d) => norm(d.ad) === norm(f.properties.name));
    if (adaylar.length === 1) id = adaylar[0].id;
  }
  if (!id) { ilceEslesmeyen++; continue; }
  ilcePoly.push({ id, g: f.geometry, k: kutu(f.geometry) });
}
const ilceKomsu = komsuluk(ilcePoly);

// ---- mahalleler: poligonun iç noktası hangi ilçedeyse o ilçede adıyla ara ----
const l8 = oku("l8.geojson").features.filter((f) => f.geometry.type !== "Point" && f.properties.name);
const mahAnahtar = new Map();
for (const m of mahalleler) { const k = m.ilce_id + ":" + mahNorm(m.ad); mahAnahtar.set(k, mahAnahtar.has(k) ? null : m.id); }
const mahPoly = [];
const sinirliMahalle = new Set();
let mahEslesmeyen = 0;
for (const f of l8) {
  const pt = icNokta(f.geometry);
  const ilce = ilcePoly.find((d) => pt[0] >= d.k[0] && pt[0] <= d.k[2] && pt[1] >= d.k[1] && pt[1] <= d.k[3] && icinde(pt, d.g));
  const id = ilce ? mahAnahtar.get(ilce.id + ":" + mahNorm(f.properties.name)) : undefined;
  if (!id) { mahEslesmeyen++; continue; }
  if (sinirliMahalle.has(id)) continue;
  sinirliMahalle.add(id);
  mahPoly.push({ id, g: f.geometry });
}
const mahKomsu = komsuluk(mahPoly);

fs.mkdirSync(hedef, { recursive: true });
const yaz = (f, v) => fs.writeFileSync(path.join(hedef, f), JSON.stringify(v));
yaz("iller.json", iller.map((p) => [p.id, p.ad]));
yaz("ilceler.json", ilceler.sort((a, b) => a.id - b.id).map((d) => [d.id, d.il_id, d.ad]));
yaz("mahalleler.json", mahalleler.sort((a, b) => a.id - b.id).map((m) => [m.id, m.ilce_id, m.ad, sinirliMahalle.has(m.id) ? 1 : 0]));
yaz("ilce_komsu.json", ilceKomsu);
yaz("mahalle_komsu.json", mahKomsu);
fs.writeFileSync(path.join(hedef, "KAYNAK.md"), `# Konum verisi: kaynak ve lisans

Bu klasördeki dosyalar \`scripts/konum-verisi-uret.mjs\` ile üretildi (üretim tarihi: ${new Date().toISOString().slice(0, 10)}).

| Dosya | İçerik | Kaynak | Lisans |
| --- | --- | --- | --- |
| iller.json, ilceler.json, mahalleler.json | ${iller.length} il, ${ilceler.length} ilçe, ${mahalleler.length} mahalle adı | [turkiye-api](https://github.com/ubeydeozdmr/turkiye-api) 2025 veri seti (TÜİK MEDAS, PTT, Harita Genel Müdürlüğü verilerinden derlenmiş) | MIT |
| ilce_komsu.json | ${ilceKomsu.length} komşu ilçe çifti (${ilcePoly.length} ilçe sınırından) | OpenStreetMap idari sınırları, [geojsons-of-turkey](https://github.com/izzetkalic/geojsons-of-turkey) derlemesi | © OpenStreetMap katkıcıları, ODbL 1.0 |
| mahalle_komsu.json | ${mahKomsu.length} komşu mahalle çifti (${mahPoly.length} mahalle sınırından) | aynı | aynı |

Notlar:
- Mahalle sınırı OpenStreetMap'te her mahalle için çizilmiş değil. Sınırı bulunan mahalleler mahalleler.json'da
  dördüncü alanla (1) işaretli; diğerlerinde "komşu mahalle" basamağı çalışmaz, "aynı ilçe" puanı verilir.
  Eksik komşuluklar yönetim ekranından elle eklenebilir.
- Komşuluk, sınırların ortak köşe noktalarından hesaplanır; resmi belge yerine geçmez.
`);
console.log({ il: iller.length, ilce: ilceler.length, mahalle: mahalleler.length, ilcePoligon: ilcePoly.length, ilceEslesmeyen, ilceKomsu: ilceKomsu.length, mahPoligon: mahPoly.length, mahEslesmeyen, mahKomsu: mahKomsu.length });

// Hızlı sağlama: İzmir
const ad = (id) => ilceler.find((d) => d.id === id)?.ad;
const izmir = new Set(ilceler.filter((d) => d.il_id === 35).map((d) => d.id));
const ks = ilceler.find((d) => d.il_id === 35 && d.ad === "Karşıyaka").id;
console.log("Karşıyaka komşuları:", ilceKomsu.filter((c) => c.includes(ks)).map((c) => ad(c[0] === ks ? c[1] : c[0])).join(", "));
console.log("İzmir'de sınırı olan mahalle:", mahalleler.filter((m) => izmir.has(m.ilce_id) && sinirliMahalle.has(m.id)).length, "/", mahalleler.filter((m) => izmir.has(m.ilce_id)).length);
const bost = mahalleler.find((m) => m.ilce_id === ks && m.ad === "Bostanlı");
if (bost) console.log("Bostanlı komşuları:", mahKomsu.filter((c) => c.includes(bost.id)).map((c) => mahalleler.find((m) => m.id === (c[0] === bost.id ? c[1] : c[0])).ad).join(", "));
