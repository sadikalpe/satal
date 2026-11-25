// Her şeyde arama: kişiler, mülkler, talepler, görüşme notları ve hatırlatmalar tek kutudan aranır.
// Sorgular isteği yapan kullanıcının kimliğiyle çalışır; danışman yalnızca kendi kayıtlarını bulur (kuralı veritabanı uygular).
// Mülk notu "yalnızca sahibi görür" bilgisidir: başkasının mülkünde nota bakılmaz, gösterilmez.
import { islem } from "../db.js";
import { html } from "../lib/html.js";
import { sayfa, ampul, bos, danismanEtiketi } from "../gorunum/duzen.js";
import { kisiEtiketleri, mulkTarifi, talepTarifi, fiyatYaz, kapsamSecici, gorusmeTarihi, ISLEM_ADI, MULK_DURUMU, TALEP_DURUMU } from "../gorunum/parcalar.js";
import { konumYukle, kapsamOku, danismanlarAl } from "../servis/ortak.js";
import { metin } from "../lib/form.js";
import { norm, telefonYaz, tarihYaz } from "../lib/metin.js";

const SINIR = 30;
// Türkçe harf ve büyük-küçük harf farkını yok sayan karşılaştırma (aranan sözcükler de norm() ile aynı biçime gelir)
const duz = (ifade) => `lower(translate(${ifade}, 'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu'))`;
const likeKacir = (s) => s.replace(/[\\%_]/g, "\\$&");

// Aranan metni sözcüklere ayırır: en az 2 harfli, en çok 6 sözcük. "100/7" → "100" (tek haneli parça aramayı bozmasın diye atılır)
export function aramaSozcukleri(ham) {
  return [...new Set(norm(ham).split(/[\s/]+/).filter((x) => x.length >= 2))].slice(0, 6);
}

