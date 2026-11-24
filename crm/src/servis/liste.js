// Eşleşme listeleri: bir mülkün alıcıları, bir talebin mülkleri, talebi olmayan adaylar.
// Sorgular isteği yapan kullanıcının kimliğiyle çalışır; kimin neyi göreceğini veritabanı kuralı belirler.
import { sirala, talepsizAday } from "../alan/eslestirme.js";
import { konumYukle, ayarlarAl, kurAl } from "./ortak.js";
import { mulkTarifi, talepTarifi, fiyatYaz } from "../gorunum/parcalar.js";

const isaretler = (r) => [r.potansiyel === "A" ? "A potansiyel" : null, r.bolgede_gorusuldu ? "bu ilçede daha önce görüşüldü" : null].filter(Boolean);

// Mülke uyan alıcılar. kapsam: "kendi" (mülk sahibinin kendi alıcıları) | "ekip" (başka danışmanların alıcıları; yalnızca yönetici görür)
export async function mulkunAlicilari(q, mulk, kapsam = "kendi") {
  const konum = await konumYukle();
  const satirlar = await q(
    `select e.talep_id, e.mulk_id, e.puan, e.sinif, e.ayrinti, e.durum, e.fiyat_dustu, e.ilk_at, e.ekip_durum, e.talep_sahip_id,
            t.kisi_id, t.butce_tarih, t.butce_para, t.butce_min_tutar, t.butce_max_tutar, t.bolgeler, t.alt_turler, t.kategoriler, t.kriterler, t.alici_tipi,
            k.ad as kisi_ad, k.potansiyel, k.mesaj_istemiyor,
            exists (select 1 from gorusmeler g where g.kisi_id = k.id and g.ilce_id = $2 and g.tur = 'gorusme') as bolgede_gorusuldu,
            (select max(ms.gonderildi_at) from mesajlar ms where ms.kisi_id = k.id and ms.mulk_id = e.mulk_id) as son_mesaj_at,
            (select numara from kisi_telefonlari kt where kt.kisi_id = k.id and kt.aktif order by kt.ana desc limit 1) as telefon
       from eslesmeler e join talepler t on t.id = e.talep_id join kisiler k on k.id = t.kisi_id
      where e.mulk_id = $1 and e.gecerli and e.durum <> 'reddedildi'
        and ${kapsam === "ekip" ? "e.talep_sahip_id <> e.mulk_sahip_id" : "e.talep_sahip_id = e.mulk_sahip_id"}`,
    [mulk.id, mulk.ilce_id]);
  return sirala(satirlar.map((r) => ({ ...r, ...r.ayrinti, ayrinti: r.ayrinti, isaretler: isaretler(r), talep_tarifi: talepTarifi(r, konum) })));
}

// Talebe uyan mülkler.
export async function talebinMulkleri(q, talep, kapsam = "kendi") {
  const konum = await konumYukle();
  const satirlar = await q(
    `select e.talep_id, e.mulk_id, e.puan, e.sinif, e.ayrinti, e.durum, e.fiyat_dustu, e.ilk_at, e.ekip_durum, e.mulk_sahip_id,
            m.kategori, m.alt_tur, m.ilce_id, m.mahalle_id, m.fiyat_tutar, m.fiyat_para, m.islem, m.ozellikler, m.baslik,
            (select max(ms.gonderildi_at) from mesajlar ms where ms.kisi_id = $2 and ms.mulk_id = e.mulk_id) as son_mesaj_at
       from eslesmeler e join mulkler m on m.id = e.mulk_id
      where e.talep_id = $1 and e.gecerli and e.durum <> 'reddedildi'
        and ${kapsam === "ekip" ? "e.talep_sahip_id <> e.mulk_sahip_id" : "e.talep_sahip_id = e.mulk_sahip_id"}`,
    [talep.id, talep.kisi_id]);
  return sirala(satirlar.map((r) => ({ ...r, ...r.ayrinti, ayrinti: r.ayrinti, mulk_tarifi: mulkTarifi(r, konum), fiyat_yazi: fiyatYaz(r) })));
}

// "Talebi yok ama alabilir": mülk sahibinin rehberinde, bu mülkle eşleşen açık talebi olmayan kişiler.
export async function talepsizAdaylar(q, mulk, sahipId, haricKisiler = []) {
  const [ayarlar, kur] = [await ayarlarAl(), await kurAl(q)];
  const kisiler = await q(
    `select k.id, k.ad, k.potansiyel, k.alim_gucu_usd, k.alim_gucu_tutar, k.alim_gucu_para, k.yatirimci_tipi, k.calisma_bolgeleri, k.calisma_kategorileri, k.mesaj_istemiyor,
            coalesce((select array_agg(distinct g.ilce_id) from gorusmeler g where g.kisi_id = k.id and g.tur = 'gorusme' and g.ilce_id is not null), '{}') as gorusme_ilceleri,
            coalesce((select array_agg(distinct g.ilce_id) from gorusmeler g where g.kisi_id = k.id and g.sonuc = 'aldi' and g.ilce_id is not null), '{}') as aldigi_ilceler,
            (select max(ms.gonderildi_at) from mesajlar ms where ms.kisi_id = k.id and ms.mulk_id = $3) as son_mesaj_at
       from kisiler k
      where k.sahip_id = $1 and k.silindi_at is null and not (k.id = any($2::uuid[]))
        and (k.id is distinct from $4)
        and (k.potansiyel = 'A' or k.yatirimci_tipi is not null or exists (select 1 from gorusmeler g where g.kisi_id = k.id and g.ilce_id = $5))`,
    [sahipId, haricKisiler, mulk.id || null, mulk.malik_kisi_id || null, mulk.ilce_id || null]);
  const liste = [];
  for (const k of kisiler) {
    const s = talepsizAday(k, mulk, { kur: kur?.usd_try, ayarlar });
    if (s) liste.push({ ...k, kisi_id: k.id, ...s });
  }
  return liste.sort((a, b) => (a.para_bilinmiyor ? 1 : 0) - (b.para_bilinmiyor ? 1 : 0) || b.nedenler.length - a.nedenler.length || a.ad.localeCompare(b.ad, "tr"));
}
