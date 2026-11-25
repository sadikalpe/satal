// Deneme için uydurma veri yükler (gerçek kişi içermez). Yalnızca geliştirme ortamında çalışır.
// Kullanım: npm run ornek-veri   → sonra DENEME_GIRISI=1 npm start ve /deneme-giris?eposta=sahip@ornek.test
import { ayar } from "../src/ayar.js";
import { sistem, kapat } from "../src/db.js";
import { hepsiniHesapla } from "../src/servis/eslesme.js";
import { bugun } from "../src/lib/metin.js";

if (ayar.uretim) { console.error("Örnek veri yayındaki sisteme yüklenmez."); process.exit(1); }
const KUR = 42.5;
const usd = (tl) => Math.round(tl / KUR);

await sistem(async (q) => {
  if ((await q("select 1 from kullanicilar limit 1")).length) throw new Error("Veritabanında kullanıcı var; örnek veri yalnızca boş veritabanına yüklenir.");
  await q("insert into kurlar (tarih, usd_try, kaynak) values ($1, $2, 'Örnek veri') on conflict (tarih) do nothing", [bugun(), KUR]);
  const kullanici = async (eposta, ad, rol, moduller = { crm: true }) => (await q.bir(
    "insert into kullanicilar (eposta, ad, telefon, rol, durum, moduller, gizlilik_onay_at, onay_at) values ($1, $2, $3, $4, 'aktif', $5, now(), now()) returning id",
    [eposta, ad, "905550000000", rol, JSON.stringify(moduller)])).id;
  const sahip = await kullanici("sahip@ornek.test", "Ofis Sahibi", "sahip", { crm: true, claude_mesaj: true });
  const yonetici = await kullanici("yonetici@ornek.test", "Ofis Yöneticisi", "yonetici");
  const ayse = await kullanici("ayse@ornek.test", "Ayşe Danışman", "danisman");
  const mehmet = await kullanici("mehmet@ornek.test", "Mehmet Danışman", "danisman");
  await q("insert into kullanicilar (eposta, ad, telefon, rol, durum) values ('yeni@ornek.test', 'Yeni Üye', '905550000099', 'danisman', 'onay_bekliyor')");

  const ilce = async (ad) => (await q.bir("select id from ilceler where il_id = 35 and ad = $1", [ad])).id;
  const mah = async (ilceId, ad) => (await q.bir("select id from mahalleler where ilce_id = $1 and ad ilike $2 order by length(ad) limit 1", [ilceId, ad + "%"]))?.id || null;
  const karsiyaka = await ilce("Karşıyaka"), bornova = await ilce("Bornova"), urla = await ilce("Urla"), cigli = await ilce("Çiğli"), bayrakli = await ilce("Bayraklı");
  const bostanli = await mah(karsiyaka, "Bostanlı"), mavisehir = await mah(karsiyaka, "Mavişehir"), atakent = await mah(karsiyaka, "Atakent"), kazimdirik = await mah(bornova, "Kazımdirik");

  let sira = 10;
  const kisi = async (sahipId, ad, ek = {}) => {
    const k = { hitap_turu: "bey_hanim_yok", sen_siz: "siz", potansiyel: null, alim_gucu: null, yatirimci_tipi: null, calisma_bolgeleri: [], calisma_kategorileri: [], son_gun: null, notlar: "", telefon: null, ...ek };
    const id = (await q.bir(
      `insert into kisiler (sahip_id, ad, hitap_turu, sen_siz, potansiyel, alim_gucu_tutar, alim_gucu_para, alim_gucu_usd, alim_gucu_kur, alim_gucu_tarih, yatirimci_tipi, calisma_bolgeleri, calisma_kategorileri, son_temas_at, notlar, meslek)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, case when $14::int is null then null else now() - make_interval(days => $14::int) end, $15, $16) returning id`,
      [sahipId, ad, k.hitap_turu, k.sen_siz, k.potansiyel, k.alim_gucu, k.alim_gucu ? "TRY" : null, k.alim_gucu ? usd(k.alim_gucu) : null, k.alim_gucu ? KUR : null, k.alim_gucu ? bugun() : null,
        k.yatirimci_tipi, JSON.stringify(k.calisma_bolgeleri), k.calisma_kategorileri, k.son_gun, k.notlar, k.meslek || ""])).id;
    await q("insert into kisi_telefonlari (kisi_id, sahip_id, numara, ana) values ($1, $2, $3, true)", [id, sahipId, k.telefon || "9055500000" + String(sira++).padStart(2, "0")]);
    return id;
  };
  const talep = async (sahipId, kisiId, t) => (await q.bir(
    `insert into talepler (sahip_id, kisi_id, islem, alici_tipi, kategoriler, alt_turler, bolgeler, sadece_bu_bolgeler, butce_min_tutar, butce_max_tutar, butce_para, butce_min_usd, butce_max_usd, butce_kur, butce_tarih, kriterler, en_az_kazanc, son_teyit_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'TRY',$11,$12,$13,$14,$15,$16, now() - make_interval(days => $17)) returning id`,
    [sahipId, kisiId, t.islem || "satilik", t.tip || "oturum", t.kategoriler, t.alt_turler || [], JSON.stringify(t.bolgeler || []), !!t.sadece, t.min ?? null, t.max ?? null, t.min ? usd(t.min) : null, t.max ? usd(t.max) : null,
      t.max || t.min ? KUR : null, t.max || t.min ? bugun() : null, JSON.stringify(t.kriterler || {}), t.kazanc ?? null, t.teyit_gun || 0])).id;
  const mulk = async (sahipId, malik, m) => (await q.bir(
    `insert into mulkler (sahip_id, malik_kisi_id, ofis_mulku, islem, kategori, alt_tur, baslik, il_id, ilce_id, mahalle_id, ada, parsel, fiyat_tutar, fiyat_para, ozellikler, tahmini_deger_tutar, tahmini_deger_para, tahmini_satis_ay, tahmini_kira_tutar, acil, pazarlik_payi)
     values ($1,$2,$3,$4,$5,$6,$7,35,$8,$9,$10,$11,$12,'TRY',$13,$14,$15,$16,$17,$18,$19) returning id`,
    [sahipId, malik, !malik, m.islem || "satilik", m.kategori, m.alt_tur, m.baslik || "", m.ilce, m.mahalle || null, m.ada || "", m.parsel || "", m.fiyat, JSON.stringify(m.o || {}), m.deger ?? null, m.deger ? "TRY" : null, m.satis_ay ?? null, m.kira ?? null, !!m.acil, !!m.pazarlik])).id;

  // --- Ayşe'nin rehberi ---
  const ahmet = await kisi(ayse, "Ahmet Örnek", { hitap_turu: "bey", potansiyel: "A", alim_gucu: 9_500_000, son_gun: 3, meslek: "Mühendis" });
  const zeynep = await kisi(ayse, "Zeynep Deneme", { hitap_turu: "hanim", potansiyel: "B", son_gun: 20 });
  const can = await kisi(ayse, "Can Misal", { sen_siz: "sen", potansiyel: "A", alim_gucu: 15_000_000, son_gun: 75, notlar: "Deniz manzarası olmazsa bakmıyor." });
  const selin = await kisi(ayse, "Selin Kurgu", { hitap_turu: "hanim", potansiyel: "C" });
  const yatirimci = await kisi(ayse, "Murat Yatırım", { hitap_turu: "bey", potansiyel: "A", alim_gucu: 30_000_000, yatirimci_tipi: "al_satci", calisma_bolgeleri: [{ ilce: karsiyaka, mahalle: null }], calisma_kategorileri: ["konut", "arsa"], son_gun: 10 });
  const malik1 = await kisi(ayse, "Hülya Malik", { hitap_turu: "hanim", son_gun: 5 });
  const malik2 = await kisi(ayse, "Kemal Arsa", { hitap_turu: "abi", sen_siz: "sen", son_gun: 40 });
  for (const ad of ["Deniz Tanıdık", "Emre Komşu", "Fatma Müşteri", "Gökhan Eski", "Hande Yeni", "İlker Uzak", "Jale Yakın", "Kaan Orta"]) await kisi(ayse, ad, { son_gun: 100 });

  await talep(ayse, ahmet, { kategoriler: ["konut"], alt_turler: ["konut:daire"], bolgeler: [{ ilce: karsiyaka, mahalle: bostanli }, { ilce: karsiyaka, mahalle: mavisehir }], min: 8_000_000, max: 10_000_000,
    kriterler: { oda: { d: ["3+1"], sart: false }, m2: { d: { min: 120, max: null }, sart: false }, bina_yasi: { d: 10, sart: false }, otopark: { d: true, sart: false }, asansor: { d: true, sart: true } } });
  await talep(ayse, zeynep, { kategoriler: ["konut"], alt_turler: ["konut:daire"], bolgeler: [{ ilce: karsiyaka, mahalle: null }], max: 6_000_000, kriterler: { oda: { d: ["2+1"], sart: false } }, teyit_gun: 120 });
  await talep(ayse, can, { kategoriler: ["konut"], alt_turler: ["konut:villa"], bolgeler: [{ ilce: urla, mahalle: null }], max: 16_000_000, kriterler: { havuz: { d: true, sart: false }, m2: { d: { min: 200, max: null }, sart: false } } });
  await talep(ayse, yatirimci, { tip: "al_satci_bolgesel", kategoriler: ["konut"], bolgeler: [{ ilce: karsiyaka, mahalle: null }], max: 12_000_000, kazanc: 15 });
  await talep(ayse, selin, { kategoriler: ["arsa"], alt_turler: ["arsa:konut_imarli"], bolgeler: [{ ilce: urla, mahalle: null }], max: 7_000_000, kriterler: { m2: { d: { min: 400, max: 800 }, sart: false }, yola_cephe: { d: true, sart: true } } });

  const m1 = await mulk(ayse, malik1, { kategori: "konut", alt_tur: "daire", baslik: "Sahile yakın, asansörlü 3+1", ilce: karsiyaka, mahalle: bostanli, ada: "1234", parsel: "5", fiyat: 9_200_000,
    o: { oda: "3+1", m2: 135, bina_yasi: 6, kat_konumu: "ara_kat", asansor: true, otopark: true }, deger: 10_400_000, satis_ay: 3, kira: 45_000, pazarlik: true });
  await mulk(ayse, malik1, { kategori: "konut", alt_tur: "daire", ilce: karsiyaka, mahalle: atakent, fiyat: 5_700_000, o: { oda: "2+1", m2: 95, bina_yasi: 18, asansor: true } });
  await mulk(ayse, malik2, { kategori: "arsa", alt_tur: "konut_imarli", baslik: "Köşe parsel, yola cepheli", ilce: urla, fiyat: 6_400_000, ada: "210", parsel: "14", o: { m2: 620, emsal: 0.3, yola_cephe: true, elektrik: true, su: true } });
  await mulk(ayse, null, { kategori: "konut", alt_tur: "villa", baslik: "Havuzlu müstakil villa", ilce: urla, fiyat: 15_500_000, o: { oda: "4+1", m2: 260, havuz: true, bahce_m2: 500 }, acil: true });

  // --- Mehmet'in rehberi (Ayşe göremez) ---
  const burak = await kisi(mehmet, "Burak Alıcı", { hitap_turu: "bey", potansiyel: "A", alim_gucu: 11_000_000, son_gun: 2 });
  const ortak = await kisi(mehmet, "Ahmet Ö.", { telefon: "905550000010", hitap_turu: "bey" }); // Ayşe'deki Ahmet ile aynı numara → çift kayıt
  const malik3 = await kisi(mehmet, "Nermin Sahip", { hitap_turu: "hanim" });
  await talep(mehmet, burak, { kategoriler: ["konut"], alt_turler: ["konut:daire"], bolgeler: [{ ilce: karsiyaka, mahalle: bostanli }], max: 10_500_000, kriterler: { oda: { d: ["3+1", "4+1"], sart: false } } });
  await talep(mehmet, ortak, { kategoriler: ["is_yeri"], alt_turler: ["is_yeri:dukkan_magaza"], bolgeler: [{ ilce: bornova, mahalle: null }], max: 9_000_000 });
  await mulk(mehmet, malik3, { kategori: "konut", alt_tur: "daire", baslik: "Mavişehir'de geniş 3+1", ilce: karsiyaka, mahalle: mavisehir, fiyat: 9_800_000, o: { oda: "3+1", m2: 150, bina_yasi: 9, asansor: true, otopark: true, site_icinde: true } });
  await mulk(mehmet, malik3, { kategori: "is_yeri", alt_tur: "dukkan_magaza", ilce: bornova, mahalle: kazimdirik, fiyat: 8_200_000, ada: "88", parsel: "3", o: { m2: 110, konum_tipi: "cadde", giris_kati: true } });
  await mulk(mehmet, null, { kategori: "konut", alt_tur: "daire", islem: "kiralik", ilce: bayrakli, fiyat: 38_000, o: { oda: "2+1", m2: 100 } });
  await mulk(sahip, null, { kategori: "arsa", alt_tur: "tarla", baslik: "Ofis portföyü: sulanabilir tarla", ilce: cigli, fiyat: 4_000_000, o: { m2: 5200, sulama: true, yola_cephe: true } });

  await q("insert into hatirlatmalar (kisi_id, sahip_id, tarih, notu) values ($1, $2, current_date, 'Kredi sonucunu soracak')", [zeynep, ayse]);
  await q("insert into gorusmeler (kisi_id, sahip_id, tarih, tur, ilce_id, kategori, sonuc, notu) values ($1, $2, current_date - 30, 'gorusme', $3, 'konut', 'ilgilendi', 'Bostanlı''da iki daire gezdik.')", [ahmet, ayse, karsiyaka]);
  await q("insert into mesajlar (sahip_id, kisi_id, mulk_id, yon, metin, gonderildi_at) values ($1, $2, $3, 'aliciya', 'Örnek mesaj', now() - interval '6 days')", [ayse, yatirimci, m1]);
  // Kontrol listesi örnekleri: getireni / tanıştıranı yalnızca adla yazılmış kayıtlar ("bu kim?") ve teyit bekleyen bir varsayım
  await q("update mulkler set kaynak_notu = 'Emre Bey' where sahip_id = $1 and ofis_mulku", [ayse]);
  await q("update kisiler set referans_notu = 'Emre Bey''in arkadaşı' where id = any($1::uuid[])", [[can, selin]]);
  await q("update gorusmeler set kontrol_notu = 'Görüşmenin Karşıyaka''da geçtiği varsayıldı.' where sahip_id = $1", [ayse]);
  console.log("eşleşme:", await hepsiniHesapla(q));
});
await kapat();
console.log("Örnek veri yüklendi. Girişler: sahip@ornek.test, yonetici@ornek.test, ayse@ornek.test, mehmet@ornek.test");
