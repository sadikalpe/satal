// Toplu aktarım: aktarım çalışma kitabını (Excel) Satal'a yükler. Kurulum günü bir kez çalıştırılır.
//
// Kullanım (sunucuda, crm klasöründe):
//   node scripts/aktar.js <dosya.xlsx> --danisman <e-posta>          → yalnızca dener, hiçbir şey yazmaz; özet ve sorunları gösterir
//   node scripts/aktar.js <dosya.xlsx> --danisman <e-posta> --yaz    → yazar
// Seçenekler: --il <ad> (ilçe birden çok ilde varsa varsayılan il; İzmir), --rapor <dosya.csv> (alınmayan satırların listesi)
//
// Kurallar:
// - Danışmanın Satal'da hesabı olmalı (önce bir kez giriş yapsın). Satırdaki "Danışman e-postası" boşsa --danisman kullanılır.
// - Danışmanın rehberinde zaten olan numaralar yeniden eklenmez (kişi iki kez yazılmaz); dosya iki kez yüklenirse yalnızca yeniler girer.
// - "Aktar" sütununda "Hayır" yazan satırlar alınmaz. Talepler "hâlâ arıyor mu?" sorusuna düşmeden, bugünün tarihiyle teyitli girer.
// - Yazma tek işlemdir: bir hata çıkarsa hiçbir şey yazılmaz.
import fs from "node:fs";
import { sistem, kapat } from "../src/db.js";
import { xlsxOku } from "../src/lib/xlsx-oku.js";
import { aktarimHazirla } from "../src/lib/aktarim-hazirla.js";
import { kurAl, dolaraSabitle } from "../src/servis/ortak.js";
import { hepsiniHesapla } from "../src/servis/eslesme.js";

const argv = process.argv.slice(2);
const secenek = (ad) => { const i = argv.indexOf(ad); return i >= 0 ? argv[i + 1] : undefined; };
const dosya = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const yaz = argv.includes("--yaz");
if (!dosya || !fs.existsSync(dosya)) {
  console.error("Kullanım: node scripts/aktar.js <dosya.xlsx> --danisman <e-posta> [--yaz] [--il İzmir] [--rapor alinmayan.csv]");
  process.exit(1);
}

class Vazgec extends Error {}

