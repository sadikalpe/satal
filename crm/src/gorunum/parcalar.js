// Kişi, mülk, talep ve eşleşme için ortak gösterim parçaları.
import { html } from "../lib/html.js";
import { rozet, puanRozeti, danismanEtiketi, csrfAlani } from "./duzen.js";
import { nitelik } from "../lib/html.js";
import { kategoriAdi, altTurAdi, aliciTipi, olcutTanimi, alanTanimi } from "../alan/kategoriler.js";
import { paraKisa, sayiYaz, telefonYaz, ayYilYaz, neKadarOnce } from "../lib/metin.js";

export const ISLEM_ADI = { satilik: "Satılık", kiralik: "Kiralık" };
export const MULK_DURUMU = { aktif: "Aktif", opsiyonlu: "Opsiyonlu", satildi: "Satıldı / kiralandı", pasif: "Pasif" };
export const TALEP_DURUMU = { aktif: "Aktif", beklemede: "Beklemede", kapandi: "Kapandı" };
export const SONUC_ADI = { ilgilendi: "İlgilendi", teklif_verdi: "Teklif verdi", aldi: "Aldı", olmadi: "Olmadı" };
export const GORUSME_TURU = { gorusme: "Görüşme", arama: "Arama", mesaj: "Mesaj" };
export const BELGE_TURU = { tapu: "Tapu", imar: "İmar durumu", plan_notu: "Plan notu", roleve: "Röleve", diger: "Diğer" };

// "Karşıyaka Bostanlı · 3+1 daire · 130 m²"
export function mulkTarifi(m, konum) {
  const o = m.ozellikler || {};
  const tur = m.kategori === "proje" ? (o.proje_adi || altTurAdi(m.kategori, m.alt_tur)) : [o.oda, altTurAdi(m.kategori, m.alt_tur).toLocaleLowerCase("tr")].filter(Boolean).join(" ");
  return [konum.yerAdi(m.ilce_id, m.mahalle_id), tur, o.m2 ? sayiYaz(o.m2) + " m²" : null].filter(Boolean).join(" · ");
}
export const fiyatYaz = (m) => (m.fiyat_tutar == null ? "fiyat yok" : paraKisa(m.fiyat_tutar, m.fiyat_para) + (m.islem === "kiralik" ? " / ay" : ""));
export function dolarKarsiligi(tutar, para, kur) {
  if (tutar == null || para === "USD" || !kur) return "";
  return "≈ " + paraKisa(tutar / kur, "USD");
}
export function butceYaz(t) {
  const p = (x) => paraKisa(x, t.butce_para);
  if (t.butce_min_tutar != null && t.butce_max_tutar != null) return `${p(t.butce_min_tutar)} – ${p(t.butce_max_tutar)}`;
  if (t.butce_max_tutar != null) return `en çok ${p(t.butce_max_tutar)}`;
  if (t.butce_min_tutar != null) return `en az ${p(t.butce_min_tutar)}`;
  return "";
}
// "Karşıyaka Bostanlı, Mavişehir · daire · 8 – 10 milyon TL"
export function talepTarifi(t, konum) {
  const bolge = (t.bolgeler || []).slice(0, 3).map((b) => (b.mahalle ? konum.mahalleAdi(b.mahalle) : konum.ilceAdi(b.ilce))).filter(Boolean).join(", ") + ((t.bolgeler || []).length > 3 ? "…" : "");
  const tur = (t.alt_turler || []).length ? t.alt_turler.slice(0, 3).map((x) => { const [k, a] = x.split(":"); return altTurAdi(k, a).toLocaleLowerCase("tr"); }).join(", ") : (t.kategoriler || []).map((k) => kategoriAdi(k).toLocaleLowerCase("tr")).join(", ");
  const oda = t.kriterler?.oda?.d?.length ? t.kriterler.oda.d.join(" / ") : null;
  return [bolge || "bölge belirtilmedi", [oda, tur].filter(Boolean).join(" "), butceYaz(t)].filter(Boolean).join(" · ");
}
export function olcutMetni(anahtar, istek) {
  const tanim = olcutTanimi(anahtar);
  if (!tanim) return null;
  const d = istek.d;
  let deger;
  if (tanim.tip === "coklu") deger = (Array.isArray(d) ? d : [d]).map((x) => tanim.secenekler?.find((s) => s.kod === x)?.ad || x).join(" / ");
  else if (tanim.tip === "aralik") deger = [d.min != null ? "en az " + sayiYaz(d.min) : null, d.max != null ? "en çok " + sayiYaz(d.max) : null].filter(Boolean).join(", ");
  else if (tanim.tip === "evet") deger = "isteniyor";
  else deger = sayiYaz(d, 2);
  return { ad: tanim.ad, deger, sart: !!istek.sart };
}
export function ozellikDegeri(anahtar, v) {
  const tanim = alanTanimi(anahtar);
  if (v == null || v === "") return null;
  if (v === true) return "Evet";
  if (v === false) return "Hayır";
  if (Array.isArray(v)) return v.map((x) => tanim?.secenekler?.find((s) => s.kod === x)?.ad || x).join(", ");
  if (tanim?.secenekler) return tanim.secenekler.find((s) => s.kod === v)?.ad || v;
  return typeof v === "number" ? sayiYaz(v, 2) : v;
}

