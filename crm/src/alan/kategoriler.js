// Kategori ağacı, mülk alanları ve talep ölçütleri. Formlar, eşleştirme ve ekranlar aynı tanımı kullanır.
// Ağaç büyük ilan sitelerinin sınıflandırmasıyla aynıdır (Emlakjet, 21.11.2026) + Satal'a özel "hazine arazisi".

const t = (kod, ad, ...gruplar) => ({ kod, ad, gruplar: gruplar.length ? gruplar : [kod] });

const IS_YERI_TURLERI = [
  t("dukkan_magaza", "Dükkan & mağaza", "perakende"), t("ofis", "Ofis", "ofis"), t("fabrika", "Fabrika", "uretim_depo"),
  t("buro", "Büro", "ofis"), t("bina", "Bina", "bina"), t("genel", "Genel"), t("depo", "Depo & antrepo", "uretim_depo"),
  t("atolye", "Atölye", "uretim_depo"), t("ciftlik", "Çiftlik"), t("imalathane", "İmalathane", "uretim_depo"),
  t("ishani_kati", "İşhanı katı", "ofis"), t("plaza_kati", "Plaza katı", "ofis"), t("mustakil_isyeri", "Müstakil iş yeri", "bina"),
  t("apartman_dairesi", "Apartman dairesi", "ofis"), t("benzin_istasyonu", "Benzin istasyonu"), t("villa", "Villa (iş yeri)", "bina"),
  t("kafe_bar", "Kafe & bar", "perakende"), t("restoran", "Restoran", "perakende"), t("rezidans_kati", "Rezidans katı & ofisi", "ofis"),
  t("plaza", "Plaza", "bina"), t("bufe", "Büfe", "perakende"), t("ishani", "İşhanı", "bina"), t("avm", "AVM", "bina"),
  t("kiraathane", "Kıraathane", "perakende"), t("hastane", "Hastane", "bina"),
];

export const KATEGORILER = [
  { kod: "konut", ad: "Konut", kalip: "konut", turler: [
    t("daire", "Daire", "apartman"), t("villa", "Villa", "mustakil"), t("mustakil_ev", "Müstakil ev", "mustakil"), t("bina", "Bina", "bina"),
    t("yazlik", "Yazlık", "mustakil"), t("rezidans", "Rezidans", "apartman"), t("kooperatif", "Kooperatif", "apartman"),
    t("koy_evi", "Köy evi", "mustakil"), t("devre_mulk", "Devre mülk", "apartman"), t("ciftlik_evi", "Çiftlik evi", "mustakil"),
    t("kosk", "Köşk", "mustakil"), t("prefabrik", "Prefabrik", "mustakil"), t("yali_dairesi", "Yalı dairesi", "apartman"),
    t("yali", "Yalı", "mustakil"), t("dag_evi", "Dağ evi", "mustakil"),
  ] },
  { kod: "arsa", ad: "Arsa", kalip: "arsa", turSartiVarsayilan: true, turSartiAdi: "İmar durumu olmazsa olmaz", turler: [
    t("tarla", "Tarla", "tarim"), t("konut_imarli", "Konut imarlı", "konut_imar"), t("bag_bahce", "Bağ & bahçe", "tarim"),
    t("villa_imarli", "Villa imarlı", "konut_imar"), t("zeytinlik", "Zeytinlik", "tarim"), t("arazi", "Arazi", "tarim"),
    t("ticari_imarli", "Ticari imarlı", "ticari_imar"), t("konut_ticaret", "Konut + ticaret alanı", "konut_imar", "ticari_imar"),
    t("sanayi_imarli", "Sanayi imarlı", "sanayi_imar"), t("muhtelif", "Muhtelif arsa"), t("ozel_kullanim", "Özel kullanım"),
    t("turizm_imarli", "Turizm imarlı", "turizm_imar"), t("turizm_konut", "Turizm / konut alanı", "turizm_imar", "konut_imar"),
    t("ada", "Ada"), t("toplu_konut", "Toplu konut için", "konut_imar"), t("depo_antrepo", "Depo & antrepo izinli", "sanayi_imar"),
    t("sit_alani", "Sit alanı"), t("ciftlik", "Çiftlik", "tarim"), t("egitim", "Okul (eğitim tesisi)"), t("saglik", "Hastane (sağlık tesisi)"),
    t("maden_ocagi", "Maden ocağı"), t("hazine_arazisi", "Hazine arazisi"),
  ] },
  { kod: "is_yeri", ad: "İş yeri", kalip: "is_yeri", turSartiVarsayilan: true, turSartiAdi: "Kullanım türü olmazsa olmaz", turler: IS_YERI_TURLERI },
  { kod: "devren", ad: "Devren iş yeri", kalip: "is_yeri", turSartiVarsayilan: true, turSartiAdi: "Kullanım türü olmazsa olmaz", turler: IS_YERI_TURLERI },
  { kod: "kat_karsiligi", ad: "Kat karşılığı arsa", kalip: "arsa", turler: [t("kat_karsiligi", "Kat karşılığı arsa")] },
  { kod: "turistik", ad: "Turistik tesis", kalip: "turistik", turler: [
    t("otel", "Otel", "konaklama"), t("butik_otel", "Butik otel", "konaklama"), t("apart_otel", "Apart otel", "konaklama"),
    t("pansiyon", "Pansiyon", "konaklama"), t("tatil_koyu", "Tatil köyü"), t("kaplica", "Kaplıca tesisi"), t("motel", "Motel", "konaklama"),
    t("kamp_yeri", "Kamp yeri"),
  ] },
  // Projeler yalnızca mülk olarak girilir; konut ve iş yeri talepleriyle eşleşir.
  { kod: "proje", ad: "Proje", kalip: "proje", yalnizMulk: true, turler: [
    t("konut_projesi", "Konut projesi"), t("ticari_proje", "Ticari proje (ofis / ticaret merkezi)"), t("karma_proje", "Karma proje"),
  ] },
];

