// Kontrol listesi: unutulmasın diye açık kalan sorular tek ekranda.
//   "Bu kim?"      : getireni / tanıştıranı yalnızca adla yazılmış, rehberdeki bir kişiye bağlanmamış kayıtlar
//   "Teyit"        : kayıttaki bir varsayımın ya da eksiğin doğrulanması
//   "Hatırlanmayan": danışmanın "hatırlamıyorum" dediği adlar; hatırlanınca buradan bağlanır
// Herkes yalnızca kendi kayıtlarını görür ve yanıtlar (yönetici de); başka danışmanın kaydı hiçbir biçimde listelenmez.
import { islem } from "../db.js";
import { html } from "../lib/html.js";
import { sayfa, ampul, bos } from "../gorunum/duzen.js";
import { mulkTarifi, gorusmeTarihi, ISLEM_ADI, MULK_DURUMU } from "../gorunum/parcalar.js";
import { kimFormu, teyitDugmesi, gorusmeTeyidi } from "../gorunum/kontrol.js";
import { konumYukle, KullaniciHatasi } from "../servis/ortak.js";
import { bagsizKayitlar, teyitBekleyenler, rehberAdlari, telefonlariEkle, kayitlariAyir, rehbereBagla, bagDurumuYaz, teyitTamam, gorusmeYanlis } from "../servis/kontrol.js";
import { obekle, adaylariBul } from "../alan/kontrol.js";
import { dizi, uuidMi, metin } from "../lib/form.js";
import { tarihYaz } from "../lib/metin.js";

