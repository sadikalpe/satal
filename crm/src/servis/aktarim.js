// Toplu aktarımın veritabanına yazan kısmı: aktarimHazirla'nın çıkardığı planı kayda çevirir.
// Sistem kimliğiyle açılmış tek bir işlemin (q) içinde çağrılır; bir hata çıkarsa çağıran işlemi geri alır, hiçbir şey yazılmaz.
// Kurallar:
// - Danışmanın rehberinde zaten olan numara yeniden eklenmez. Kayıtlı kişide yalnızca BOŞ olan alanlar doldurulur;
//   danışmanın Satal'da yazdığı hiçbir şeyin üstüne yazılmaz.
// - Aynı kitap ikinci kez yüklenirse aynı talep, mülk, geçmiş ilgi ve hatırlatma yeniden açılmaz (danışman o arada silmiş olsa bile).
// - Kontrol listesi: kitaptaki "Kontrol" notu yalnızca YENİ açılan kayda yazılır. Rehberde zaten olan kişiye yazılmaz;
//   yoksa danışmanın "kontrol ettim" dediği soru yeniden yüklemede geri gelirdi.
import { kurAl, dolaraSabitle } from "./ortak.js";
import { YANLIS_NOTU } from "../alan/kontrol.js";
import { hepsiniHesapla } from "./eslesme.js";
import { bugun } from "../lib/metin.js";

