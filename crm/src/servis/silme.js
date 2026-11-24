// Silme. Danışman sildiğinde kayıt onun için silinmiş olur; kayıt notlarıyla birlikte yalnızca sistem sahibinde kalır.
// Aynı numara yeniden eklenirse sıfırdan yeni kayıt açılır (eski kayıt geri gelmez).
import { KullaniciHatasi, kaydet, sahipMi } from "./ortak.js";
import { dosyaSil } from "./dosya.js";

const silebilir = (req, kayit) => kayit && !kayit.silindi_at && (kayit.sahip_id === req.kullanici.id || sahipMi(req.kullanici));

export async function kisiSil(q, req, kisiId) {
  const k = await q.bir("select id, sahip_id, silindi_at from kisiler where id = $1", [kisiId]);
  if (!silebilir(req, k)) throw new KullaniciHatasi("Bu kaydı silemezsiniz.", 403);
  await q.sistem(async () => {
    const ben = req.kullanici.id;
    await q("update kisiler set silindi_at = now(), silen_id = $2 where id = $1", [kisiId, ben]);
    await q("update kisi_telefonlari set aktif = false where kisi_id = $1", [kisiId]);
    await q("update talepler set silindi_at = now(), silen_id = $2 where kisi_id = $1 and silindi_at is null", [kisiId, ben]);
    await q("update mulkler set silindi_at = now(), silen_id = $2 where malik_kisi_id = $1 and silindi_at is null", [kisiId, ben]);
    await q("update hatirlatmalar set tamamlandi_at = now() where kisi_id = $1 and tamamlandi_at is null", [kisiId]);
    await q(`update eslesmeler set gecerli = false where gecerli and (talep_id in (select id from talepler where kisi_id = $1) or mulk_id in (select id from mulkler where malik_kisi_id = $1))`, [kisiId]);
    await kaydet(q, req, "kisi_silindi", "kisi", kisiId);
  });
}
export async function mulkSil(q, req, mulkId) {
  const m = await q.bir("select id, sahip_id, silindi_at from mulkler where id = $1", [mulkId]);
  if (!silebilir(req, m)) throw new KullaniciHatasi("Bu kaydı silemezsiniz.", 403);
  await q.sistem(async () => {
    await q("update mulkler set silindi_at = now(), silen_id = $2 where id = $1", [mulkId, req.kullanici.id]);
    await q("update eslesmeler set gecerli = false where mulk_id = $1 and gecerli", [mulkId]);
    await kaydet(q, req, "mulk_silindi", "mulk", mulkId);
  });
}
export async function talepSil(q, req, talepId) {
  const t = await q.bir("select id, sahip_id, silindi_at from talepler where id = $1", [talepId]);
  if (!silebilir(req, t)) throw new KullaniciHatasi("Bu kaydı silemezsiniz.", 403);
  await q.sistem(async () => {
    await q("update talepler set silindi_at = now(), silen_id = $2 where id = $1", [talepId, req.kullanici.id]);
    await q("update eslesmeler set gecerli = false where talep_id = $1 and gecerli", [talepId]);
    await kaydet(q, req, "talep_silindi", "talep", talepId);
  });
}

// Kalıcı silme ("beni silin" talebi, KVKK): yalnızca sistem sahibi. Kişinin bütün verisi ve dosyaları geri dönüşsüz silinir;
// geriye yalnızca silme işleminin yapıldığını gösteren, kişi bilgisi içermeyen bir kayıt kalır.
export async function kisiKaliciSil(q, req, kisiId, neden) {
  if (!sahipMi(req.kullanici)) throw new KullaniciHatasi("Bu işlemi yalnızca sistem sahibi yapabilir.", 403);
  const dosyalar = [];
  await q.sistem(async () => {
    const k = await q.bir("select id from kisiler where id = $1", [kisiId]);
    if (!k) throw new KullaniciHatasi("Kayıt bulunamadı.", 404);
    const mulkler = (await q("select id from mulkler where malik_kisi_id = $1", [kisiId])).map((m) => m.id);
    dosyalar.push(...(await q("select depo_yolu from belgeler where kisi_id = $1 or mulk_id = any($2::uuid[])", [kisiId, mulkler])).map((b) => b.depo_yolu));
    const talepSayisi = (await q("delete from talepler where kisi_id = $1 returning id", [kisiId])).length;
    await q("delete from mulkler where id = any($1::uuid[])", [mulkler]);
    await q("delete from kisiler where id = $1", [kisiId]);
    await q("delete from islem_kaydi where hedef_tur = 'kisi' and hedef_id = $1", [kisiId]);
    await q("insert into kalici_silme_kaydi (yapan_id, neden, ozet) values ($1, $2, $3)", [req.kullanici.id, neden, JSON.stringify({ talep: talepSayisi, mulk: mulkler.length, belge: dosyalar.length })]);
  });
  return dosyalar;
}
export async function dosyalariSil(yollar) { for (const y of yollar) await dosyaSil(y).catch(() => {}); }