export function kisiEtiketleri(k) {
  return html`${k.potansiyel ? rozet(k.potansiyel) : ""}
    ${k.yatirimci_tipi ? html`<span class="etiket-k bilgi">${k.yatirimci_tipi === "al_satci" ? "al-satçı" : "yatırımcı"}</span>` : ""}
    ${k.mesaj_istemiyor ? html`<span class="etiket-k uyari">mesaj istemiyor</span>` : ""}
    ${k.silindi_at ? html`<span class="etiket-k uyari">silindi</span>` : ""}`;
}
const NOT_SINIFI = { teyit: "uyari", butce: "sari", tur: "sari", eksik: "", uymuyor: "", kismi: "", bilgi: "bilgi" };
export function eslesmeNotlari(a) {
  return html`${(a.notlar || []).map((n) => html`<span class="etiket-k ${NOT_SINIFI[n.tur] ?? ""}">${n.metin}</span>`)}`;
}
export function tahminSatiri(t) {
  if (!t || !Object.keys(t).length) return "";
  const p = [];
  if (t.kazanc_yuzde != null) p.push(`%${t.kazanc_yuzde} kazanç`);
  if (t.satis_ay != null) p.push(`yaklaşık ${sayiYaz(t.satis_ay, 1)} ayda satılır`);
  if (t.kira_getirisi_yuzde != null) p.push(`yıllık kira getirisi %${sayiYaz(t.kira_getirisi_yuzde, 1)} · geri dönüş ${sayiYaz(t.geri_donus_yil, 1)} yıl`);
  return p.length ? html`<div class="neden">Danışman tahmini: ${p.join(" · ")}</div>` : "";
}
export function puanDokumu(a) {
  const p = a.parcalar || {};
  const AD = { konum: "Konum", ozellik: "Özellikler", alt_tur: "Alt tür" };
  const d = Object.entries(AD).filter(([k]) => p[k]).map(([k, ad]) => `${ad} ${p[k].puan}/${p[k].en_cok}`);
  return d.length ? html`<div class="dokum">${d.map((x) => html`<span>${x}</span>`)}</div>` : "";
}
// Bir eşleşmenin liste satırı. yon: "alici" (mülk sayfasında alıcıyı göster) | "mulk" (talep sayfasında mülkü göster)
export function eslesmeSatiri(e, { yon, konum, ekDugme = "", danisman = null, secim = false }) {
  const a = e.ayrinti || e;
  const isaretler = e.isaretler || [];
  return html`<li>
    ${secim ? html`<input type="checkbox" name="kisi" value="${e.kisi_id}" class="alici-secim"${e.mesaj_istemiyor ? " disabled" : ""}>` : ""}
    ${puanRozeti({ puan: e.puan, sinif: e.sinif, puansiz: a.puansiz })}
    <div class="govde">
      ${yon === "alici"
        ? html`<a class="ad" href="/kisiler/${e.kisi_id}">${e.kisi_ad}</a><small>${e.talep_tarifi || ""}</small>`
        : html`<a class="ad" href="/mulkler/${e.mulk_id}">${e.mulk_tarifi}</a><small>${e.fiyat_yazi || ""}</small>`}
      <div class="neden">${(a.nedenler || []).join(" · ")}</div>
      ${puanDokumu(a)}
      ${tahminSatiri(a.tahmin)}
      <div class="etiketler">
        ${e.durum === "yeni" ? html`<span class="etiket-k iyi">yeni</span>` : ""}
        ${e.fiyat_dustu ? html`<span class="etiket-k iyi">fiyat düştü</span>` : ""}
        ${a.para_bilinmiyor ? html`<span class="etiket-k uyari">parası bilinmiyor</span>` : ""}
        ${isaretler.map((i) => html`<span class="etiket-k bilgi">${i}</span>`)}
        ${eslesmeNotlari(a)}
        ${e.butce_tarih ? html`<span class="etiket-k">bütçe tarihi: ${ayYilYaz(e.butce_tarih)}</span>` : ""}
        ${e.son_mesaj_at ? html`<span class="etiket-k sari">bu mülk ${neKadarOnce(e.son_mesaj_at)} gönderildi</span>` : ""}
        ${e.mesaj_istemiyor ? html`<span class="etiket-k uyari">mesaj istemiyor</span>` : ""}
        ${danisman ? danismanEtiketi(danisman) : ""}
      </div>
    </div>
    <div class="yan">${ekDugme}</div>
  </li>`;
}
export const telefonBaglantisi = (numara) => html`<a href="tel:+${numara}">${telefonYaz(numara)}</a>`;
export const aliciTipiAdi = (kod) => aliciTipi(kod).ad;

