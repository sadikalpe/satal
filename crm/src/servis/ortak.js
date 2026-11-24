// Ortak hizmetler: konum (il / ilçe / mahalle ve komşuluk), ayarlar, kur ve işlem kaydı.
import { sistem } from "../db.js";
import { konumBaglami, VARSAYILAN_AYAR } from "../alan/eslestirme.js";
import { bugun } from "../lib/metin.js";

// ---------- Konum (bellekte tutulur; yönetici komşuluk eklerse yenilenir) ----------
let konumOnbellek = null;
export async function konumYukle(zorla = false) {
  if (konumOnbellek && !zorla) return konumOnbellek;
  konumOnbellek = await sistem(async (q) => {
    const iller = await q("select id, ad from iller order by ad collate \"C\"");
    const ilceler = await q("select id, il_id, ad from ilceler");
    const mahalleler = await q("select id, ilce_id, ad, sinir_var from mahalleler");
    const ik = await q("select a, b from ilce_komsu");
    const mk = await q("select a, b from mahalle_komsu");
    const tr = (a, b) => a.ad.localeCompare(b.ad, "tr");
    iller.sort(tr); ilceler.sort(tr); mahalleler.sort(tr);
    const ilM = new Map(iller.map((x) => [x.id, x])), ilceM = new Map(ilceler.map((x) => [x.id, x])), mahM = new Map(mahalleler.map((x) => [x.id, x]));
    const ilcelerIl = new Map(), mahallelerIlce = new Map();
    for (const d of ilceler) { if (!ilcelerIl.has(d.il_id)) ilcelerIl.set(d.il_id, []); ilcelerIl.get(d.il_id).push(d); }
    for (const m of mahalleler) { if (!mahallelerIlce.has(m.ilce_id)) mahallelerIlce.set(m.ilce_id, []); mahallelerIlce.get(m.ilce_id).push(m); }
    return {
      iller, ilM, ilceM, mahM, ilcelerIl, mahallelerIlce,
      baglam: konumBaglami(ik.map((r) => [r.a, r.b]), mk.map((r) => [r.a, r.b])),
      ilAdi: (id) => ilM.get(id)?.ad || "",
      ilceAdi: (id) => ilceM.get(id)?.ad || "",
      mahalleAdi: (id) => mahM.get(id)?.ad || "",
      // "Karşıyaka Bostanlı" / "Urla"
      yerAdi: (ilce, mahalle) => [ilceM.get(ilce)?.ad, mahM.get(mahalle)?.ad].filter(Boolean).join(" "),
    };
  });
  return konumOnbellek;
}

// ---------- Ayarlar ----------
let ayarOnbellek = null;
export async function ayarlarAl(zorla = false) {
  if (ayarOnbellek && !zorla) return ayarOnbellek;
  const satirlar = await sistem((q) => q("select anahtar, deger from ayarlar"));
  const a = structuredClone(VARSAYILAN_AYAR);
  for (const s of satirlar) {
    if (s.anahtar in a && a[s.anahtar] && typeof a[s.anahtar] === "object") a[s.anahtar] = birlestir(a[s.anahtar], s.deger);
    else a[s.anahtar] = s.deger;
  }
  ayarOnbellek = a;
  return a;
}
function birlestir(temel, ust) {
  const c = { ...temel };
  for (const [k, v] of Object.entries(ust || {})) c[k] = v && typeof v === "object" && !Array.isArray(v) ? birlestir(temel[k] || {}, v) : v;
  return c;
}
export async function ayarYaz(q, anahtar, deger, kullaniciId) {
  await q.sistem(() => q(
    `insert into ayarlar (anahtar, deger, guncelleyen) values ($1, $2, $3)
     on conflict (anahtar) do update set deger = excluded.deger, guncelleyen = excluded.guncelleyen, guncelleme_at = now()`,
    [anahtar, JSON.stringify(deger), kullaniciId]));
  ayarOnbellek = null;
}
export const onbellekTemizle = () => { ayarOnbellek = null; konumOnbellek = null; };