const KAT = new Map(KATEGORILER.map((k) => [k.kod, k]));
export const kategori = (kod) => KAT.get(kod) || null;
export const kategoriAdi = (kod) => KAT.get(kod)?.ad || kod || "";
export const altTur = (kat, kod) => KAT.get(kat)?.turler.find((x) => x.kod === kod) || null;
export const altTurAdi = (kat, kod) => altTur(kat, kod)?.ad || kod || "";
export const TALEP_KATEGORILERI = KATEGORILER.filter((k) => !k.yalnizMulk);
// Proje hangi talep kategorileriyle eşleşir
export const PROJE_KARSILIGI = { konut_projesi: ["konut"], ticari_proje: ["is_yeri"], karma_proje: ["konut", "is_yeri"] };

// İki alt tür arasındaki yakınlık: 'ayni' | 'yakin' (aynı grup) | 'uzak'
export function turYakinligi(kat, istenenler, mulkTuru) {
  if (!istenenler || !istenenler.length) return "belirtilmedi";
  if (istenenler.includes(mulkTuru)) return "ayni";
  const m = altTur(kat, mulkTuru);
  if (!m) return "uzak";
  for (const kod of istenenler) {
    const i = altTur(kat, kod);
    if (i && i.gruplar.some((g) => m.gruplar.includes(g))) return "yakin";
  }
  return "uzak";
}