export async function aktarimYaz(q, plan, { dosyaAdi = "", deneme = false } = {}) {
  const epostalar = [...new Set([...plan.kisiler.map((k) => k.danisman), ...plan.mulkler.map((m) => m.danisman)])];
  const hesaplar = new Map((await q("select id, eposta::text as eposta from kullanicilar where eposta = any($1::citext[])", [epostalar])).map((u) => [u.eposta.toLowerCase(), u]));
  const eksik = epostalar.filter((e) => !hesaplar.has(e));
  if (eksik.length) throw new Error("Satal'da hesabı olmayan danışman: " + eksik.join(", ") + ". Önce giriş yapsınlar.");

  // Danışmanın rehberindeki numaralar
  const kayitli = new Map();
  for (const t of await q("select sahip_id, numara, kisi_id from kisi_telefonlari where aktif and sahip_id = any($1::uuid[])", [[...hesaplar.values()].map((u) => u.id)])) {
    kayitli.set(t.sahip_id + "|" + t.numara, t.kisi_id);
  }
  const kur = await kurAl(q), gun = bugun();
  // kim: kontrol listesine "bu kim?" diye giren kayıt (getireni / tanıştıranı yalnızca adla yazılı, yanıtsız); teyit: kontrol notuyla giren kayıt
  const sayac = { kisi: 0, mevcut: 0, guncellenen: 0, telefon: 0, referans: 0, talep: 0, mulk: 0, ilgi: 0, hatirlatma: 0, ayni: 0, kim: 0, teyit: 0 };
  const sahipId = (eposta) => hesaplar.get(eposta).id;
  const gecmisGun = (t) => (t && t <= gun ? t : null);
  const temasIsle = (kisiId, t) => q("update kisiler set son_temas_at = greatest(coalesce(son_temas_at, 'epoch'), $2::date) where id = $1", [kisiId, t]);
  // Yeniden yüklemede çift yazmamak için: veritabanında o kayıttan kaç tane varsa kitaptaki o kadar satır atlanır.
  // Kitapta birbirinin aynısı iki satır varsa ilk yüklemede ikisi de girer, ikinci yüklemede ikisi de atlanır.
  // Danışmanın Satal'da sildiği kayıt da sayılır: yeniden yükleme silineni geri getirmez.
  const kalan = new Map();
  const zatenVar = async (tablo, kosul, degerler) => {
    const anahtar = tablo + JSON.stringify(degerler);
    if (!kalan.has(anahtar)) kalan.set(anahtar, (await q.bir(`select count(*) as n from ${tablo} where ${kosul}`, degerler)).n);
    if (kalan.get(anahtar) <= 0) return false;
    kalan.set(anahtar, kalan.get(anahtar) - 1);
    sayac.ayni++;
    return true;
  };

  // ---------- Kişiler ----------
  for (const k of plan.kisiler) {
    const sahip = sahipId(k.danisman);
    const guc = k.alim_gucu ? { ...k.alim_gucu, ...dolaraSabitle({ tutar: k.alim_gucu.tutar, para: k.alim_gucu.para, kur }) } : null;
    const var_ = k.telefonlar.map((t) => kayitli.get(sahip + "|" + t)).find(Boolean);
    if (var_) {
      k.id = var_; sayac.mevcut++;
      const m = await q.bir("select hitap_turu, sen_siz, potansiyel, yatirimci_tipi, alim_gucu_tutar, meslek, sirket, notlar, referans_notu from kisiler where id = $1", [var_]);
      const d = {};
      if (!m.meslek && k.meslek) d.meslek = k.meslek;
      if (!m.sirket && k.sirket) d.sirket = k.sirket;
      if (!m.notlar && k.notlar) d.notlar = k.notlar;
      if (!m.referans_notu && k.referans_notu) { d.referans_notu = k.referans_notu; if (k.referans_durumu) d.referans_durumu = k.referans_durumu; }
      if (!m.potansiyel && k.potansiyel) d.potansiyel = k.potansiyel;
      if (m.hitap_turu === "bey_hanim_yok" && m.sen_siz === "siz" && (k.hitap_turu !== "bey_hanim_yok" || k.sen_siz !== "siz")) { d.hitap_turu = k.hitap_turu; d.sen_siz = k.sen_siz; }
      if (!m.yatirimci_tipi && k.yatirimci_tipi) { d.yatirimci_tipi = k.yatirimci_tipi; d.calisma_bolgeleri = JSON.stringify(k.calisma_bolgeleri); d.calisma_kategorileri = k.calisma_kategorileri; }
      if (m.alim_gucu_tutar == null && guc) Object.assign(d, { alim_gucu_tutar: guc.tutar, alim_gucu_para: guc.para, alim_gucu_usd: guc.usd, alim_gucu_kur: guc.kur, alim_gucu_tarih: guc.tarih });
      const sutunlar = Object.keys(d);
      if (sutunlar.length) {
        await q(`update kisiler set ${sutunlar.map((s, i) => `${s} = $${i + 2}`).join(", ")}, guncelleme_at = now() where id = $1`, [var_, ...sutunlar.map((s) => d[s])]);
        sayac.guncellenen++;
      }
    } else {
      k.id = (await q.bir(
        `insert into kisiler (sahip_id, ad, hitap_turu, sen_siz, potansiyel, yatirimci_tipi, calisma_bolgeleri, calisma_kategorileri,
           alim_gucu_tutar, alim_gucu_para, alim_gucu_usd, alim_gucu_kur, alim_gucu_tarih, meslek, sirket, notlar, referans_notu, referans_durumu, kontrol_notu)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
        [sahip, k.ad, k.hitap_turu, k.sen_siz, k.potansiyel, k.yatirimci_tipi, JSON.stringify(k.calisma_bolgeleri), k.calisma_kategorileri,
          guc?.tutar ?? null, guc?.para ?? null, guc?.usd ?? null, guc?.kur ?? null, guc?.tarih ?? null, k.meslek, k.sirket, k.notlar, k.referans_notu, k.referans_durumu, k.kontrol_notu])).id;
      sayac.kisi++;
      if (k.kontrol_notu) sayac.teyit++;
      if (k.referans_notu && !k.referans && !k.referans_durumu) sayac.kim++;
    }
    for (const t of k.telefonlar) {
      if (kayitli.has(sahip + "|" + t)) continue;
      const anaVar = var_ || k.telefonlar.indexOf(t) > 0;
      await q("insert into kisi_telefonlari (kisi_id, sahip_id, numara, ana) values ($1, $2, $3, $4)", [k.id, sahip, t, !anaVar]);
      kayitli.set(sahip + "|" + t, k.id);
      sayac.telefon++;
    }
  }
  // Kim tanıştırdı: bütün kişiler yazıldıktan sonra bağlanır
  for (const k of plan.kisiler) {
    if (!k.referans?.id || k.referans.id === k.id) continue;
    const r = await q("update kisiler set referans_kisi_id = $2, referans_durumu = null where id = $1 and referans_kisi_id is null returning id", [k.id, k.referans.id]);
    sayac.referans += r.length;
  }

  // ---------- Talepler ----------
  for (const t of plan.talepler) {
    const sahip = sahipId(t.kisi.danisman);
    if (await zatenVar("talepler", "kisi_id = $1 and islem = $2 and kategoriler = $3 and notlar = $4", [t.kisi.id, t.islem, t.kategoriler, t.notlar])) continue;
    const s = dolaraSabitle({ tutar: t.butce_max, para: t.butce_para, kur });
    const soylendi = gecmisGun(t.tarih);
    await q(
      `insert into talepler (sahip_id, kisi_id, islem, kategoriler, alt_turler, bolgeler, butce_max_tutar, butce_para, butce_max_usd, butce_kur, butce_tarih, kriterler, notlar, son_teyit_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, coalesce($14::date::timestamptz, now()))`,
      [sahip, t.kisi.id, t.islem, t.kategoriler, t.alt_turler, JSON.stringify(t.bolgeler), t.butce_max, t.butce_para, s.usd, s.kur, s.tarih, JSON.stringify(t.kriterler), t.notlar, soylendi]);
    if (soylendi) await temasIsle(t.kisi.id, soylendi);
    sayac.talep++;
  }

  // ---------- Mülkler ----------
  for (const m of plan.mulkler) {
    const sahip = sahipId(m.danisman);
    if (await zatenVar("mulkler", "sahip_id = $1 and islem = $2 and kategori = $3 and alt_tur = $4 and ilce_id = $5 and notlar = $6 and baslik = $7 and malik_kisi_id is not distinct from $8::uuid",
      [sahip, m.islem, m.kategori, m.alt_tur, m.ilce_id, m.notlar, m.baslik, m.kisi?.id || null])) continue;
    await q(
      `insert into mulkler (sahip_id, malik_kisi_id, ofis_mulku, islem, kategori, alt_tur, baslik, il_id, ilce_id, mahalle_id, konum_notu, ada, parsel,
         fiyat_tutar, fiyat_para, ozellikler, durum, kaynak_kisi_id, kaynak_notu, notlar, olusturma_at, kaynak_durumu, kontrol_notu)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, coalesce($21::date::timestamptz, now()),$22,$23)`,
      [sahip, m.kisi?.id || null, m.ofis_mulku, m.islem, m.kategori, m.alt_tur, m.baslik, m.il_id, m.ilce_id, m.mahalle_id, m.konum_notu, m.ada, m.parsel,
        m.fiyat, m.fiyat_para, JSON.stringify(m.ozellikler), m.durum, m.kaynak?.id || null, m.kaynak_notu, m.notlar, gecmisGun(m.tarih), m.kaynak_durumu, m.kontrol_notu]);
    sayac.mulk++;
    if (m.kontrol_notu) sayac.teyit++;
    if (m.kaynak_notu && !m.kaynak && !m.kaynak_durumu) sayac.kim++;
  }

  // ---------- Geçmiş ilgiler ----------
  for (const g of plan.ilgiler) {
    const sahip = sahipId(g.kisi.danisman);
    // Danışman "varsayım yanlış" dediyse görüşmenin yeri boşalmış, notunun sonuna açıklama eklenmiştir; o da aynı kayıt sayılır
    if (await zatenVar("gorusmeler", `kisi_id = $1 and kategori is not distinct from $5::text and alt_tur is not distinct from $6::text
          and ((notu = $2 and ilce_id is not distinct from $3::int and mahalle_id is not distinct from $4::int)
            or ($7 <> '' and ilce_id is null and starts_with(notu, $2) and strpos(notu, $7) > 0))`,
      [g.kisi.id, g.notu, g.ilce_id, g.mahalle_id, g.kategori, g.alt_tur, g.kontrol_notu ? YANLIS_NOTU + g.kontrol_notu : ""])) continue;
    const t = gecmisGun(g.tarih);
    await q(
      `insert into gorusmeler (kisi_id, sahip_id, tarih, tarih_yaklasik, tur, islem, ilce_id, mahalle_id, kategori, alt_tur, sonuc, notu, kontrol_notu)
       values ($1,$2,$3,$4,'gorusme',$5,$6,$7,$8,$9,$10,$11,$12)`,
      [g.kisi.id, sahip, t, !!t && g.tarih_yaklasik, g.islem, g.ilce_id, g.mahalle_id, g.kategori, g.alt_tur, g.sonuc, g.notu, g.kontrol_notu]);
    // Günü belli olan ilgi kişinin "son temas" tarihini de belirler; yalnızca yılı bilinen belirlemez
    if (t && !g.tarih_yaklasik) await temasIsle(g.kisi.id, t);
    sayac.ilgi++;
    if (g.kontrol_notu) sayac.teyit++;
  }

  // ---------- Aranacaklar ----------
  for (const a of plan.aranacaklar) {
    const sahip = sahipId(a.kisi.danisman);
    if (await zatenVar("hatirlatmalar", "kisi_id = $1 and notu = $2", [a.kisi.id, a.notu])) continue;
    await q("insert into hatirlatmalar (kisi_id, sahip_id, tarih, notu) values ($1, $2, $3, $4)", [a.kisi.id, sahip, a.tarih || gun, a.notu]);
    sayac.hatirlatma++;
  }

  const eslesme = await hepsiniHesapla(q);
  await q("insert into islem_kaydi (kullanici_id, eylem, hedef_tur, ayrinti) values (null, 'toplu_aktarim', null, $1)",
    [JSON.stringify({ dosya: dosyaAdi, ...sayac, alinmayan: plan.alinmayan.length, uyari: plan.uyarilar.length, deneme })]);
  return { ...sayac, eslesme, alinmayan: plan.alinmayan, uyarilar: plan.uyarilar };
}
