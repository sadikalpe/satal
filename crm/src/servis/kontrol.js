// Kontrol listesi: danışmanın kendi kayıtlarında açık kalan sorular.
//   1) Getireni / tanıştıranı yalnızca adla yazılmış, rehberdeki bir kişiye bağlanmamış kayıtlar ("bu kim?")
//   2) Teyit bekleyen varsayımlar (kontrol notu)
// Bütün sorgular yalnızca danışmanın kendi kayıtlarına bakar; yönetici de burada yalnızca kendi kayıtlarını görür.
import { KullaniciHatasi, kaydet } from "./ortak.js";
import { BAG_DURUMU, YANLIS_NOTU, adAnahtari, adaylariBul } from "../alan/kontrol.js";

// Ana ekrandaki sayaç: kim = yanıt bekleyen "bu kim?" kayıtları, teyit = kontrol notu olan kayıtlar
export async function kontrolSayilari(q, sahipId) {
  return q.bir(
    `select (select count(*) from mulkler where sahip_id = $1 and silindi_at is null and kaynak_kisi_id is null and kaynak_notu <> '' and kaynak_durumu is null)
          + (select count(*) from kisiler where sahip_id = $1 and silindi_at is null and referans_kisi_id is null and referans_notu <> '' and referans_durumu is null) as kim,
            (select count(*) from mulkler where sahip_id = $1 and silindi_at is null and kontrol_notu <> '')
          + (select count(*) from kisiler where sahip_id = $1 and silindi_at is null and kontrol_notu <> '')
          + (select count(*) from gorusmeler g join kisiler k on k.id = g.kisi_id where g.sahip_id = $1 and g.kontrol_notu <> '' and k.silindi_at is null) as teyit`, [sahipId]);
}

// Rehbere bağlanmamış getiren / tanıştıran notları. durum: null (yanıt bekliyor) ya da 'bilinmiyor' (hatırlanmıyor).
// "Rehberde yok" denenler kapanmış sayılır, listeye girmez.
export async function bagsizKayitlar(q, sahipId) {
  const mulkler = await q(
    `select 'm' as tur, m.id, m.kaynak_notu as notu, m.kaynak_durumu as durum, m.baslik, m.islem, m.kategori, m.alt_tur, m.ilce_id, m.mahalle_id, m.ozellikler, m.durum as mulk_durumu, m.olusturma_at
       from mulkler m where m.sahip_id = $1 and m.silindi_at is null and m.kaynak_kisi_id is null and m.kaynak_notu <> '' and m.kaynak_durumu is distinct from 'rehberde_yok'
      order by m.olusturma_at desc, m.id`, [sahipId]);
  const kisiler = await q(
    `select 'k' as tur, k.id, k.referans_notu as notu, k.referans_durumu as durum, k.ad
       from kisiler k where k.sahip_id = $1 and k.silindi_at is null and k.referans_kisi_id is null and k.referans_notu <> '' and k.referans_durumu is distinct from 'rehberde_yok'
      order by k.ad, k.id`, [sahipId]);
  return [...mulkler, ...kisiler];
}

// Teyit bekleyen kayıtlar: kişi, mülk ve geçmiş görüşme
export async function teyitBekleyenler(q, sahipId) {
  return {
    mulkler: await q(
      `select m.id, m.kontrol_notu, m.baslik, m.islem, m.kategori, m.alt_tur, m.ilce_id, m.mahalle_id, m.ozellikler, m.durum
         from mulkler m where m.sahip_id = $1 and m.silindi_at is null and m.kontrol_notu <> '' order by m.olusturma_at desc, m.id`, [sahipId]),
    kisiler: await q("select k.id, k.ad, k.kontrol_notu from kisiler k where k.sahip_id = $1 and k.silindi_at is null and k.kontrol_notu <> '' order by k.ad, k.id", [sahipId]),
    gorusmeler: await q(
      `select g.id, g.kisi_id, g.kontrol_notu, g.notu, g.tarih, g.tarih_yaklasik, g.ilce_id, g.mahalle_id, k.ad as kisi_ad
         from gorusmeler g join kisiler k on k.id = g.kisi_id where g.sahip_id = $1 and g.kontrol_notu <> '' and k.silindi_at is null
        order by k.ad, g.tarih desc nulls last, g.id`, [sahipId]),
  };
}

// Aday önerisi için danışmanın rehberi (yalnızca ad) ve önerilen kişilerin ana telefonu
export const rehberAdlari = (q, sahipId) => q("select id, ad from kisiler where sahip_id = $1 and silindi_at is null", [sahipId]);
export async function telefonlariEkle(q, kisiler) {
  if (!kisiler.length) return kisiler;
  const t = await q("select distinct on (kisi_id) kisi_id, numara from kisi_telefonlari where kisi_id = any($1::uuid[]) and aktif order by kisi_id, ana desc, numara", [kisiler.map((k) => k.id)]);
  const m = new Map(t.map((x) => [x.kisi_id, x.numara]));
  return kisiler.map((k) => ({ ...k, telefon: m.get(k.id) || "" }));
}