// ---------- Mülk alanları ----------
const ODA = ["1+0", "1+1", "2+0", "2+1", "2+2", "3+1", "3+2", "4+1", "4+2", "5+1", "5+2", "6+1", "7+ ve üstü"];
const sec = (...ciftler) => ciftler.map((c) => (Array.isArray(c) ? { kod: c[0], ad: c[1] } : { kod: c, ad: c }));
const A = {
  m2: { anahtar: "m2", ad: "m² (brüt)", tip: "sayi" },
  m2_net: { anahtar: "m2_net", ad: "m² (net)", tip: "sayi" },
  alan: { anahtar: "m2", ad: "Alan (m²)", tip: "sayi" },
  kapali_alan: { anahtar: "m2", ad: "Kapalı alan (m²)", tip: "sayi" },
  tapu_durumu: { anahtar: "tapu_durumu", ad: "Tapu durumu", tip: "secim", secenekler: sec(["kat_mulkiyeti", "Kat mülkiyeti"], ["kat_irtifaki", "Kat irtifakı"], ["mustakil", "Müstakil tapu"], ["hisseli", "Hisseli"], ["kooperatif", "Kooperatif"]) },
  krediye_uygun: { anahtar: "krediye_uygun", ad: "Krediye uygun", tip: "evet_hayir" },
  takas: { anahtar: "takas", ad: "Takas olur", tip: "evet_hayir" },
  oda: { anahtar: "oda", ad: "Oda sayısı", tip: "secim", secenekler: sec(...ODA) },
  kat_konumu: { anahtar: "kat_konumu", ad: "Kat konumu", tip: "secim", secenekler: sec(["bahce_kati", "Bahçe katı"], ["giris", "Giriş katı"], ["ara_kat", "Ara kat"], ["en_ust", "En üst kat"], ["cati_dubleks", "Çatı dubleks"]) },
  bina_yasi: { anahtar: "bina_yasi", ad: "Bina yaşı", tip: "sayi" },
  bahceli: { anahtar: "bahceli", ad: "Bahçeli", tip: "evet_hayir" },
  site_icinde: { anahtar: "site_icinde", ad: "Site içinde", tip: "evet_hayir" },
  havuz: { anahtar: "havuz", ad: "Havuz", tip: "evet_hayir" },
  asansor: { anahtar: "asansor", ad: "Asansör", tip: "evet_hayir" },
  otopark: { anahtar: "otopark", ad: "Otopark", tip: "evet_hayir" },
  cephe: { anahtar: "cephe", ad: "Cephe", tip: "metin" },
  manzara: { anahtar: "manzara", ad: "Manzara (deniz vb.)", tip: "metin" },
  isinma: { anahtar: "isinma", ad: "Isınma", tip: "metin" },
  esyali: { anahtar: "esyali", ad: "Eşyalı", tip: "evet_hayir" },
  iskanli: { anahtar: "iskanli", ad: "İskanlı", tip: "evet_hayir" },
  villa_tipi: { anahtar: "villa_tipi", ad: "Villa tipi", tip: "secim", secenekler: sec(["mustakil", "Müstakil"], ["ikiz", "İkiz"], ["sira", "Sıra villa"]) },
  kat_adedi: { anahtar: "kat_adedi", ad: "Kat adedi", tip: "sayi" },
  bahce_m2: { anahtar: "bahce_m2", ad: "Bahçe (m²)", tip: "sayi" },
  havuz_tipi: { anahtar: "havuz_tipi", ad: "Havuz türü", tip: "secim", secenekler: sec(["ozel", "Özel"], ["ortak", "Ortak"]) },
  site_olanaklari: { anahtar: "site_olanaklari", ad: "Site olanakları", tip: "metin" },
  aidat: { anahtar: "aidat", ad: "Aidat (TL)", tip: "sayi" },
  denize_uzaklik: { anahtar: "denize_uzaklik", ad: "Denize uzaklık (m)", tip: "sayi" },
  konum_tipi: { anahtar: "konum_tipi", ad: "Konumu", tip: "secim", secenekler: sec(["cadde", "Cadde üstü"], ["pasaj", "Pasaj"], ["avm", "AVM"], ["ara_sokak", "Ara sokak"]) },
  cephe_m: { anahtar: "cephe_m", ad: "Cephe uzunluğu (m)", tip: "sayi" },
  giris_kati: { anahtar: "giris_kati", ad: "Giriş katında", tip: "evet_hayir" },
  tavan_yuksekligi: { anahtar: "tavan_yuksekligi", ad: "Tavan yüksekliği (m)", tip: "sayi" },
  kiracili: { anahtar: "kiracili", ad: "Kiracılı", tip: "evet_hayir" },
  kira_getirisi: { anahtar: "kira_getirisi", ad: "Aylık kira getirisi (TL)", tip: "sayi" },
  tir_girisi: { anahtar: "tir_girisi", ad: "Tır girişi", tip: "evet_hayir" },
  rampa: { anahtar: "rampa", ad: "Rampa", tip: "evet_hayir" },
  elektrik_gucu: { anahtar: "elektrik_gucu", ad: "Elektrik gücü (kVA)", tip: "sayi" },
  acik_alan_m2: { anahtar: "acik_alan_m2", ad: "Açık alan (m²)", tip: "sayi" },
  bina_tipi: { anahtar: "bina_tipi", ad: "Bina tipi", tip: "secim", secenekler: sec(["plaza", "Plaza"], ["ishani", "İşhanı"], ["apartman", "Apartman"], ["mustakil", "Müstakil"]) },
  ofis_oda: { anahtar: "ofis_oda", ad: "Oda sayısı", tip: "sayi" },
  kat: { anahtar: "kat", ad: "Bulunduğu kat", tip: "sayi" },
  osb_icinde: { anahtar: "osb_icinde", ad: "OSB içinde", tip: "evet_hayir" },
  tesis_oda: { anahtar: "tesis_oda", ad: "Oda sayısı", tip: "sayi" },
  yatak: { anahtar: "yatak", ad: "Yatak sayısı", tip: "sayi" },
  belge_turu: { anahtar: "belge_turu", ad: "Belge türü", tip: "metin" },
  imar_durumu: { anahtar: "imar_durumu", ad: "İmar durumu", tip: "secim", secenekler: sec(["konut", "Konut"], ["ticari", "Ticari"], ["konut_ticaret", "Konut + ticaret"], ["turizm", "Turizm"], ["sanayi", "Sanayi"], ["imarsiz", "İmarsız / tarım"], ["diger", "Diğer"]) },
  emsal: { anahtar: "emsal", ad: "Emsal / KAKS", tip: "sayi" },
  taks: { anahtar: "taks", ad: "TAKS", tip: "sayi" },
  kat_izni: { anahtar: "kat_izni", ad: "Kat izni (gabari)", tip: "sayi" },
  yola_cephe: { anahtar: "yola_cephe", ad: "Yola cephe", tip: "evet_hayir" },
  elektrik: { anahtar: "elektrik", ad: "Elektrik var", tip: "evet_hayir" },
  su: { anahtar: "su", ad: "Su var", tip: "evet_hayir" },
  sulama: { anahtar: "sulama", ad: "Sulama var", tip: "evet_hayir" },
  agac_sayisi: { anahtar: "agac_sayisi", ad: "Ağaç sayısı", tip: "sayi" },
  agac_yasi: { anahtar: "agac_yasi", ad: "Ağaç yaşı", tip: "sayi" },
  urun_turu: { anahtar: "urun_turu", ad: "Ürün türü", tip: "metin" },
  tahsis_durumu: { anahtar: "tahsis_durumu", ad: "Tahsis ya da kiralama durumu", tip: "metin" },
  kullanim_suresi: { anahtar: "kullanim_suresi", ad: "Kullanım süresi", tip: "metin" },
  satin_alma_hakki: { anahtar: "satin_alma_hakki", ad: "Hazineden satın alma hakkı", tip: "evet_hayir" },
  ecrimisil_borcu: { anahtar: "ecrimisil_borcu", ad: "Ecrimisil borcu (TL)", tip: "sayi" },
  yapi_var: { anahtar: "yapi_var", ad: "Üzerinde yapı var", tip: "evet_hayir" },
  proje_adi: { anahtar: "proje_adi", ad: "Proje adı", tip: "metin" },
  insaat_firmasi: { anahtar: "insaat_firmasi", ad: "İnşaat firması", tip: "metin" },
  toplam_konut: { anahtar: "toplam_konut", ad: "Toplam konut / bölüm sayısı", tip: "sayi" },
  oda_tipleri: { anahtar: "oda_tipleri", ad: "Oda tipleri", tip: "coklu", secenekler: sec(...ODA) },
  m2_min: { anahtar: "m2_min", ad: "En küçük m²", tip: "sayi" },
  m2_max: { anahtar: "m2_max", ad: "En büyük m²", tip: "sayi" },
  fiyat_max: { anahtar: "fiyat_max", ad: "En yüksek fiyat (fiyatla aynı para birimi)", tip: "sayi" },
  teslim: { anahtar: "teslim", ad: "Teslim tarihi (ya da “hemen teslim”)", tip: "metin" },
  odeme_secenekleri: { anahtar: "odeme_secenekleri", ad: "Ödeme seçenekleri", tip: "coklu", secenekler: sec(["pesin", "Peşin"], ["12_ay", "12 ay vade"], ["18_ay", "18 ay vade"], ["24_ay", "24 ay vade"], ["36_ay", "36 ay vade"], ["kredi", "Banka kredisi"]) },
  satis_yetkisi: { anahtar: "satis_yetkisi", ad: "Satış yetkimiz var", tip: "evet_hayir" },
};
const ORTAK_SON = [A.tapu_durumu, A.krediye_uygun, A.takas];
const KONUT_TEMEL = [A.oda, A.m2, A.m2_net, A.bina_yasi];
const ALAN_SETLERI = {
  "konut:daire": [...KONUT_TEMEL, A.kat_konumu, A.bahceli, A.site_icinde, A.havuz, A.asansor, A.otopark, A.cephe, A.manzara, A.isinma, A.esyali, A.iskanli],
  "konut:villa": [A.villa_tipi, ...KONUT_TEMEL, A.kat_adedi, A.bahce_m2, A.havuz, A.havuz_tipi, A.site_icinde, A.otopark, A.manzara, A.esyali, A.iskanli],
  "konut:mustakil_ev": [...KONUT_TEMEL, A.kat_adedi, A.bahce_m2, A.bahceli, A.otopark, A.havuz, A.iskanli],
  "konut:rezidans": [...KONUT_TEMEL, A.kat_konumu, A.site_olanaklari, A.aidat, A.denize_uzaklik, A.havuz, A.asansor, A.otopark, A.esyali],
  "konut:yazlik": [...KONUT_TEMEL, A.site_icinde, A.site_olanaklari, A.aidat, A.denize_uzaklik, A.bahceli, A.havuz, A.otopark, A.esyali],
  konut: [...KONUT_TEMEL, A.kat_konumu, A.kat_adedi, A.bahceli, A.site_icinde, A.havuz, A.asansor, A.otopark, A.manzara, A.esyali, A.iskanli],
  "arsa:tarla": [A.alan, A.sulama, A.yola_cephe, A.elektrik, A.su],
  "arsa:arazi": [A.alan, A.sulama, A.yola_cephe, A.elektrik, A.su],
  "arsa:ciftlik": [A.alan, A.sulama, A.yola_cephe, A.elektrik, A.su, A.yapi_var],
  "arsa:zeytinlik": [A.alan, A.agac_sayisi, A.agac_yasi, A.sulama, A.yola_cephe],
  "arsa:bag_bahce": [A.alan, A.urun_turu, A.sulama, A.yola_cephe, A.elektrik, A.su],
  "arsa:hazine_arazisi": [A.alan, A.tahsis_durumu, A.kullanim_suresi, A.satin_alma_hakki, A.ecrimisil_borcu, A.yapi_var, A.yola_cephe],
  arsa: [A.alan, A.imar_durumu, A.emsal, A.taks, A.kat_izni, A.yola_cephe, A.elektrik, A.su],
  kat_karsiligi: [A.alan, A.imar_durumu, A.emsal, A.taks, A.kat_izni, A.yola_cephe, A.elektrik, A.su],
  "is_yeri:dukkan_magaza": [A.m2, A.konum_tipi, A.cephe_m, A.giris_kati, A.tavan_yuksekligi, A.kiracili, A.kira_getirisi, A.otopark, A.bina_yasi],
  "is_yeri:depo": [A.kapali_alan, A.tavan_yuksekligi, A.tir_girisi, A.rampa, A.elektrik_gucu, A.acik_alan_m2, A.osb_icinde, A.otopark, A.bina_yasi, A.kiracili],
  "is_yeri:fabrika": [A.kapali_alan, A.tavan_yuksekligi, A.tir_girisi, A.rampa, A.elektrik_gucu, A.acik_alan_m2, A.osb_icinde, A.otopark, A.bina_yasi, A.kiracili],
  "is_yeri:imalathane": [A.kapali_alan, A.tavan_yuksekligi, A.tir_girisi, A.elektrik_gucu, A.acik_alan_m2, A.osb_icinde, A.otopark, A.bina_yasi, A.kiracili],
  "is_yeri:atolye": [A.kapali_alan, A.tavan_yuksekligi, A.tir_girisi, A.elektrik_gucu, A.osb_icinde, A.otopark, A.bina_yasi, A.kiracili],
  "is_yeri:ofis": [A.m2, A.bina_tipi, A.ofis_oda, A.kat, A.otopark, A.asansor, A.bina_yasi, A.kiracili, A.kira_getirisi],
  "is_yeri:buro": [A.m2, A.bina_tipi, A.ofis_oda, A.kat, A.otopark, A.asansor, A.bina_yasi, A.kiracili, A.kira_getirisi],
  is_yeri: [A.m2, A.konum_tipi, A.cephe_m, A.giris_kati, A.tavan_yuksekligi, A.kat, A.otopark, A.bina_yasi, A.kiracili, A.kira_getirisi, A.elektrik_gucu, A.tir_girisi],
  turistik: [A.m2, A.tesis_oda, A.yatak, A.belge_turu, A.otopark, A.havuz, A.bina_yasi, A.denize_uzaklik],
  proje: [A.proje_adi, A.insaat_firmasi, A.toplam_konut, A.oda_tipleri, A.m2_min, A.m2_max, A.fiyat_max, A.teslim, A.odeme_secenekleri, A.satis_yetkisi],
};
export function mulkAlanlari(kat, tur) {
  const temel = kat === "devren" ? "is_yeri" : kat;
  const set = ALAN_SETLERI[temel + ":" + tur] || ALAN_SETLERI[temel] || [A.m2];
  return kat === "proje" ? set : [...set, ...ORTAK_SON];
}
export const alanTanimi = (anahtar) => Object.values(A).find((a) => a.anahtar === anahtar) || null;

