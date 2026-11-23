// Eşleştirme motoru: onaylanan "Eşleşme Puanlaması Önerisi" belgesindeki örnekler birebir sınanır.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eslestir, konumBaglami, talepsizAday, VARSAYILAN_AYAR } from "../src/alan/eslestirme.js";

const KUR = 40;
// Karşıyaka (1): Bostanlı 11, Mavişehir 12, Atakent 13 · Çiğli (2): 21 · Buca (3): 31 · Urla (5): Kuşçular 51, komşusu 52
const konum = konumBaglami([[1, 2], [1, 4], [5, 6]], [[11, 13], [12, 13], [51, 52]]);
const ctx = { kur: KUR, konum, ayarlar: VARSAYILAN_AYAR };
const tl = (milyon) => (milyon * 1e6) / KUR;

const talep1 = {
  islem: "satilik", alici_tipi: "oturum", kategoriler: ["konut"], alt_turler: ["konut:daire"],
  bolgeler: [{ ilce: 1, mahalle: 11 }, { ilce: 1, mahalle: 12 }],
  butce_min_usd: tl(8), butce_max_usd: tl(10),
  kriterler: { oda: { d: ["3+1"] }, m2: { d: { min: 120 } }, asansor: { d: true }, otopark: { d: true }, bina_yasi: { d: 15 } },
};
const daire = (o) => ({ islem: "satilik", kategori: "konut", alt_tur: "daire", durum: "aktif", fiyat_para: "TRY", ilce_id: 1, ...o });

test("Talep 1 — Bostanlı 3+1, her şey tutuyor: 100 (A)", () => {
  const r = eslestir(talep1, daire({ mahalle_id: 11, fiyat_tutar: 9.2e6, ozellikler: { oda: "3+1", m2: 130, bina_yasi: 8, asansor: true, otopark: true } }), ctx);
  assert.equal(r.puan, 100); assert.equal(r.sinif, "A");
});
test("Talep 1 — Mavişehir rezidans (yakın tür): 79, en fazla B", () => {
  const r = eslestir(talep1, daire({ alt_tur: "rezidans", mahalle_id: 12, fiyat_tutar: 9.8e6, ozellikler: { oda: "3+1", m2: 125, bina_yasi: 5, asansor: true, otopark: true } }), ctx);
  assert.equal(r.puan, 79); assert.equal(r.sinif, "B"); assert.ok(r.tavan_b);
});
test("Talep 1 — Atakent (komşu mahalle), bütçenin %6 üstünde: 79 (B)", () => {
  const r = eslestir(talep1, daire({ mahalle_id: 13, fiyat_tutar: 10.6e6, ozellikler: { oda: "3+1", m2: 125, bina_yasi: 5, asansor: true, otopark: true } }), ctx);
  assert.equal(r.puan, 79); assert.equal(r.sinif, "B"); assert.equal(r.butce.yuzde, 6);
});
test("Talep 1 — Bostanlı 2+1, küçük ve eski, otopark yok: 71 (B)", () => {
  const r = eslestir(talep1, daire({ mahalle_id: 11, fiyat_tutar: 8.5e6, ozellikler: { oda: "2+1", m2: 95, bina_yasi: 25, asansor: true, otopark: false } }), ctx);
  assert.equal(r.puan, 71); assert.equal(r.sinif, "B");
});
test("Talep 1 — Çiğli (komşu ilçe), ev doğru: 62 (B)", () => {
  const r = eslestir(talep1, daire({ ilce_id: 2, mahalle_id: 21, fiyat_tutar: 9e6, ozellikler: { oda: "3+1", m2: 130, bina_yasi: 5, asansor: true, otopark: true } }), ctx);
  assert.equal(r.puan, 62); assert.equal(r.sinif, "B");
});
test("Talep 1 — Buca: komşu bile değil, listede yok", () => {
  assert.equal(eslestir(talep1, daire({ ilce_id: 3, mahalle_id: 31, fiyat_tutar: 8.5e6, ozellikler: { oda: "2+1", m2: 90, bina_yasi: 30 } }), ctx), null);
});

