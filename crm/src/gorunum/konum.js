// İl / ilçe / mahalle seçicileri. Seçenekler sunucuda doldurulur; il ya da ilçe değişince tarayıcı yenisini ister.
import { html, nitelik } from "../lib/html.js";
import { ampul } from "./duzen.js";

export const VARSAYILAN_IL = 35; // İzmir
const secenek = (liste, secili, bosAd) => html`<option value="">${bosAd}</option>${liste.map((x) => html`<option value="${x.id}"${nitelik("selected", x.id === secili)}>${x.ad}</option>`)}`;

export function konumSecici(konum, { il = VARSAYILAN_IL, ilce = null, mahalle = null, zorunlu = false } = {}) {
  if (ilce && konum.ilceM.get(ilce)) il = konum.ilceM.get(ilce).il_id;
  return html`<div class="konum-secici izgara uc">
    <label class="alan"><span class="etiket">İl</span><select name="il_id" class="il">${secenek(konum.iller, il, "İl seçin")}</select></label>
    <label class="alan"><span class="etiket">İlçe${zorunlu ? html`<i>*</i>` : ""}</span><select name="ilce_id" class="ilce"${nitelik("required", zorunlu)}>${secenek(konum.ilcelerIl.get(il) || [], ilce, "İlçe seçin")}</select></label>
    <label class="alan"><span class="etiket">Mahalle</span><select name="mahalle_id" class="mahalle">${secenek(ilce ? konum.mahallelerIlce.get(ilce) || [] : [], mahalle, "Mahalle seçin")}</select></label>
  </div>`;
}
// Çoklu bölge seçimi: bolgeler = [{ ilce, mahalle|null }]
export function bolgeSecici(konum, { ad = "bolge", bolgeler = [], etiket = "Bölgeler", yardim = null } = {}) {
  return html`<div class="bolge-secici alan" data-ad="${ad}">
    <span class="etiket">${etiket} ${yardim ? ampul(yardim) : ""}</span>
    <div class="bolge-liste">${bolgeler.map((b) => html`<span class="bolge-cip">${konum.ilceAdi(b.ilce)}${b.mahalle ? " · " + konum.mahalleAdi(b.mahalle) : " (tüm ilçe)"}<input type="hidden" name="${ad}" value="${b.ilce}:${b.mahalle || ""}"><button type="button" aria-label="Kaldır">×</button></span>`)}</div>
    <div class="izgara uc">
      <select class="il" aria-label="İl">${secenek(konum.iller, VARSAYILAN_IL, "İl seçin")}</select>
      <select class="ilce" aria-label="İlçe">${secenek(konum.ilcelerIl.get(VARSAYILAN_IL) || [], null, "İlçe seçin")}</select>
      <select class="mahalle" aria-label="Mahalle" data-bos="Tüm ilçe">${secenek([], null, "Tüm ilçe")}</select>
    </div>
    <div><button type="button" class="dugme ikincil kucuk bolge-ekle">+ Bölgeyi ekle</button> <small>İlçeyi tek başına ya da mahalle mahalle ekleyebilirsiniz.</small></div>
  </div>`;
}
// Formdan gelen "ilce:mahalle" değerlerini doğrulayıp nesneye çevirir
export function bolgeleriOku(konum, deger) {
  const liste = deger == null ? [] : Array.isArray(deger) ? deger : [deger];
  const cikti = [], gorulen = new Set();
  for (const x of liste) {
    const [a, b] = String(x).split(":");
    const ilce = Number(a), mahalle = b ? Number(b) : null;
    if (!konum.ilceM.has(ilce)) continue;
    if (mahalle && konum.mahM.get(mahalle)?.ilce_id !== ilce) continue;
    const k = ilce + ":" + (mahalle || "");
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    cikti.push({ ilce, mahalle });
  }
  return cikti.slice(0, 40);
}
export function konumOku(konum, f) {
  const ilce = Number(f.ilce_id) || null, mahalle = Number(f.mahalle_id) || null;
  if (ilce && !konum.ilceM.has(ilce)) return { il_id: null, ilce_id: null, mahalle_id: null };
  const mahalleGecerli = mahalle && konum.mahM.get(mahalle)?.ilce_id === ilce;
  return { il_id: ilce ? konum.ilceM.get(ilce).il_id : null, ilce_id: ilce, mahalle_id: mahalleGecerli ? mahalle : null };
}