// Arsanın alt türünden imar durumu (mülk kartında ayrıca yazılmadıysa bu kullanılır)
const TURDEN_IMAR = { konut_imarli: "konut", villa_imarli: "konut", toplu_konut: "konut", ticari_imarli: "ticari", konut_ticaret: "konut_ticaret", sanayi_imarli: "sanayi", depo_antrepo: "sanayi", turizm_imarli: "turizm", turizm_konut: "turizm", tarla: "imarsiz", bag_bahce: "imarsiz", zeytinlik: "imarsiz", arazi: "imarsiz", ciftlik: "imarsiz" };
export const turdenImar = (tur) => TURDEN_IMAR[tur] || null;

// ---------- Talep ölçütleri ve özellik puanının iç dağılımı ----------
// tip: coklu (kabul edilen değerler) · aralik (en az – en çok) · en_az · en_cok · evet
const K = {
  oda: { anahtar: "oda", ad: "Oda sayısı", tip: "coklu", secenekler: sec(...ODA) },
  m2: { anahtar: "m2", ad: "m²", tip: "aralik" },
  bina_yasi: { anahtar: "bina_yasi", ad: "Bina yaşı (en çok)", tip: "en_cok", kisa: "bina yaşı" },
  kat_konumu: { anahtar: "kat_konumu", ad: "Kat konumu", tip: "coklu", secenekler: A.kat_konumu.secenekler },
  otopark: { anahtar: "otopark", ad: "Otopark", tip: "evet" },
  asansor: { anahtar: "asansor", ad: "Asansör", tip: "evet" },
  bahceli: { anahtar: "bahceli", ad: "Bahçe", tip: "evet" },
  havuz: { anahtar: "havuz", ad: "Havuz", tip: "evet" },
  site_icinde: { anahtar: "site_icinde", ad: "Site içinde", tip: "evet" },
  emsal: { anahtar: "emsal", ad: "Emsal (en az)", tip: "en_az", kisa: "emsal" },
  kat_izni: { anahtar: "kat_izni", ad: "Kat izni (en az)", tip: "en_az", kisa: "kat izni" },
  tapu_durumu: { anahtar: "tapu_durumu", ad: "Tapu türü", tip: "coklu", secenekler: sec(["mustakil", "Müstakil tapu"], ["hisseli", "Hisseli"]) },
  yola_cephe: { anahtar: "yola_cephe", ad: "Yola cephe", tip: "evet" },
  elektrik: { anahtar: "elektrik", ad: "Elektrik", tip: "evet" },
  su: { anahtar: "su", ad: "Su", tip: "evet" },
  cephe_m: { anahtar: "cephe_m", ad: "Cephe uzunluğu (en az, m)", tip: "en_az", kisa: "cephe" },
  giris_kati: { anahtar: "giris_kati", ad: "Giriş katında", tip: "evet" },
  tavan_yuksekligi: { anahtar: "tavan_yuksekligi", ad: "Tavan yüksekliği (en az, m)", tip: "en_az", kisa: "tavan yüksekliği" },
  tir_girisi: { anahtar: "tir_girisi", ad: "Tır girişi", tip: "evet" },
  elektrik_gucu: { anahtar: "elektrik_gucu", ad: "Elektrik gücü (en az, kVA)", tip: "en_az", kisa: "elektrik gücü" },
  kiracili: { anahtar: "kiracili", ad: "Kiracılı", tip: "evet" },
  tesis_oda: { anahtar: "tesis_oda", ad: "Oda sayısı (en az)", tip: "en_az", kisa: "oda sayısı" },
  yatak: { anahtar: "yatak", ad: "Yatak sayısı (en az)", tip: "en_az", kisa: "yatak sayısı" },
};
// Her kalıp: özellik puanının (oturum alıcısında 40) kalemlere dağılımı. Onaylanan puanlama belgesindeki oranlar.
export const KALIPLAR = {
  konut: [
    { ad: "Oda sayısı", agirlik: 14, olcutler: [K.oda] },
    { ad: "m²", agirlik: 8, olcutler: [K.m2] },
    { ad: "Bina yaşı", agirlik: 6, olcutler: [K.bina_yasi] },
    { ad: "Kat konumu", agirlik: 4, olcutler: [K.kat_konumu] },
    { ad: "Diğer istekler", agirlik: 8, olcutler: [K.otopark, K.asansor, K.bahceli, K.havuz, K.site_icinde] },
  ],
  arsa: [
    { ad: "Alan", agirlik: 14, olcutler: [K.m2] },
    { ad: "Yapılaşma hakkı", agirlik: 10, olcutler: [K.emsal, K.kat_izni] },
    { ad: "Tapu türü", agirlik: 8, olcutler: [K.tapu_durumu] },
    { ad: "Yola cephe ve altyapı", agirlik: 8, olcutler: [K.yola_cephe, K.elektrik, K.su] },
  ],
  is_yeri: [
    { ad: "Alan", agirlik: 12, olcutler: [K.m2] },
    { ad: "Teknik ölçütler", agirlik: 18, olcutler: [K.cephe_m, K.giris_kati, K.tavan_yuksekligi, K.tir_girisi, K.elektrik_gucu] },
    { ad: "Diğer", agirlik: 10, olcutler: [K.otopark, K.bina_yasi, K.kiracili] },
  ],
  turistik: [
    { ad: "Alan", agirlik: 12, olcutler: [K.m2] },
    { ad: "Kapasite", agirlik: 18, olcutler: [K.tesis_oda, K.yatak] },
    { ad: "Diğer", agirlik: 10, olcutler: [K.otopark, K.havuz, K.bina_yasi] },
  ],
};
export function kalip(katKodu) { return KALIPLAR[KAT.get(katKodu)?.kalip] || []; }
// Seçilen kategorilere göre talep formunda gösterilecek ölçütler (tekrarsız)
export function talepOlcutleri(kategoriler) {
  const gorulen = new Set(), liste = [];
  for (const k of kategoriler || []) for (const kalem of kalip(k)) for (const o of kalem.olcutler) {
    if (!gorulen.has(o.anahtar)) { gorulen.add(o.anahtar); liste.push(o); }
  }
  return liste;
}
export const olcutTanimi = (anahtar) => K[anahtar] || null;

export const ALICI_TIPLERI = [
  { kod: "oturum", ad: "Oturum alıcısı", aciklama: "Belli bölge, belli özellikler", puanli: true },
  { kod: "ticari", ad: "Ticari kullanıcı", aciklama: "Fabrika, depo, iş yeri: teknik ölçütler ve ulaşım", puanli: true },
  { kod: "kira_yatirimcisi", ad: "Kira yatırımcısı", aciklama: "Kira getirisi, geri dönüş süresi", puanli: false },
  { kod: "uzun_vadeli", ad: "Uzun vadeli yatırımcı", aciklama: "Yıllar içinde değer artışı", puanli: false },
  { kod: "al_satci_bolgesel", ad: "Al-satçı (bölgesel)", aciklama: "Kendi bölgesinde ucuz alıp kısa sürede satmak", puanli: false },
  { kod: "al_satci_serbest", ad: "Al-satçı (serbest)", aciklama: "Yer önemsiz; ucuz alıp kısa sürede satmak", puanli: false, yerOnemsiz: true },
];
export const aliciTipi = (kod) => ALICI_TIPLERI.find((x) => x.kod === kod) || ALICI_TIPLERI[0];
export const ODA_SECENEKLERI = ODA;