// ---------- Kur ----------
// Geçerli kur: bugüne kadar alınmış en son TCMB dolar satış kuru.
export async function kurAl(q) {
  return q.bir("select tarih, usd_try, kaynak from kurlar where tarih <= $1 order by tarih desc limit 1", [bugun()]);
}
export async function kurKaydet(q, tarih, usdTry, kaynak) {
  await q.sistem(() => q(
    `insert into kurlar (tarih, usd_try, kaynak) values ($1, $2, $3)
     on conflict (tarih) do update set usd_try = excluded.usd_try, kaynak = excluded.kaynak, alindi_at = now()`, [tarih, usdTry, kaynak]));
}
// TL girilen tutarı girildiği günün kuruyla dolara sabitler. Tutar değişmediyse eski kur ve tarih korunur.
export function dolaraSabitle({ tutar, para, kur, onceki }) {
  if (tutar == null) return { usd: null, kur: null, tarih: null };
  if (para === "USD") return { usd: tutar, kur: null, tarih: bugun() };
  if (onceki && onceki.para === "TRY" && onceki.kur && Math.round(onceki.tutar) === Math.round(tutar)) return { usd: onceki.usd, kur: onceki.kur, tarih: onceki.tarih };
  if (!(kur?.usd_try > 0)) throw new KullaniciHatasi("Bugünün dolar kuru henüz alınamadı. Tutarı dolar olarak girin ya da yöneticiye haber verin.");
  return { usd: Math.round(tutar / kur.usd_try), kur: kur.usd_try, tarih: bugun() };
}

// ---------- İşlem kaydı: kim, ne zaman, ne yaptı ----------
export async function kaydet(q, req, eylem, hedefTur = null, hedefId = null, ayrinti = {}) {
  await q("insert into islem_kaydi (kullanici_id, eylem, hedef_tur, hedef_id, ayrinti, ip) values ($1, $2, $3, $4, $5, $6)",
    [req?.kullanici?.id || null, eylem, hedefTur, hedefId == null ? null : String(hedefId), JSON.stringify(ayrinti), req?.ip || ""]);
}

// Kullanıcıya gösterilecek, beklenen hatalar (yanlış giriş, eksik alan vb.)
export class KullaniciHatasi extends Error {
  constructor(mesaj, kod = 400) { super(mesaj); this.kod = kod; this.kullaniciya = true; }
}
export const yoneticiMi = (k) => k && (k.rol === "yonetici" || k.rol === "sahip");
export const sahipMi = (k) => k && k.rol === "sahip";

// Liste ekranlarında "kimin kayıtları": danışman her zaman kendi kayıtlarını görür; yönetici kendi, herkes ya da tek bir danışman seçebilir.
export function kapsamOku(req) {
  const k = req.kullanici, s = String(req.query?.kimin || "ben");
  if (!yoneticiMi(k) || s === "ben") return { kimin: "ben", sahipId: k.id };
  if (s === "hepsi") return { kimin: "hepsi", sahipId: null };
  return /^[0-9a-f-]{36}$/i.test(s) ? { kimin: s, sahipId: s } : { kimin: "ben", sahipId: k.id };
}
// Yöneticinin göreceği danışman adları (id → { id, ad, foto })
export async function danismanlarAl(q, req) {
  if (!yoneticiMi(req.kullanici)) return new Map();
  const l = await q("select id, ad, foto_yol, durum from kullanicilar where durum in ('aktif', 'kapali') order by ad");
  return new Map(l.map((d) => [d.id, { id: d.id, ad: d.ad || "(adsız)", foto: !!d.foto_yol, durum: d.durum }]));
}
// Türkçe harf duyarsız arama için SQL parçası
export const adNormSql = (sutun) => `lower(translate(${sutun}, 'ÇĞİIÖŞÜçğıöşü', 'cgiiosucgiosu'))`;