// Yönetici için "kimin kayıtları" seçimi (danışmanda görünmez)
export function kapsamSecici(danismanlar, kimin) {
  if (!danismanlar.size) return "";
  return html`<select name="kimin" aria-label="Kimin kayıtları" data-kendigonder>
    <option value="ben"${nitelik("selected", kimin === "ben")}>Benim kayıtlarım</option>
    <option value="hepsi"${nitelik("selected", kimin === "hepsi")}>Bütün ekip</option>
    ${[...danismanlar.values()].map((d) => html`<option value="${d.id}"${nitelik("selected", kimin === d.id)}>${d.ad}${d.durum === "kapali" ? " (kapalı)" : ""}</option>`)}
  </select>`;
}
export function sayfalama(req, sayfaNo, dahaVar) {
  if (sayfaNo <= 1 && !dahaVar) return "";
  const adres = (n) => { const u = new URLSearchParams(req.query); u.set("sayfa", n); return "?" + u; };
  return html`<div class="dugmeler orta">${sayfaNo > 1 ? html`<a class="dugme ikincil kucuk" href="${adres(sayfaNo - 1)}">‹ Önceki</a>` : ""}${dahaVar ? html`<a class="dugme ikincil kucuk" href="${adres(sayfaNo + 1)}">Sonraki ›</a>` : ""}</div>`;
}
export const kutular = (ad, liste, secili = []) => html`<div class="secenekler">${liste.map((s) => html`<label class="secenek"><input type="checkbox" name="${ad}" value="${s.kod}"${nitelik("checked", secili.includes(s.kod))}> ${s.ad}</label>`)}</div>`;
// Rehberden kişi seçme: yazdıkça arar (tarayıcı /kisiler/ara adresine sorar)
export function kisiSecici({ ad = "kisi_id", etiket = "Kişi", secili = null, zorunlu = false }) {
  return html`<div class="alan kisi-secici"><span class="etiket">${etiket}${zorunlu ? html`<i>*</i>` : ""}</span>
    <input type="hidden" name="${ad}" value="${secili?.id || ""}">
    <div class="secili-kisi"${nitelik("hidden", !secili)}><b>${secili?.ad || ""}</b> <button type="button" class="baglanti-dugme kisi-degistir">değiştir</button></div>
    <input type="search" class="kisi-ara" placeholder="Ad ya da telefon yazın" autocomplete="off"${nitelik("hidden", !!secili)}>
    <ul class="liste kisi-sonuclari"></ul></div>`;
}
// Belgeler (tapu, imar durumu, plan notu, röleve…)
export function belgeBolumu(req, belgeler, { kisiId = null, mulkId = null, yazabilir = false }) {
  return html`<div class="kart"><h2>Belgeler</h2>
    ${belgeler.length ? html`<ul class="liste">${belgeler.map((b) => html`<li><div class="govde"><a class="ad" href="/belgeler/${b.id}" target="_blank" rel="noopener">${b.dosya_adi}</a><small>${BELGE_TURU[b.tur] || b.tur} · ${sayiYaz(Math.ceil(b.boyut / 1024))} KB</small></div>
      ${yazabilir ? html`<div class="yan"><form method="post" action="/belgeler/${b.id}/sil" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk sade" data-onay="Belge silinsin mi?">Sil</button></form></div>` : ""}</li>`)}</ul>` : html`<p class="soluk">Henüz belge yok.</p>`}
    ${yazabilir ? html`<form method="post" action="/belgeler" enctype="multipart/form-data" class="form">${csrfAlani(req)}
      <input type="hidden" name="kisi_id" value="${kisiId || ""}"><input type="hidden" name="mulk_id" value="${mulkId || ""}">
      <div class="izgara iki"><label class="alan"><span class="etiket">Tür</span><select name="tur">${Object.entries(BELGE_TURU).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
      <label class="alan"><span class="etiket">Dosya (PDF ya da fotoğraf, en çok 15 MB)</span><input type="file" name="dosya" accept="application/pdf,image/*" required></label></div>
      <button class="dugme ikincil kucuk">Belge ekle</button></form>` : ""}</div>`;
}
