// Eşleşmelerin hesaplanıp saklanması. Hesap bütün ofis üzerinden, uygulamanın iç kimliğiyle yapılır;
// kimin hangi eşleşmeyi göreceğine veritabanındaki gizlilik kuralı karar verir (danışman yalnızca
// iki ucu da kendisine ait olan eşleşmeyi görür; ekip eşleşmeleri yalnızca yöneticilere açıktır).
import { eslestir } from "../alan/eslestirme.js";
import { konumYukle, ayarlarAl, kurAl } from "./ortak.js";

const TALEP_SQL = `
  select t.*, k.alim_gucu_usd, k.potansiyel
    from talepler t join kisiler k on k.id = t.kisi_id
   where t.silindi_at is null and k.silindi_at is null and t.durum = 'aktif'`;
const MULK_SQL = `select m.* from mulkler m where m.silindi_at is null and m.durum in ('aktif', 'opsiyonlu')`;
const talepHazirla = (t) => ({ ...t, kisi: { alim_gucu_usd: t.alim_gucu_usd, potansiyel: t.potansiyel } });

async function baglam(q) {
  const [konum, ayarlar, kur] = await Promise.all([konumYukle(), ayarlarAl(), kurAl(q)]);
  return { konum: konum.baglam, ayarlar, kur: kur?.usd_try || null };
}
async function yaz(q, talep, mulk, sonuc, { fiyatDustu = false } = {}) {
  const ayrinti = { parcalar: sonuc.parcalar, nedenler: sonuc.nedenler, notlar: sonuc.notlar, tahmin: sonuc.tahmin, butce: sonuc.butce, tavan_b: sonuc.tavan_b, para_bilinmiyor: sonuc.para_bilinmiyor, puansiz: sonuc.puansiz };
  await q(
    `insert into eslesmeler (talep_id, mulk_id, talep_sahip_id, mulk_sahip_id, puan, sinif, ayrinti, fiyat_dustu)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (talep_id, mulk_id) do update set
       puan = excluded.puan, sinif = excluded.sinif, ayrinti = excluded.ayrinti, guncelleme_at = now(),
       talep_sahip_id = excluded.talep_sahip_id, mulk_sahip_id = excluded.mulk_sahip_id,
       ilk_at = case when eslesmeler.gecerli then eslesmeler.ilk_at else now() end,
       durum = case when eslesmeler.gecerli or eslesmeler.durum = 'reddedildi' then eslesmeler.durum else 'yeni' end,
       fiyat_dustu = case when eslesmeler.gecerli then eslesmeler.fiyat_dustu else excluded.fiyat_dustu end,
       gecerli = true`,
    [talep.id, mulk.id, talep.sahip_id, mulk.sahip_id, sonuc.puan, sonuc.sinif, JSON.stringify(ayrinti), fiyatDustu]);
}

// Bir mülk kaydedildiğinde: bütün açık taleplerle karşılaştır.
export async function mulkIcinHesapla(q, mulkId, secenek = {}) {
  return q.sistem(async () => {
    const mulk = (await q(MULK_SQL + " and m.id = $1", [mulkId]))[0];
    if (!mulk) { await q("update eslesmeler set gecerli = false where mulk_id = $1 and gecerli", [mulkId]); return 0; }
    const ctx = await baglam(q);
    const talepler = await q(TALEP_SQL + " and t.islem = $1", [mulk.islem]);
    const uyan = [];
    for (const t of talepler) {
      const s = eslestir(talepHazirla(t), mulk, ctx);
      if (s) { await yaz(q, t, mulk, s, secenek); uyan.push(t.id); }
    }
    await q("update eslesmeler set gecerli = false where mulk_id = $1 and gecerli and not (talep_id = any($2::uuid[]))", [mulkId, uyan]);
    return uyan.length;
  });
}
// Bir talep kaydedildiğinde: bütün açık mülklerle karşılaştır.
export async function talepIcinHesapla(q, talepId) {
  return q.sistem(async () => {
    const t = (await q(TALEP_SQL + " and t.id = $1", [talepId]))[0];
    if (!t) { await q("update eslesmeler set gecerli = false where talep_id = $1 and gecerli", [talepId]); return 0; }
    const ctx = await baglam(q);
    const talep = talepHazirla(t);
    const mulkler = await q(MULK_SQL + " and m.islem = $1", [t.islem]);
    const uyan = [];
    for (const m of mulkler) {
      const s = eslestir(talep, m, ctx);
      if (s) { await yaz(q, t, m, s); uyan.push(m.id); }
    }
    await q("update eslesmeler set gecerli = false where talep_id = $1 and gecerli and not (mulk_id = any($2::uuid[]))", [talepId, uyan]);
    return uyan.length;
  });
}
// Kişinin alım gücü değişti ya da kişi silindi: bütün taleplerini ve mülklerini yeniden değerlendir.
export async function kisiIcinHesapla(q, kisiId) {
  const [talepler, mulkler] = await q.sistem(async () => [
    await q("select id from talepler where kisi_id = $1", [kisiId]),
    await q("select id from mulkler where malik_kisi_id = $1", [kisiId]),
  ]);
  for (const t of talepler) await talepIcinHesapla(q, t.id);
  for (const m of mulkler) await mulkIcinHesapla(q, m.id);
}
// Her gece (kur değiştiği için) ve ayarlar değişince: her şeyi baştan hesapla.
export async function hepsiniHesapla(q) {
  return q.sistem(async () => {
    const ctx = await baglam(q);
    const talepler = (await q(TALEP_SQL)).map(talepHazirla);
    const mulkler = await q(MULK_SQL);
    const uyan = new Set();
    for (const m of mulkler) for (const t of talepler) {
      if (t.islem !== m.islem) continue;
      const s = eslestir(t, m, ctx);
      if (s) { await yaz(q, t, m, s); uyan.add(t.id + "|" + m.id); }
    }
    const mevcut = await q("select talep_id, mulk_id from eslesmeler where gecerli");
    for (const e of mevcut) if (!uyan.has(e.talep_id + "|" + e.mulk_id)) await q("update eslesmeler set gecerli = false where talep_id = $1 and mulk_id = $2", [e.talep_id, e.mulk_id]);
    return uyan.size;
  });
}
// Kaydedilmemiş bir mülk tarifi için (ana ekrandaki "kim alır?" düğmesi): yalnızca soranın kendi talepleri.
export async function taslakMulkIcinBul(q, mulk, sahipId) {
  const ctx = await baglam(q);
  const talepler = await q(TALEP_SQL + " and t.islem = $1 and t.sahip_id = $2", [mulk.islem, sahipId]);
  const liste = [];
  for (const t of talepler) {
    const s = eslestir(talepHazirla(t), mulk, ctx);
    if (s) liste.push({ talep: t, ...s });
  }
  return { liste, ctx };
}
