// Kontrol listesinin ortak gösterim parçaları: "bu kim?" formu ve teyit kutusu.
// Kişi kartında, mülk kartında ve kontrol listesinde aynı parçalar kullanılır.
import { html } from "../lib/html.js";
import { csrfAlani, ampul } from "./duzen.js";
import { kisiSecici } from "./parcalar.js";
import { telefonYaz } from "../lib/metin.js";

// Getireni / tanıştıranı rehberden seçtirir ya da "rehberimde yok", "hatırlamıyorum" yanıtını alır.
// kayitlar: gizli gönderilecek kayıtlar ("m:<id>" mülk, "k:<id>" kişi). secimli verilirse kayıtlar o parçadaki kutulardan gelir.
// İlk düğme bilerek "seçtiğim kişiye bağla"dır: arama kutusunda Enter'a basılırsa önerilerden biri yanlışlıkla seçilmez.
export function kimFormu(req, { kayitlar = [], secimli = null, adaylar = [], geri, hatirlanmiyor = false }) {
  return html`<form method="post" action="/kontrol/kim" class="form">${csrfAlani(req)}<input type="hidden" name="geri" value="${geri}">
    ${secimli || kayitlar.map((k) => html`<input type="hidden" name="kayit" value="${k}">`)}
    ${kisiSecici({ ad: "kisi_id", etiket: "Rehberinizde kim?" })}
    <div class="dugmeler"><button class="dugme kucuk" name="eylem" value="bagla">Seçtiğim kişiye bağla</button></div>
    ${adaylar.length ? html`<div><span class="soluk">Rehberinizde adı benzeyenler (doğrusu varsa dokunun):</span>
      <div class="dugmeler">${adaylar.map((a) => html`<button class="dugme kucuk ikincil" name="eylem" value="bagla:${a.id}">${a.ad}${a.telefon ? " · " + telefonYaz(a.telefon) : ""}</button>`)}</div></div>` : ""}
    <div class="dugmeler"><button class="dugme kucuk sade" name="eylem" value="rehberde_yok">Rehberimde yok</button>
      ${hatirlanmiyor ? "" : html`<button class="dugme kucuk sade" name="eylem" value="bilinmiyor">Hatırlamıyorum</button>`}</div>
  </form>`;
}

// Kartta: getiren / tanıştıran yazılı ama rehberden seçilmemişse sorar. ne: "Getiren" | "Tanıştıran"
export function kimKutusu(req, { ne, kayit, notu, durum, adaylar, geri }) {
  if (durum === "rehberde_yok") return "";
  if (durum === "bilinmiyor") {
    return html`<details class="sor-kutu"><summary>“${notu}” kimdi, hatırladınız mı? Rehberden seçin</summary>${kimFormu(req, { kayitlar: [kayit], adaylar, geri, hatirlanmiyor: true })}</details>`;
  }
  return html`<div class="sor-kutu"><p><b>${ne} kişi rehberinizden seçilmedi:</b> “${notu}”. Kim olduğunu şimdi seçin; zaman geçince hatırlamak zorlaşır. ${ampul("kontrol")}</p>
    ${kimFormu(req, { kayitlar: [kayit], adaylar, geri })}</div>`;
}

// "Kontrol ettim" düğmesi (tek kayıt)
export const teyitDugmesi = (req, kayit, geri) => html`<form method="post" action="/kontrol/tamam" class="satir-form">${csrfAlani(req)}
  <input type="hidden" name="geri" value="${geri}"><input type="hidden" name="kayit" value="${kayit}"><button class="dugme kucuk ikincil">Kontrol ettim ✓</button></form>`;

// Geçmiş görüşmedeki varsayım için iki düğme: "Kontrol ettim" (doğru) ve "Yanlış" (yeri boşaltılır, notu kalır)
export const gorusmeTeyidi = (req, id, geri) => html`${teyitDugmesi(req, "g:" + id, geri)}
  <form method="post" action="/kontrol/yanlis" class="satir-form">${csrfAlani(req)}<input type="hidden" name="geri" value="${geri}"><input type="hidden" name="kayit" value="g:${id}">
    <button class="dugme kucuk sade" data-onay="Varsayım yanlış mı? Görüşmenin yeri boşaltılır, notu kalır.">Yanlış</button></form>`;

// Kartta: teyit bekleyen varsayım
export function teyitKutusu(req, { kayit, notu, geri }) {
  if (!notu) return "";
  return html`<div class="sor-kutu"><p><b>Kontrol edilecek:</b> ${notu} ${ampul("kontrol")}</p>${teyitDugmesi(req, kayit, geri)}</div>`;
}
