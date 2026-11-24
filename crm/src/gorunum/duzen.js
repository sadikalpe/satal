// Sayfa iskeleti ve ortak arayüz parçaları.
import { html, ham, nitelik } from "../lib/html.js";
import { yoneticiMi } from "../servis/ortak.js";

const MENU = [
  { yol: "/", ad: "Bugün", simge: "☀" },
  { yol: "/kisiler", ad: "Kişiler", simge: "☎" },
  { yol: "/mulkler", ad: "Mülkler", simge: "⌂" },
  { yol: "/talepler", ad: "Talepler", simge: "◎" },
];

export function sayfa(req, { baslik, icerik, geri = null, dar = false, govdeSinifi = "" }) {
  const k = req.kullanici;
  const yol = req.url.split("?")[0];
  const etkin = (m) => (m.yol === "/" ? yol === "/" || yol.startsWith("/kim-alir") : yol.startsWith(m.yol));
  const bildirim = req.bildirim;
  return "<!doctype html>" + html`
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${baslik ? baslik + " · " : ""}Satal</title>
<meta name="theme-color" content="#0f3d3e">
<meta name="robots" content="noindex, nofollow">
<link rel="manifest" href="/statik/manifest.webmanifest">
<link rel="icon" href="/statik/simge.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/statik/simge-180.png">
<link rel="stylesheet" href="/statik/stil.css?v=${req.surum}">
<script src="/statik/uygulama.js?v=${req.surum}" defer></script>
</head>
<body class="${k ? "girisli" : "girissiz"} ${govdeSinifi}" data-csrf="${req.csrf}">
${k ? html`
<header class="ust">
  <a class="marka" href="/">Satal</a>
  <nav class="ust-menu">
    ${MENU.map((m) => html`<a href="${m.yol}"${nitelik('class="etkin"', etkin(m))}>${m.ad}</a>`)}
    ${yoneticiMi(k) ? html`<a href="/yonetim"${nitelik('class="etkin"', yol.startsWith("/yonetim"))}>Yönetim</a>` : ""}
  </nav>
  ${yol === "/ara" ? "" : html`<form class="ust-ara" action="/ara" method="get" role="search"><input type="search" name="q" placeholder="Her şeyde ara" aria-label="Her şeyde ara"></form>`}
  <a class="profil-dugme" href="/profil" title="Profil">${k.foto_yol ? html`<img src="/foto/${k.id}" alt="">` : html`<span class="avatar">${(k.ad || "?").slice(0, 1)}</span>`}</a>
</header>` : ""}
<main class="${dar ? "dar" : ""}">
  ${bildirim ? html`<div class="bildirim ${bildirim.tur}" role="status">${bildirim.metin}</div>` : ""}
  ${geri ? html`<a class="geri" href="${geri.yol}">‹ ${geri.ad}</a>` : ""}
  ${icerik}
</main>
${k ? html`
<nav class="alt-menu">
  ${MENU.map((m) => html`<a href="${m.yol}"${nitelik('class="etkin"', etkin(m))}><span class="simge">${m.simge}</span>${m.ad}</a>`)}
  ${yoneticiMi(k)
    ? html`<a href="/yonetim"${nitelik('class="etkin"', yol.startsWith("/yonetim"))}><span class="simge">⚙</span>Yönetim</a>`
    : html`<a href="/profil"${nitelik('class="etkin"', yol.startsWith("/profil"))}><span class="simge">☺</span>Profil</a>`}
</nav>` : ""}
<dialog id="yardim-kutusu"><div class="yardim-ic"></div><form method="dialog"><button class="dugme">Tamam</button></form></dialog>
</body>
</html>`;
}

// 💡 yardım ampulü: tıklayınca açıklama aynı yerde açılır
export const ampul = (anahtar) => html`<button type="button" class="ampul" data-yardim="${anahtar}" aria-label="Bu nedir?">💡</button>`;

export const csrfAlani = (req) => html`<input type="hidden" name="_csrf" value="${req.csrf}">`;

export function rozet(sinif) {
  if (!sinif) return "";
  return html`<span class="rozet rozet-${sinif.toLowerCase()}">${sinif}</span>`;
}
export function puanRozeti(e) {
  if (e.puansiz || e.puan == null) return html`<span class="puan puan-yok" title="Bu alıcı tipinde puan ekspertiz bölümüyle açılacak">Uygun</span>`;
  return html`<span class="puan puan-${(e.sinif || "c").toLowerCase()}">${e.puan}<small>${e.sinif}</small></span>`;
}
export const bos = (metin, ek = "") => html`<div class="bos"><p>${metin}</p>${ek}</div>`;

// Form alanı
export function alan({ ad, etiket, deger = "", tip = "text", ipucu = "", zorunlu = false, yardim = null, ek = "", yer = "", liste = null, sinif = "" }) {
  const nit = ham(`${zorunlu ? " required" : ""}${ek ? " " + ek : ""}`);
  let giris;
  if (tip === "textarea") giris = html`<textarea name="${ad}" id="a-${ad}" rows="3" placeholder="${yer}"${nit}>${deger ?? ""}</textarea>`;
  else if (tip === "select") giris = html`<select name="${ad}" id="a-${ad}"${nit}>${liste.map((s) => html`<option value="${s.kod}"${nitelik("selected", String(s.kod) === String(deger ?? ""))}>${s.ad}</option>`)}</select>`;
  else giris = html`<input type="${tip}" name="${ad}" id="a-${ad}" value="${deger ?? ""}" placeholder="${yer}"${nit}>`;
  return html`<label class="alan ${sinif}"><span class="etiket">${etiket}${zorunlu ? html`<i>*</i>` : ""} ${yardim ? ampul(yardim) : ""}</span>${giris}${ipucu ? html`<small>${ipucu}</small>` : ""}</label>`;
}
export const EVET_HAYIR = [{ kod: "", ad: "—" }, { kod: "evet", ad: "Evet" }, { kod: "hayir", ad: "Hayır" }];
export const PARA = [{ kod: "TRY", ad: "TL" }, { kod: "USD", ad: "$" }];
// Tutar + para birimi yan yana
export function paraAlani({ ad, etiket, tutar, para, yardim = null, ipucu = "", zorunlu = false }) {
  return html`<div class="alan"><span class="etiket">${etiket}${zorunlu ? html`<i>*</i>` : ""} ${yardim ? ampul(yardim) : ""}</span>
    <div class="yan-yana"><input type="text" inputmode="decimal" name="${ad}_tutar" value="${tutar ?? ""}" placeholder="örn. 6.500.000"${nitelik("required", zorunlu)} class="sayi-alani">
    <select name="${ad}_para" class="para-secimi">${PARA.map((p) => html`<option value="${p.kod}"${nitelik("selected", p.kod === (para || "TRY"))}>${p.ad}</option>`)}</select></div>
    ${ipucu ? html`<small>${ipucu}</small>` : ""}</div>`;
}
export const danismanEtiketi = (d) => (d ? html`<span class="danisman">${d.foto ? html`<img src="/foto/${d.id}" alt="">` : html`<span class="avatar kucuk">${(d.ad || "?").slice(0, 1)}</span>`}${d.ad}</span>` : "");