// Harf harf sadeleştirir; uzunluğu değiştirmez (bulunan yerin asıl metindeki karşılığı aynı sırada kalsın diye)
const TR = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
export function harfHarfDuz(s) {
  let c = "";
  for (const h of String(s || "")) {
    const k = h.toLocaleLowerCase("tr");
    const d = (TR[k] || k).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    c += d.length === h.length ? d : h;
  }
  return c;
}
// Metnin, aranan sözcüğün geçtiği kısmı; bulunan sözcükler işaretlenir. Hiçbiri geçmiyorsa boş döner.
export function kesit(metinHam, sozcukler, genislik = 110) {
  const asil = String(metinHam || "").replace(/\s+/g, " ").trim();
  if (!asil) return "";
  const sade = harfHarfDuz(asil);
  const ilk = Math.min(...sozcukler.map((w) => sade.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(ilk)) return "";
  let bas = Math.max(0, ilk - Math.floor(genislik / 3)), son = Math.min(asil.length, bas + genislik);
  if (bas > 0) { const b = asil.indexOf(" ", bas); if (b >= 0 && b < ilk) bas = b + 1; }
  if (son < asil.length) { const b = asil.lastIndexOf(" ", son); if (b > ilk) son = b; }
  // İşaretlenecek aralıklar
  const aralik = [];
  for (const w of sozcukler) for (let i = sade.indexOf(w, bas); i >= 0 && i + w.length <= son; i = sade.indexOf(w, i + 1)) aralik.push([i, i + w.length]);
  aralik.sort((a, b) => a[0] - b[0]);
  const parcalar = [];
  let konum = bas;
  for (const [a, b] of aralik) {
    if (a < konum) continue;
    parcalar.push(asil.slice(konum, a), html`<mark>${asil.slice(a, b)}</mark>`);
    konum = b;
  }
  parcalar.push(asil.slice(konum, son));
  return html`<div class="neden kesit">${bas > 0 ? "… " : ""}${parcalar}${son < asil.length ? " …" : ""}</div>`;
}

export default async function (app) {
  app.get("/ara", async (req, reply) => {
    const ham = metin(req.query.q, 100), kap = kapsamOku(req), ben = req.kullanici.id;
    const sozcukler = aramaSozcukleri(ham);
    const rakam = ham.replace(/\D/g, "").replace(/^0/, "");
    const telefonAramasi = rakam.length >= 4 && !/[^\d\s+()\-]/.test(ham) ? rakam : "";
    const konum = await konumYukle();
    const v = sozcukler.length || telefonAramasi ? await islem(req.kullanici, async (q) => {
      // Her sorgu kendi değer listesini kurar: sözcükler, kapsam (kimin kayıtları) ve gerekiyorsa kullanıcının kendisi
      const kur = (metinSql, sahipSutunu) => {
        const p = [], no = sozcukler.map((w) => { p.push("%" + likeKacir(w) + "%"); return p.length; });
        const hepsi = (ifade) => (no.length ? no.map((i) => `${ifade} like $${i}`).join(" and ") : "false");
        let kapsam = "";
        if (kap.sahipId) { p.push(kap.sahipId); kapsam = ` and ${sahipSutunu} = $${p.length}`; }
        return { p, hepsi, kapsam, uyar: hepsi(metinSql) };
      };

      const kisi = kur(duz("k.ad || ' ' || k.sirket || ' ' || k.meslek || ' ' || k.notlar || ' ' || k.referans_notu"), "k.sahip_id");
      let telefon = "false";
      if (telefonAramasi) { kisi.p.push("%" + telefonAramasi + "%"); telefon = `exists (select 1 from kisi_telefonlari t where t.kisi_id = k.id and t.aktif and t.numara like $${kisi.p.length})`; }
      const kisiler = await q(
        `select k.id, k.ad, k.sirket, k.meslek, k.notlar, k.referans_notu, k.potansiyel, k.yatirimci_tipi, k.mesaj_istemiyor, k.sahip_id,
                (select numara from kisi_telefonlari t where t.kisi_id = k.id and t.aktif order by t.ana desc limit 1) as telefon
           from kisiler k where k.silindi_at is null${kisi.kapsam} and ((${kisi.uyar}) or ${telefon})
          order by (${kisi.hepsi(duz("k.ad"))}) desc, ${duz("k.ad")}, k.id limit ${SINIR + 1}`, kisi.p);
      if (!sozcukler.length) return { kisiler, mulkler: [], talepler: [], gorusmeler: [], hatirlatmalar: [], danismanlar: await danismanlarAl(q, req) };

      const mulk = kur("", "m.sahip_id");
      mulk.p.push(ben);
      const mulkMetni = duz(`m.baslik || ' ' || m.konum_notu || ' ' || m.kaynak_notu || ' ' || m.ada || ' ' || m.parsel || ' ' || m.kategori || ' ' || replace(m.alt_tur, '_', ' ')
        || ' ' || coalesce(m.ozellikler->>'proje_adi', '') || ' ' || coalesce(i.ad, '') || ' ' || coalesce(h.ad, '') || ' ' || coalesce(il.ad, '') || ' ' || coalesce(mk.ad, '') || ' ' || coalesce(kk.ad, '')
        || ' ' || case when m.sahip_id = $${mulk.p.length} then m.notlar else '' end`);
      const mulkler = await q(
        `select m.*, mk.ad as malik_ad, coalesce(kk.ad, nullif(m.kaynak_notu, '')) as getiren
           from mulkler m left join kisiler mk on mk.id = m.malik_kisi_id left join kisiler kk on kk.id = m.kaynak_kisi_id
           left join ilceler i on i.id = m.ilce_id left join mahalleler h on h.id = m.mahalle_id left join iller il on il.id = m.il_id
          where m.silindi_at is null${mulk.kapsam} and ${mulk.hepsi(mulkMetni)}
          order by (m.durum in ('aktif', 'opsiyonlu')) desc, m.olusturma_at desc, m.id limit ${SINIR + 1}`, mulk.p);

      const talep = kur(duz(`t.notlar || ' ' || k.ad || ' ' || array_to_string(t.kategoriler, ' ') || ' ' || replace(array_to_string(t.alt_turler, ' '), '_', ' ')
        || ' ' || coalesce((select string_agg(i.ad, ' ') from jsonb_array_elements(t.bolgeler) b join ilceler i on i.id = (b->>'ilce')::int), '')`), "t.sahip_id");
      const talepler = await q(
        `select t.*, k.ad as kisi_ad from talepler t join kisiler k on k.id = t.kisi_id
          where t.silindi_at is null and k.silindi_at is null${talep.kapsam} and ${talep.uyar}
          order by (t.durum = 'aktif') desc, t.olusturma_at desc, t.id limit ${SINIR + 1}`, talep.p);

      // Görüşme notları: kişisi yukarıda zaten bulunmuşsa yinelenmez (eski notlar hem kişide hem görüşmede durur)
      const gorusme = kur(duz("g.notu"), "k.sahip_id");
      gorusme.p.push(kisiler.map((k) => k.id));
      const gorusmeler = await q(
        `select * from (
           select distinct on (g.kisi_id, g.notu) g.id, g.kisi_id, g.tarih, g.tarih_yaklasik, g.ilce_id, g.mahalle_id, g.notu, g.olusturma_at, k.ad as kisi_ad, k.sahip_id
             from gorusmeler g join kisiler k on k.id = g.kisi_id
            where k.silindi_at is null${gorusme.kapsam} and ${gorusme.uyar} and not (g.kisi_id = any($${gorusme.p.length}::uuid[]))
            order by g.kisi_id, g.notu, g.tarih desc nulls last) x
          order by x.tarih desc nulls last, x.olusturma_at desc, x.id limit ${SINIR + 1}`, gorusme.p);

      const hat = kur(duz("h.notu"), "k.sahip_id");
      const hatirlatmalar = await q(
        `select h.id, h.kisi_id, h.tarih, h.notu, h.tamamlandi_at, k.ad as kisi_ad, k.sahip_id
           from hatirlatmalar h join kisiler k on k.id = h.kisi_id
          where k.silindi_at is null${hat.kapsam} and ${hat.uyar}
          order by (h.tamamlandi_at is null) desc, h.tarih, h.id limit ${SINIR + 1}`, hat.p);
      return { kisiler, mulkler, talepler, gorusmeler, hatirlatmalar, danismanlar: await danismanlarAl(q, req) };
    }) : null;

    const danismanlar = v?.danismanlar || (await islem(req.kullanici, (q) => danismanlarAl(q, req)));
    const kimin = (sahipId) => (sahipId !== ben ? danismanEtiketi(danismanlar.get(sahipId)) : "");
    const BOLUMLER = { kisiler: "Kişiler", mulkler: "Mülkler", talepler: "Talepler", gorusmeler: "Görüşme notları", hatirlatmalar: "Hatırlatmalar" };
    const adet = (liste) => (liste.length > SINIR ? SINIR + "+" : liste.length);
    const bolum = (kod, satir) => (v[kod].length ? html`<div class="kart" id="${kod}"><h2>${BOLUMLER[kod]} (${adet(v[kod])})</h2>
      <ul class="liste">${v[kod].slice(0, SINIR).map(satir)}</ul>${v[kod].length > SINIR ? html`<p class="soluk">Daha fazla sonuç var; bir sözcük daha yazarak daraltın.</p>` : ""}</div>` : "");
    // Sonuç birden çok bölümdeyse üstte kısa yol: uzun kişi listesinin altındaki mülkler gözden kaçmasın
    const dolu = v ? Object.keys(BOLUMLER).filter((kod) => v[kod].length) : [];
    const toplam = v ? v.kisiler.length + v.mulkler.length + v.talepler.length + v.gorusmeler.length + v.hatirlatmalar.length : 0;
    return reply.sayfa(sayfa(req, { baslik: ham ? `“${ham}”` : "Arama", icerik: html`
      <div class="baslik-satiri"><h1>Arama ${ampul("arama")}</h1></div>
      <form class="arama" method="get" action="/ara"><input type="search" name="q" value="${ham}" placeholder="Ad, yer, ada / parsel, telefon ya da notta geçen bir söz" aria-label="Her şeyde ara"${ham ? "" : " autofocus"}>${kapsamSecici(danismanlar, kap.kimin)}<button class="dugme ikincil">Ara</button></form>
      ${!ham ? html`<div class="kart">${bos("Kişilerde, mülklerde, taleplerde, görüşme notlarında ve hatırlatmalarda aynı anda arar.")}</div>`
        : !v ? html`<div class="kart">${bos("Aramak için en az iki harf yazın.")}</div>`
        : !toplam ? html`<div class="kart">${bos(`“${ham}” için kayıt bulunamadı.`)}</div>` : ""}
      ${dolu.length > 1 ? html`<nav class="sekmeler" aria-label="Sonuç bölümleri">${dolu.map((kod) => html`<a href="#${kod}">${BOLUMLER[kod]} (${adet(v[kod])})</a>`)}</nav>` : ""}
      ${v ? html`
      ${bolum("kisiler", (k) => html`<li><div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a><small>${[telefonYaz(k.telefon), k.meslek, k.sirket].filter(Boolean).join(" · ")}</small>
          ${kesit(k.notlar, sozcukler) || kesit(k.referans_notu, sozcukler)}<div class="etiketler">${kisiEtiketleri(k)}${kimin(k.sahip_id)}</div></div></li>`)}
      ${bolum("mulkler", (m) => html`<li><div class="govde"><a class="ad" href="/mulkler/${m.id}">${m.baslik || `${ISLEM_ADI[m.islem]} · ${mulkTarifi(m, konum)}`}</a>
          <small>${[m.baslik ? `${ISLEM_ADI[m.islem]} · ${mulkTarifi(m, konum)}` : "", fiyatYaz(m), m.ada || m.parsel ? `ada ${m.ada || "—"} / parsel ${m.parsel || "—"}` : "", m.malik_ad, m.getiren ? "getiren: " + m.getiren : ""].filter(Boolean).join(" · ")}</small>
          ${m.sahip_id === ben ? kesit(m.notlar, sozcukler) : ""}<div class="etiketler">${m.durum !== "aktif" ? html`<span class="etiket-k">${MULK_DURUMU[m.durum]}</span>` : ""}${kimin(m.sahip_id)}</div></div></li>`)}
      ${bolum("talepler", (t) => html`<li><div class="govde"><a class="ad" href="/talepler/${t.id}">${t.kisi_ad} · ${ISLEM_ADI[t.islem]} · ${talepTarifi(t, konum)}</a>
          ${kesit(t.notlar, sozcukler)}<div class="etiketler">${t.durum !== "aktif" ? html`<span class="etiket-k">${TALEP_DURUMU[t.durum]}</span>` : ""}${kimin(t.sahip_id)}</div></div></li>`)}
      ${bolum("gorusmeler", (g) => html`<li><div class="govde"><a class="ad" href="/kisiler/${g.kisi_id}">${g.kisi_ad}</a><small>${[gorusmeTarihi(g), konum.yerAdi(g.ilce_id, g.mahalle_id)].filter(Boolean).join(" · ")}</small>
          ${kesit(g.notu, sozcukler)}<div class="etiketler">${kimin(g.sahip_id)}</div></div></li>`)}
      ${bolum("hatirlatmalar", (h) => html`<li><div class="govde"><a class="ad" href="/kisiler/${h.kisi_id}">${h.kisi_ad}</a><small>${tarihYaz(h.tarih)}${h.tamamlandi_at ? " · arandı" : ""}</small>
          ${kesit(h.notu, sozcukler)}<div class="etiketler">${kimin(h.sahip_id)}</div></div></li>`)}` : ""}` }));
  });
}