// İşlemden sonra dönülecek yer: yalnızca kontrol listesi ya da bir kişi / mülk kartı
const geriYolu = (v, varsayilan = "/kontrol") => (/^\/(kontrol|(kisiler|mulkler)\/[0-9a-f-]{36})(#[a-z-]{1,30})?$/.test(String(v || "")) ? String(v) : varsayilan);

export default async function (app) {
  app.get("/kontrol", async (req, reply) => {
    const ben = req.kullanici.id, konum = await konumYukle();
    const v = await islem(req.kullanici, async (q) => {
      const kayitlar = await bagsizKayitlar(q, ben);
      const rehber = kayitlar.length ? await rehberAdlari(q, ben) : [];
      // Öbekteki kişinin kendisi kendi tanıştıranı olarak önerilmez
      const kur = (liste) => obekle(liste).map((o) => ({ ...o, adaylar: adaylariBul(rehber.filter((r) => !o.kayitlar.some((k) => k.tur === "k" && k.id === r.id)), o.anahtar) }));
      const bekleyen = kur(kayitlar.filter((k) => !k.durum)), hatirlanmayan = kur(kayitlar.filter((k) => k.durum === "bilinmiyor"));
      const hepsi = [...bekleyen, ...hatirlanmayan];
      const telefonlu = new Map((await telefonlariEkle(q, [...new Map(hepsi.flatMap((o) => o.adaylar).map((a) => [a.id, { id: a.id, ad: a.ad }])).values()])).map((a) => [a.id, a]));
      for (const o of hepsi) o.adaylar = o.adaylar.map((a) => telefonlu.get(a.id));
      return { bekleyen, hatirlanmayan, teyit: await teyitBekleyenler(q, ben) };
    });
    const say = (obekler) => obekler.reduce((n, o) => n + o.kayitlar.length, 0);
    const kimSayisi = say(v.bekleyen), hatirlanmayanSayisi = say(v.hatirlanmayan);
    const teyitSayisi = v.teyit.mulkler.length + v.teyit.kisiler.length + v.teyit.gorusmeler.length;
    const mulkAdi = (m) => m.baslik || `${ISLEM_ADI[m.islem]} · ${mulkTarifi(m, konum)}`;

    const kayitSatiri = (k) => (k.tur === "m"
      ? html`<li><input type="checkbox" name="kayit" value="m:${k.id}" checked aria-label="Bu kaydı seç"><div class="govde"><a class="ad" href="/mulkler/${k.id}">${mulkAdi(k)}</a>
          <small>Yer · getiren diye yazılan: “${k.notu}” · ${tarihYaz(k.olusturma_at)}${k.mulk_durumu !== "aktif" ? " · " + MULK_DURUMU[k.mulk_durumu] : ""}</small></div></li>`
      : html`<li><input type="checkbox" name="kayit" value="k:${k.id}" checked aria-label="Bu kaydı seç"><div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a>
          <small>Kişi · tanıştıran diye yazılan: “${k.notu}”</small></div></li>`);
    const obekKarti = (o, hatirlanmiyor) => {
      const yer = o.kayitlar.filter((k) => k.tur === "m").length, kisi = o.kayitlar.length - yer;
      return html`<div class="kart"><h3>${o.baslik} <small>(${[yer ? `${yer} yer` : "", kisi ? `${kisi} kişi` : ""].filter(Boolean).join(", ")})</small></h3>
        ${kimFormu(req, { secimli: html`<ul class="liste">${o.kayitlar.map(kayitSatiri)}</ul>`, adaylar: o.adaylar, geri: "/kontrol", hatirlanmiyor })}</div>`;
    };
    const duzelt = (yol) => html`<a class="dugme kucuk sade" href="${yol}">Düzelt</a>`;

    return reply.sayfa(sayfa(req, { baslik: "Kontrol listesi", geri: { yol: "/", ad: "Bugün" }, icerik: html`
      <div class="baslik-satiri"><h1>Kontrol listesi ${ampul("kontrol")}</h1></div>
      <p class="soluk">Unutulmasın diye açık kalan sorular. Yanıtladığınız kayıt listeden çıkar; “hatırlamıyorum” dedikleriniz en altta durur.</p>
      ${kimSayisi + teyitSayisi + hatirlanmayanSayisi ? html`<nav class="sekmeler" aria-label="Bölümler">
        <a href="#kim">Bu kim? (${kimSayisi})</a><a href="#teyit">Teyit bekleyen (${teyitSayisi})</a>${hatirlanmayanSayisi ? html`<a href="#hatirlanmayan">Hatırlanmayan (${hatirlanmayanSayisi})</a>` : ""}</nav>`
        : html`<div class="kart">${bos("Kontrol bekleyen bir şey yok.")}</div>`}

      ${kimSayisi ? html`<h2 id="kim">Bu kim? (${kimSayisi} kayıt)</h2>
        <p class="soluk">Bu kayıtlarda getiren ya da tanıştıran yalnızca adla yazılı. Rehberinizdeki kişiyi seçin; aynı adla yazılmış kayıtlar birlikte bağlanır. İstemediğiniz kaydın işaretini kaldırın.</p>
        ${v.bekleyen.map((o) => obekKarti(o, false))}` : ""}

      ${teyitSayisi ? html`<div class="kart" id="teyit"><h2>Teyit bekleyen (${teyitSayisi})</h2>
        <p class="soluk">Bu kayıtlarda bir varsayım ya da eksik var. Doğruysa “Kontrol ettim” deyin; yanlışsa düzeltin.</p>
        <ul class="liste">
          ${v.teyit.mulkler.map((m) => html`<li><div class="govde"><a class="ad" href="/mulkler/${m.id}">${mulkAdi(m)}</a><div class="neden">${m.kontrol_notu}</div></div>
            <div class="yan">${teyitDugmesi(req, "m:" + m.id, "/kontrol#teyit")} ${duzelt(`/mulkler/${m.id}/duzenle`)}</div></li>`)}
          ${v.teyit.kisiler.map((k) => html`<li><div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a><div class="neden">${k.kontrol_notu}</div></div>
            <div class="yan">${teyitDugmesi(req, "k:" + k.id, "/kontrol#teyit")} ${duzelt(`/kisiler/${k.id}/duzenle`)}</div></li>`)}
          ${v.teyit.gorusmeler.map((g) => html`<li><div class="govde"><a class="ad" href="/kisiler/${g.kisi_id}">${g.kisi_ad}</a>
              <small>Geçmiş görüşme · ${[gorusmeTarihi(g), konum.yerAdi(g.ilce_id, g.mahalle_id)].filter(Boolean).join(" · ")}${g.notu ? ` · “${g.notu.length > 140 ? g.notu.slice(0, 140) + "…" : g.notu}”` : ""}</small>
              <div class="neden">${g.kontrol_notu}</div></div>
            <div class="yan">${gorusmeTeyidi(req, g.id, "/kontrol#teyit")}</div></li>`)}
        </ul></div>` : ""}

      ${hatirlanmayanSayisi ? html`<details id="hatirlanmayan"><summary class="dugme ikincil kucuk">Kim olduğu hatırlanmayanlar (${hatirlanmayanSayisi})</summary>
        <p class="soluk">“Hatırlamıyorum” dediğiniz adlar. Kayıtlarda adlarıyla duruyorlar; hatırlayınca buradan rehberinizdeki kişiye bağlayın.</p>
        ${v.hatirlanmayan.map((o) => obekKarti(o, true))}</details>` : ""}` }));
  });

  // "Bu kim?" yanıtı: rehberdeki kişiye bağla, "rehberimde yok" ya da "hatırlamıyorum"
  app.post("/kontrol/kim", async (req, reply) => {
    const f = req.form, eylem = metin(f.eylem, 60);
    const kayitlar = kayitlariAyir(dizi(f.kayit), "mk");
    if (!kayitlar.m.length && !kayitlar.k.length) throw new KullaniciHatasi("En az bir kayıt seçin.");
    let mesaj;
    if (eylem === "rehberde_yok" || eylem === "bilinmiyor") {
      const n = await islem(req.kullanici, (q) => bagDurumuYaz(q, req, kayitlar, eylem));
      if (!n) throw new KullaniciHatasi("Kayıt bulunamadı.", 404);
      mesaj = eylem === "bilinmiyor" ? `${n} kayıt “kim olduğu bilinmiyor” diye işaretlendi. Hatırlayınca kontrol listesinden bağlayabilirsiniz.` : `${n} kayıt adıyla bırakıldı; bir daha sorulmayacak.`;
    } else {
      const kisiId = eylem.startsWith("bagla:") ? eylem.slice(6) : eylem === "bagla" ? metin(f.kisi_id, 40) : "";
      if (!uuidMi(kisiId)) throw new KullaniciHatasi("Önce rehberinizden kişiyi seçin; rehberinizde yoksa “Rehberimde yok” deyin.");
      const n = await islem(req.kullanici, (q) => rehbereBagla(q, req, kayitlar, kisiId));
      if (!n) throw new KullaniciHatasi("Bağlanacak kayıt bulunamadı (kişi kendisinin tanıştıranı olamaz).");
      mesaj = `${n} kayıt rehberinizdeki kişiye bağlandı.`;
    }
    return reply.bildir(mesaj).redirect(geriYolu(f.geri));
  });

  // "Kontrol ettim": teyit notu kalkar
  app.post("/kontrol/tamam", async (req, reply) => {
    const kayitlar = kayitlariAyir(dizi(req.form.kayit), "mkg");
    const n = await islem(req.kullanici, (q) => teyitTamam(q, req, kayitlar));
    if (!n) throw new KullaniciHatasi("Kayıt bulunamadı.", 404);
    return reply.bildir("Kontrol edildi.").redirect(geriYolu(req.form.geri));
  });

  // Geçmiş görüşmedeki varsayım yanlış çıktı
  app.post("/kontrol/yanlis", async (req, reply) => {
    const { g } = kayitlariAyir(dizi(req.form.kayit), "g");
    const s = g.length === 1 ? await islem(req.kullanici, (q) => gorusmeYanlis(q, req, g[0])) : null;
    if (!s) throw new KullaniciHatasi("Kayıt bulunamadı.", 404);
    return reply.bildir("Varsayım kaldırıldı; görüşmenin notu duruyor.").redirect(geriYolu(req.form.geri, "/kontrol#teyit"));
  });
}