const talep2 = {
  islem: "satilik", alici_tipi: "oturum", kategoriler: ["arsa"], alt_turler: ["arsa:konut_imarli"],
  bolgeler: [{ ilce: 5, mahalle: 51 }], butce_min_usd: tl(6), butce_max_usd: tl(8),
  kriterler: { m2: { d: { min: 500, max: 1000 } }, tapu_durumu: { d: ["mustakil"], sart: true } },
};
const arsa = (o) => ({ islem: "satilik", kategori: "arsa", alt_tur: "konut_imarli", durum: "aktif", fiyat_para: "TRY", ilce_id: 5, ...o });
test("Talep 2 — Kuşçular 750 m² konut imarlı, müstakil tapu: 100 (A)", () => {
  const r = eslestir(talep2, arsa({ mahalle_id: 51, fiyat_tutar: 7e6, ozellikler: { m2: 750, tapu_durumu: "mustakil" } }), ctx);
  assert.equal(r.puan, 100);
});
test("Talep 2 — komşu mahalle, 1.100 m², tapu türü yazılmamış: 67 (B), teyit notu", () => {
  const r = eslestir(talep2, arsa({ mahalle_id: 52, fiyat_tutar: 7.5e6, ozellikler: { m2: 1100 } }), ctx);
  assert.equal(r.puan, 67); assert.equal(r.sinif, "B");
  assert.ok(r.notlar.some((n) => n.tur === "teyit" && /tapu/.test(n.metin)));
});
test("Talep 2 — tarla: arsada imar ön şart, listede yok", () => {
  assert.equal(eslestir(talep2, arsa({ alt_tur: "tarla", mahalle_id: 51, fiyat_tutar: 3e6, ozellikler: { m2: 800 } }), ctx), null);
});
test("Talep 2 — hisseli tapu: olmazsa olmaz tutmuyor, listede yok", () => {
  assert.equal(eslestir(talep2, arsa({ mahalle_id: 51, fiyat_tutar: 7e6, ozellikler: { m2: 750, tapu_durumu: "hisseli" } }), ctx), null);
});