// Tek bir kaydın getireni / tanıştıranı için rehberden adaylar (kişi ve mülk kartında). haricId: kişinin kendisi önerilmez.
export async function adaylariAl(q, sahipId, notu, haricId = null) {
  const rehber = (await rehberAdlari(q, sahipId)).filter((k) => k.id !== haricId);
  return telefonlariEkle(q, adaylariBul(rehber, adAnahtari(notu)).map((k) => ({ id: k.id, ad: k.ad })));
}

// "m:<id>" / "k:<id>" / "g:<id>" → { m: [...], k: [...], g: [...] }
export function kayitlariAyir(degerler, izinli = "mk") {
  const c = { m: [], k: [], g: [] };
  for (const d of degerler) {
    const e = /^([mkg]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String(d));
    if (e && izinli.includes(e[1]) && !c[e[1]].includes(e[2])) c[e[1]].push(e[2]);
  }
  return c;
}

// Seçilen kayıtların getireni / tanıştıranı rehberdeki kişiye bağlanır. Not olduğu gibi kalır.
export async function rehbereBagla(q, req, kayitlar, kisiId) {
  const ben = req.kullanici.id;
  if (!(await q.bir("select 1 from kisiler where id = $1 and sahip_id = $2 and silindi_at is null", [kisiId, ben]))) throw new KullaniciHatasi("Seçtiğiniz kişi rehberinizde bulunamadı.");
  const m = await q(
    `update mulkler set kaynak_kisi_id = $3, kaynak_durumu = null, guncelleme_at = now()
      where id = any($1::uuid[]) and sahip_id = $2 and silindi_at is null and kaynak_kisi_id is null returning id`, [kayitlar.m, ben, kisiId]);
  // Kişi kendisinin tanıştıranı olamaz
  const k = await q(
    `update kisiler set referans_kisi_id = $3, referans_durumu = null, guncelleme_at = now()
      where id = any($1::uuid[]) and id <> $3 and sahip_id = $2 and silindi_at is null and referans_kisi_id is null returning id`, [kayitlar.k, ben, kisiId]);
  if (m.length + k.length) await kaydet(q, req, "kontrol_baglandi", "kisi", kisiId, { mulk: m.length, kisi: k.length });
  return m.length + k.length;
}

// "Rehberimde yok" ya da "hatırlamıyorum": kayıt adıyla kalır
export async function bagDurumuYaz(q, req, kayitlar, durum) {
  if (!(durum in BAG_DURUMU)) throw new KullaniciHatasi("Geçersiz seçim.");
  const ben = req.kullanici.id;
  const m = await q("update mulkler set kaynak_durumu = $3, guncelleme_at = now() where id = any($1::uuid[]) and sahip_id = $2 and silindi_at is null and kaynak_kisi_id is null and kaynak_notu <> '' returning id", [kayitlar.m, ben, durum]);
  const k = await q("update kisiler set referans_durumu = $3, guncelleme_at = now() where id = any($1::uuid[]) and sahip_id = $2 and silindi_at is null and referans_kisi_id is null and referans_notu <> '' returning id", [kayitlar.k, ben, durum]);
  if (m.length + k.length) await kaydet(q, req, "kontrol_yanitlandi", null, null, { durum, mulk: m.length, kisi: k.length });
  return m.length + k.length;
}

// "Kontrol ettim": teyit notu silinir. İşlem kaydına notun metni yazılmaz: içinde kişi adı geçebilir,
// kişi kalıcı silinince kayıtta kalmamalı.
export async function teyitTamam(q, req, kayitlar) {
  const ben = req.kullanici.id;
  const sil = (tablo, idler, kosul) => (idler.length
    ? q(`update ${tablo} set kontrol_notu = '' where id = any($1::uuid[]) and sahip_id = $2 and kontrol_notu <> ''${kosul} returning id`, [idler, ben]) : []);
  const biten = [
    ...(await sil("mulkler", kayitlar.m, " and silindi_at is null")).map((x) => ["mulk", x.id]),
    ...(await sil("kisiler", kayitlar.k, " and silindi_at is null")).map((x) => ["kisi", x.id]),
    ...(await sil("gorusmeler", kayitlar.g, "")).map((x) => ["gorusme", x.id]),
  ];
  for (const [tur, id] of biten) await kaydet(q, req, "kontrol_edildi", tur, id);
  return biten.length;
}

// Geçmiş görüşmedeki varsayım yanlış çıktı: kayıt silinmez (not sistem sahibinde de durur), ama yeri boşaltılır;
// böylece görüşme "bu ilçede daha önce ilgilenmişti" diye öneri üretmez. Notun sonuna ne olduğu yazılır.
export async function gorusmeYanlis(q, req, id) {
  const g = await q.bir(
    `update gorusmeler set ilce_id = null, mahalle_id = null, kontrol_notu = '',
            notu = left(notu || case when notu = '' then '' else E'\n' end || $3 || kontrol_notu || ')', 2000)
      where id = $1 and sahip_id = $2 and kontrol_notu <> '' returning kisi_id`, [id, req.kullanici.id, YANLIS_NOTU]);
  if (g) await kaydet(q, req, "kontrol_yanlis", "gorusme", id);
  return g;
}