try {
  const sonuc = await sistem(async (q) => {
    const konum = {
      iller: await q("select id, ad from iller"),
      ilceler: await q("select id, il_id, ad from ilceler"),
      mahalleler: await q("select id, ilce_id, ad from mahalleler"),
    };
    const plan = aktarimHazirla(xlsxOku(fs.readFileSync(dosya)), { konum, varsayilanDanisman: secenek("--danisman"), varsayilanIl: secenek("--il") || "İzmir" });

    // Danışman hesapları
    const epostalar = [...new Set([...plan.kisiler.map((k) => k.danisman), ...plan.mulkler.map((m) => m.danisman)])];
    const hesaplar = new Map((await q("select id, eposta::text as eposta, ad from kullanicilar where eposta = any($1::citext[])", [epostalar])).map((u) => [u.eposta.toLowerCase(), u]));
    const eksik = epostalar.filter((e) => !hesaplar.has(e));
    if (eksik.length) throw new Error("Satal'da hesabı olmayan danışman: " + eksik.join(", ") + ". Önce giriş yapsınlar.");

    // Danışmanın rehberindeki numaralar
    const kayitli = new Map();
    for (const t of await q("select sahip_id, numara, kisi_id from kisi_telefonlari where aktif and sahip_id = any($1::uuid[])", [[...hesaplar.values()].map((u) => u.id)])) {
      kayitli.set(t.sahip_id + "|" + t.numara, t.kisi_id);
    }
    const kur = await kurAl(q);
    const sayac = { kisi: 0, mevcut: 0, telefon: 0, talep: 0, mulk: 0, ayni: 0 };

    for (const k of plan.kisiler) {
      const sahip = hesaplar.get(k.danisman).id;
      const var_ = k.telefonlar.map((t) => kayitli.get(sahip + "|" + t)).find(Boolean);
      if (var_) { k.id = var_; sayac.mevcut++; continue; }
      k.id = (await q.bir(
        `insert into kisiler (sahip_id, ad, hitap_turu, sen_siz, potansiyel, yatirimci_tipi, sirket, notlar) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [sahip, k.ad, k.hitap_turu, k.sen_siz, k.potansiyel, k.yatirimci_tipi, k.sirket, k.notlar])).id;
      sayac.kisi++;
      for (const [i, t] of k.telefonlar.entries()) {
        if (kayitli.has(sahip + "|" + t)) continue;
        await q("insert into kisi_telefonlari (kisi_id, sahip_id, numara, ana) values ($1, $2, $3, $4)", [k.id, sahip, t, i === 0]);
        kayitli.set(sahip + "|" + t, k.id);
        sayac.telefon++;
      }
    }

    for (const t of plan.talepler) {
      const sahip = hesaplar.get(t.kisi.danisman).id;
      // Aynı dosya ikinci kez yüklenirse aynı talep yeniden açılmaz
      if (await q.bir("select 1 from talepler where kisi_id = $1 and silindi_at is null and kategoriler = $2 and notlar = $3", [t.kisi.id, t.kategoriler, t.notlar])) { sayac.ayni++; continue; }
      const s = dolaraSabitle({ tutar: t.butce_max, para: t.butce_para, kur });
      await q(
        `insert into talepler (sahip_id, kisi_id, islem, kategoriler, alt_turler, bolgeler, butce_max_tutar, butce_para, butce_max_usd, butce_kur, butce_tarih, kriterler, notlar)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [sahip, t.kisi.id, t.islem, t.kategoriler, t.alt_turler, JSON.stringify(t.bolgeler), t.butce_max, t.butce_para, s.usd, s.kur, s.tarih, JSON.stringify(t.kriterler), t.notlar]);
      sayac.talep++;
    }

    for (const m of plan.mulkler) {
      const sahip = hesaplar.get(m.danisman).id;
      if (await q.bir("select 1 from mulkler where sahip_id = $1 and silindi_at is null and kategori = $2 and alt_tur = $3 and ilce_id = $4 and notlar = $5", [sahip, m.kategori, m.alt_tur, m.ilce_id, m.notlar])) { sayac.ayni++; continue; }
      await q(
        `insert into mulkler (sahip_id, malik_kisi_id, ofis_mulku, islem, kategori, alt_tur, il_id, ilce_id, mahalle_id, konum_notu, fiyat_tutar, fiyat_para, ozellikler, notlar)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [sahip, m.kisi?.id || null, m.ofis_mulku, m.islem, m.kategori, m.alt_tur, m.il_id, m.ilce_id, m.mahalle_id, m.konum_notu, m.fiyat, m.fiyat_para, JSON.stringify(m.ozellikler), m.notlar]);
      sayac.mulk++;
    }

    const eslesme = await hepsiniHesapla(q);
    await q("insert into islem_kaydi (kullanici_id, eylem, hedef_tur, ayrinti) values (null, 'toplu_aktarim', null, $1)",
      [JSON.stringify({ dosya: dosya.split(/[\\/]/).pop(), ...sayac, alinmayan: plan.alinmayan.length, deneme: !yaz })]);
    const ozet = { ...sayac, eslesme, alinmayan: plan.alinmayan };
    if (!yaz) throw Object.assign(new Vazgec(), { ozet });
    return ozet;
  });
  rapor(sonuc, true);
} catch (e) {
  if (e instanceof Vazgec) rapor(e.ozet, false);
  else { console.error("Aktarım yapılmadı:", e.message); process.exitCode = 1; }
} finally {
  await kapat();
}

function rapor(o, yazildi) {
  console.log(yazildi ? "\nAktarım tamamlandı." : "\nDENEME: hiçbir şey yazılmadı. Yazmak için komutun sonuna --yaz ekleyin.");
  console.log(`  Yeni kişi: ${o.kisi} (telefon: ${o.telefon})`);
  console.log(`  Rehberde zaten olan: ${o.mevcut}`);
  console.log(`  Talep: ${o.talep}   Mülk: ${o.mulk}   Eşleşme: ${o.eslesme}`);
  if (o.ayni) console.log(`  Daha önce aktarılmış olduğu için atlanan talep / mülk: ${o.ayni}`);
  const neden = new Map();
  for (const a of o.alinmayan) neden.set(a.sayfa + ": " + a.neden.replace(/“[^”]*”/g, "…"), (neden.get(a.sayfa + ": " + a.neden.replace(/“[^”]*”/g, "…")) || 0) + 1);
  if (neden.size) {
    console.log(`  Alınmayan satır: ${o.alinmayan.length}`);
    for (const [n, s] of [...neden].sort((a, b) => b[1] - a[1])) console.log(`    ${s} × ${n}`);
  }
  const yol = secenek("--rapor");
  if (yol) {
    const csv = ["sayfa;satir;ad;neden", ...o.alinmayan.map((a) => [a.sayfa, a.satir, a.ad, a.neden].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
    fs.writeFileSync(yol, "﻿" + csv);
    console.log(`  Alınmayanların listesi: ${yol}`);
  }
}