test("Bütçe: %10'dan fazla aşan elenir; alt sınırın altındaki elenmez", () => {
  assert.equal(eslestir(talep1, daire({ mahalle_id: 11, fiyat_tutar: 11.1e6, ozellikler: { oda: "3+1" } }), ctx), null);
  const r = eslestir(talep1, daire({ mahalle_id: 11, fiyat_tutar: 6e6, ozellikler: { oda: "3+1", m2: 130, bina_yasi: 8, asansor: true, otopark: true } }), ctx);
  assert.equal(r.puan, 100); assert.equal(r.butce.durum, "altinda");
});
test("Bütçe: talepte yoksa kişinin alım gücü; o da yoksa 'parası bilinmiyor'", () => {
  const t = { ...talep1, butce_min_usd: null, butce_max_usd: null, kisi: { alim_gucu_usd: tl(5) } };
  const m = daire({ mahalle_id: 11, fiyat_tutar: 9e6, ozellikler: { oda: "3+1" } });
  assert.equal(eslestir(t, m, ctx), null);
  const r = eslestir({ ...t, kisi: {} }, m, ctx);
  assert.ok(r.para_bilinmiyor);
});
test("TL kuralı: bütçe girildiği günün dolarıyla kalır, mülk güncel kurla çevrilir", () => {
  const m = daire({ mahalle_id: 11, fiyat_tutar: 10e6, ozellikler: {} });
  assert.ok(eslestir(talep1, m, ctx));
  // Kur 40'tan 30'a düşerse aynı TL fiyat dolar olarak pahalanır ve bütçeyi %10'dan fazla aşar
  assert.equal(eslestir(talep1, m, { ...ctx, kur: 30 }), null);
});
test("Kategori, işlem türü ve durum eler", () => {
  const m = daire({ mahalle_id: 11, fiyat_tutar: 9e6, ozellikler: {} });
  assert.equal(eslestir({ ...talep1, kategoriler: ["arsa"] }, m, ctx), null);
  assert.equal(eslestir(talep1, { ...m, islem: "kiralik" }, ctx), null);
  assert.equal(eslestir(talep1, { ...m, durum: "satildi" }, ctx), null);
  assert.equal(eslestir(talep1, { ...m, alt_tur: "villa" }, ctx), null, "daire arayana villa çıkmaz");
});
test("Söylenmeyen ölçütün puanı diğerlerine dağılır; boş bilgi cezalandırılmaz", () => {
  const t = { ...talep1, kriterler: {} };
  assert.equal(eslestir(t, daire({ mahalle_id: 11, fiyat_tutar: 9e6, ozellikler: {} }), ctx).puan, 100);
  const r = eslestir(talep1, daire({ mahalle_id: 11, fiyat_tutar: 9e6, ozellikler: { oda: "3+1", m2: 130, asansor: true, otopark: true } }), ctx);
  assert.equal(r.puan, 100);
  assert.ok(r.notlar.some((n) => n.tur === "eksik" && /bina yaşı/.test(n.metin)));
});
test("Yakın oda sayısı kısmi puan alır: 4+1 %70, 2+1 %40", () => {
  const t = { ...talep1, kriterler: { oda: { d: ["3+1"] } } };
  const p = (oda) => eslestir(t, daire({ mahalle_id: 11, fiyat_tutar: 9e6, ozellikler: { oda } }), ctx).puan;
  assert.equal(p("3+1"), 100); assert.equal(p("4+1"), 88); assert.equal(p("2+1"), 76); assert.equal(p("5+1"), 60);
});
test("'Yalnızca bu bölgeler' işaretliyse bölge dışı hiç çıkmaz", () => {
  const t = { ...talep1, sadece_bu_bolgeler: true };
  assert.equal(eslestir(t, daire({ mahalle_id: 13, fiyat_tutar: 9e6, ozellikler: {} }), ctx), null);
  assert.ok(eslestir(t, daire({ mahalle_id: 11, fiyat_tutar: 9e6, ozellikler: {} }), ctx));
});
test("İlçenin tamamı seçildiyse ilçedeki her mahalle tam puan alır", () => {
  const t = { ...talep1, bolgeler: [{ ilce: 1, mahalle: null }], kriterler: {} };
  assert.equal(eslestir(t, daire({ mahalle_id: 13, fiyat_tutar: 9e6, ozellikler: {} }), ctx).puan, 100);
  // komşu ilçe, başka hiçbir ölçüt yok: 22/60 = 37 puan, 40'ın altında kaldığı için listelenmez
  assert.equal(eslestir(t, daire({ ilce_id: 2, mahalle_id: 21, fiyat_tutar: 9e6, ozellikler: {} }), ctx), null);
});
test("40'ın altı listelenmez", () => {
  const t = { ...talep1, bolgeler: [{ ilce: 1, mahalle: null }], kriterler: { oda: { d: ["3+1"] }, m2: { d: { min: 200 } } } };
  assert.equal(eslestir(t, daire({ ilce_id: 2, mahalle_id: 21, fiyat_tutar: 9e6, ozellikler: { oda: "1+1", m2: 60 } }), ctx), null);
});
test("Yatırımcı ve al-satçı: puan verilmez, eleme yapılır; serbest al-satçıda konum şartı yok", () => {
  const t = { islem: "satilik", alici_tipi: "al_satci_serbest", kategoriler: ["arsa"], alt_turler: [], bolgeler: [{ ilce: 1 }], butce_max_usd: tl(10), en_az_kazanc: 15, kriterler: {} };
  const m = arsa({ ilce_id: 3, mahalle_id: 31, fiyat_tutar: 5e6, tahmini_deger_tutar: 6e6, tahmini_deger_para: "TRY", tahmini_satis_ay: 4, ozellikler: {} });
  const r = eslestir(t, m, ctx);
  assert.equal(r.puan, null); assert.ok(r.puansiz); assert.equal(r.tahmin.kazanc_yuzde, 20); assert.equal(r.tahmin.satis_ay, 4);
  assert.equal(eslestir({ ...t, en_az_kazanc: 25 }, m, ctx), null, "en az kazanç beklentisinin altı elenir");
  assert.equal(eslestir({ ...t, alici_tipi: "al_satci_bolgesel" }, m, ctx), null, "bölgesel al-satçıda konum eler");
});
test("Ticari kullanıcı: ağırlık 15 / 35 / 50, depo arayana dükkan çıkmaz", () => {
  const t = { islem: "kiralik", alici_tipi: "ticari", kategoriler: ["is_yeri"], alt_turler: ["is_yeri:depo"], bolgeler: [{ ilce: 1 }], butce_max_usd: 10000,
    kriterler: { m2: { d: { min: 2000 } }, tavan_yuksekligi: { d: 8, sart: true }, tir_girisi: { d: true } } };
  const m = { islem: "kiralik", kategori: "is_yeri", alt_tur: "depo", durum: "aktif", fiyat_tutar: 9000, fiyat_para: "USD", ilce_id: 2, ozellikler: { m2: 2500, tavan_yuksekligi: 10, tir_girisi: true } };
  const r = eslestir(t, m, ctx);
  assert.equal(r.puan, Math.round(15 + 35 * (7 / 45) + 50)); assert.equal(r.sinif, "B");
  assert.equal(eslestir(t, { ...m, alt_tur: "dukkan_magaza" }, ctx), null);
  assert.equal(eslestir(t, { ...m, ozellikler: { ...m.ozellikler, tavan_yuksekligi: 6 } }, ctx), null, "olmazsa olmaz tavan yüksekliği");
  assert.equal(eslestir(t, { ...m, alt_tur: "fabrika" }, ctx).sinif, "B", "aynı gruptaki yakın tür çıkar, en fazla B");
});
test("Proje, konut talebinin uygun daire tipiyle eşleşir", () => {
  const p = { islem: "satilik", kategori: "proje", alt_tur: "konut_projesi", durum: "aktif", fiyat_tutar: 8.5e6, fiyat_para: "TRY", ilce_id: 1, mahalle_id: 11,
    ozellikler: { oda_tipleri: ["2+1", "3+1"], m2_min: 90, m2_max: 140 } };
  const r = eslestir({ ...talep1, kriterler: { oda: { d: ["3+1"] }, m2: { d: { min: 120 } } } }, p, ctx);
  assert.equal(r.puan, 100); assert.ok(r.notlar.some((n) => n.metin === "Proje"));
  assert.equal(eslestir(talep2, p, ctx), null);
});
test("Talebi yok ama alabilir", () => {
  const m = arsa({ mahalle_id: 51, fiyat_tutar: 4e6, ozellikler: {} });
  assert.ok(talepsizAday({ potansiyel: "A", alim_gucu_usd: tl(5) }, m, ctx));
  assert.equal(talepsizAday({ potansiyel: "A", alim_gucu_usd: tl(2) }, m, ctx), null, "parası yetmeyen önerilmez");
  assert.equal(talepsizAday({ potansiyel: "B", alim_gucu_usd: tl(5) }, m, ctx), null);
  assert.ok(talepsizAday({ potansiyel: "C", gorusme_ilceleri: [5] }, m, ctx));
  assert.ok(talepsizAday({ yatirimci_tipi: "al_satci", calisma_bolgeleri: [{ ilce: 5 }], calisma_kategorileri: ["arsa"] }, m, ctx));
  assert.equal(talepsizAday({ yatirimci_tipi: "al_satci", calisma_bolgeleri: [{ ilce: 1 }], calisma_kategorileri: ["arsa"] }, m, ctx), null);
});
