// Mülkler: liste, kayıt formu, mülk kartı (uygun alıcılar, talebi olmayan adaylar, ekip eşleşmeleri).
import { islem } from "../db.js";
import { html, jsonGom, nitelik, satirli } from "../lib/html.js";
import { sayfa, ampul, alan, paraAlani, csrfAlani, bos, EVET_HAYIR, danismanEtiketi } from "../gorunum/duzen.js";
import { konumSecici, konumOku, VARSAYILAN_IL } from "../gorunum/konum.js";
import { eslesmeSatiri, mulkTarifi, fiyatYaz, dolarKarsiligi, kisiEtiketleri, ozellikDegeri, kapsamSecici, sayfalama, kisiSecici, belgeBolumu, ISLEM_ADI, MULK_DURUMU } from "../gorunum/parcalar.js";
import { KATEGORILER, kategori, kategoriAdi, altTurAdi, mulkAlanlari } from "../alan/kategoriler.js";
import { usd } from "../alan/eslestirme.js";
import { konumYukle, kurAl, kaydet, KullaniciHatasi, kapsamOku, danismanlarAl, yoneticiMi } from "../servis/ortak.js";
import { mulkIcinHesapla } from "../servis/eslesme.js";
import { mulkunAlicilari, talepsizAdaylar } from "../servis/liste.js";
import { mulkSil } from "../servis/silme.js";
import { numaraCakismasi } from "./kisiler.js";
import { metin, dizi, sayi, secim, uuidMi, evetHayir, isaretli } from "../lib/form.js";
import { telefonNorm, paraYaz, sayiYaz, tarihYaz } from "../lib/metin.js";

const SAYFA = 50;
const ISLEMLER = [{ kod: "satilik", ad: "Satılık" }, { kod: "kiralik", ad: "Kiralık" }];

export async function mulkGetir(q, id) {
  const m = uuidMi(id) ? await q.bir("select * from mulkler where id = $1", [id]) : null;
  if (!m) throw new KullaniciHatasi("Mülk bulunamadı. Silinmiş ya da size ait olmayabilir.", 404);
  return m;
}

// Seçilen türe özel alanlar (tür değişince tarayıcı bu parçayı yeniden ister)
function ozellikAlanlari(kat, tur, o = {}) {
  return html`<div class="izgara uc">${mulkAlanlari(kat, tur).map((a) => {
    const ad = "o_" + a.anahtar, v = o[a.anahtar];
    if (a.tip === "secim") return alan({ ad, etiket: a.ad, tip: "select", deger: v ?? "", liste: [{ kod: "", ad: "—" }, ...a.secenekler] });
    if (a.tip === "evet_hayir") return alan({ ad, etiket: a.ad, tip: "select", deger: v === true ? "evet" : v === false ? "hayir" : "", liste: EVET_HAYIR });
    if (a.tip === "coklu") return html`<div class="alan tam"><span class="etiket">${a.ad}</span><div class="secenekler">${a.secenekler.map((s) => html`<label class="secenek"><input type="checkbox" name="${ad}" value="${s.kod}"${nitelik("checked", (v || []).includes(s.kod))}> ${s.ad}</label>`)}</div></div>`;
    if (a.tip === "sayi") return alan({ ad, etiket: a.ad, deger: v == null ? "" : sayiYaz(v, 2), ek: 'inputmode="decimal"' });
    return alan({ ad, etiket: a.ad, deger: v ?? "", ek: 'maxlength="200"' });
  })}</div>`;
}
function ozellikleriOku(kat, tur, f) {
  const o = {};
  for (const a of mulkAlanlari(kat, tur)) {
    const ham = f["o_" + a.anahtar];
    let v = null;
    if (a.tip === "sayi") v = sayi(ham);
    else if (a.tip === "secim") v = secim(ham, a.secenekler.map((s) => s.kod));
    else if (a.tip === "evet_hayir") v = evetHayir(ham);
    else if (a.tip === "coklu") { v = dizi(ham).filter((x) => a.secenekler.some((s) => s.kod === x)); if (!v.length) v = null; }
    else v = metin(ham, 200) || null;
    if (v != null) o[a.anahtar] = v;
  }
  return o;
}

function mulkFormu(req, konum, m, malik) {
  const yeni = !m.id, kat = m.kategori, tur = m.alt_tur;
  return html`<form class="form kart" method="post" action="${yeni ? "/mulkler" : `/mulkler/${m.id}`}" id="mulk-formu">${csrfAlani(req)}
    <div class="izgara uc">
      ${alan({ ad: "islem", etiket: "İşlem", tip: "select", deger: m.islem, liste: ISLEMLER })}
      ${alan({ ad: "kategori", etiket: "Kategori", tip: "select", deger: kat, liste: KATEGORILER })}
      ${alan({ ad: "alt_tur", etiket: "Tür", tip: "select", deger: tur, liste: kategori(kat).turler })}
    </div>
    <label class="secenek"><input type="checkbox" name="ofis_mulku" value="1"${nitelik("checked", m.ofis_mulku)}> Ofis mülkü (sahibi rehberde bir kişi değil)</label>
    <div id="malik-alani">
      ${kisiSecici({ ad: "malik_kisi_id", etiket: "Mülk sahibi (rehberinizden)", secili: malik })}
      <details${nitelik("open", !!(m.malik_ad))}><summary class="soluk">Rehberde yok mu? Yeni kişi olarak ekleyin</summary><div class="izgara iki">
        ${alan({ ad: "malik_ad", etiket: "Ad soyad", deger: m.malik_ad || "" })}${alan({ ad: "malik_telefon", etiket: "Telefon", tip: "tel", deger: m.malik_telefon || "" })}</div></details>
    </div>
    ${konumSecici(konum, { il: m.il_id || VARSAYILAN_IL, ilce: m.ilce_id, mahalle: m.mahalle_id, zorunlu: true })}
    <div class="izgara uc">
      ${alan({ ad: "ada", etiket: "Ada", deger: m.ada, ek: 'maxlength="20" inputmode="numeric"' })}
      ${alan({ ad: "parsel", etiket: "Parsel", deger: m.parsel, ek: 'maxlength="20" inputmode="numeric"' })}
      ${alan({ ad: "konum_notu", etiket: "Konum notu", deger: m.konum_notu, yer: "örn. sahile 2 sokak", ek: 'maxlength="300"' })}
    </div>
    ${paraAlani({ ad: "fiyat", etiket: "Fiyat (kiralıkta aylık kira)", tutar: m.fiyat_tutar == null ? "" : sayiYaz(m.fiyat_tutar), para: m.fiyat_para })}
    <fieldset><legend>Özellikler</legend><div id="ozellik-alanlari">${ozellikAlanlari(kat, tur, m.ozellikler || {})}</div></fieldset>
    <fieldset data-islem="satilik"><legend>Danışman tahminleri ${ampul("tahmin")}</legend>
      <div class="izgara uc">
        ${paraAlani({ ad: "tahmini_deger", etiket: "Tahmini piyasa değeri", tutar: m.tahmini_deger_tutar == null ? "" : sayiYaz(m.tahmini_deger_tutar), para: m.tahmini_deger_para || m.fiyat_para })}
        ${alan({ ad: "tahmini_satis_ay", etiket: "Tahmini satış süresi (ay)", deger: m.tahmini_satis_ay ?? "", ek: 'inputmode="decimal"' })}
        ${alan({ ad: "tahmini_kira_tutar", etiket: "Tahmini aylık kira (TL)", deger: m.tahmini_kira_tutar == null ? "" : sayiYaz(m.tahmini_kira_tutar), ek: 'inputmode="decimal"' })}
      </div>
      <label class="secenek"><input type="checkbox" name="acil" value="1"${nitelik("checked", m.acil)}> Acil satılık</label>
      <label class="secenek"><input type="checkbox" name="pazarlik_payi" value="1"${nitelik("checked", m.pazarlik_payi)}> Pazarlık payı var</label>
    </fieldset>
    ${alan({ ad: "baslik", etiket: "Kısa başlık (isteğe bağlı)", deger: m.baslik, yer: "örn. Deniz manzaralı köşe daire", ek: 'maxlength="120"' })}
    ${alan({ ad: "notlar", etiket: "Notlar (yalnızca siz görürsünüz)", tip: "textarea", deger: m.notlar, ek: 'maxlength="5000"' })}
    <script type="application/json" id="kategori-agaci">${jsonGom(KATEGORILER.map((k) => ({ kod: k.kod, turler: k.turler.map((t) => ({ kod: t.kod, ad: t.ad })) })))}</script>
    <button class="dugme genis">${yeni ? "Mülkü kaydet ve alıcıları göster" : "Değişiklikleri kaydet"}</button>
  </form>`;
}

async function mulkKaydet(req, mevcut) {
  const f = req.form, ben = req.kullanici.id, konum = await konumYukle();
  const kat = kategori(f.kategori) ? f.kategori : null;
  if (!kat) throw new KullaniciHatasi("Kategori seçin.");
  const tur = kategori(kat).turler.some((t) => t.kod === f.alt_tur) ? f.alt_tur : null;
  if (!tur) throw new KullaniciHatasi("Mülkün türünü seçin.");
  const yer = konumOku(konum, f);
  if (!yer.ilce_id) throw new KullaniciHatasi("İlçe seçin.");
  const ofis = isaretli(f.ofis_mulku);
  const fiyat = sayi(f.fiyat_tutar), para = secim(f.fiyat_para, ["TRY", "USD"], "TRY");
  const deger = sayi(f.tahmini_deger_tutar);
  return islem(req.kullanici, async (q) => {
    let malik = null;
    if (!ofis) {
      if (uuidMi(f.malik_kisi_id)) malik = f.malik_kisi_id;
      else if (metin(f.malik_ad)) {
        const tel = telefonNorm(f.malik_telefon);
        if (!tel) throw new KullaniciHatasi("Mülk sahibinin telefon numarasını yazın.");
        await numaraCakismasi(q, ben, [tel]);
        malik = (await q.bir("insert into kisiler (sahip_id, ad) values ($1, $2) returning id", [ben, metin(f.malik_ad, 200)])).id;
        await q("insert into kisi_telefonlari (kisi_id, sahip_id, numara, ana) values ($1, $2, $3, true)", [malik, ben, tel]);
      } else throw new KullaniciHatasi("Mülk sahibini seçin ya da “Ofis mülkü” kutusunu işaretleyin.");
    }
    const kur = (await kurAl(q))?.usd_try;
    const d = [malik, ofis, secim(f.islem, ["satilik", "kiralik"], "satilik"), kat, tur, metin(f.baslik, 120), yer.il_id, yer.ilce_id, yer.mahalle_id, metin(f.konum_notu, 300), metin(f.ada, 20), metin(f.parsel, 20),
      fiyat, para, JSON.stringify(ozellikleriOku(kat, tur, f)), deger, deger == null ? null : secim(f.tahmini_deger_para, ["TRY", "USD"], para), sayi(f.tahmini_satis_ay), sayi(f.tahmini_kira_tutar), isaretli(f.acil), isaretli(f.pazarlik_payi), metin(f.notlar, 5000)];
    let id = mevcut?.id, dustu = false;
    try {
      if (id) {
        const eski = usd(mevcut.fiyat_tutar, mevcut.fiyat_para, kur), yeniF = usd(fiyat, para, kur);
        dustu = eski != null && yeniF != null && yeniF < eski * 0.995;
        const degisti = mevcut.fiyat_tutar !== fiyat || mevcut.fiyat_para !== para;
        await q(`update mulkler set malik_kisi_id=$2, ofis_mulku=$3, islem=$4, kategori=$5, alt_tur=$6, baslik=$7, il_id=$8, ilce_id=$9, mahalle_id=$10, konum_notu=$11, ada=$12, parsel=$13, fiyat_tutar=$14, fiyat_para=$15, ozellikler=$16,
          tahmini_deger_tutar=$17, tahmini_deger_para=$18, tahmini_satis_ay=$19, tahmini_kira_tutar=$20, acil=$21, pazarlik_payi=$22, notlar=$23, guncelleme_at=now(),
          onceki_fiyat_tutar = case when $24 then fiyat_tutar else onceki_fiyat_tutar end, fiyat_degisim_at = case when $24 then now() else fiyat_degisim_at end where id=$1`, [id, ...d, degisti && mevcut.fiyat_tutar != null]);
      } else {
        id = (await q.bir(`insert into mulkler (sahip_id, malik_kisi_id, ofis_mulku, islem, kategori, alt_tur, baslik, il_id, ilce_id, mahalle_id, konum_notu, ada, parsel, fiyat_tutar, fiyat_para, ozellikler,
          tahmini_deger_tutar, tahmini_deger_para, tahmini_satis_ay, tahmini_kira_tutar, acil, pazarlik_payi, notlar) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning id`, [ben, ...d])).id;
      }
    } catch (e) {
      if (e.code === "42501") throw new KullaniciHatasi("Mülk sahibi olarak yalnızca kendi rehberinizdeki bir kişiyi seçebilirsiniz.");
      throw e;
    }
    await kaydet(q, req, mevcut ? "mulk_degisti" : "mulk_eklendi", "mulk", id, dustu ? { fiyat_dustu: true } : {});
    const sayiE = await mulkIcinHesapla(q, id, { fiyatDustu: dustu });
    return { id, sayi: sayiE };
  });
}

export default async function (app) {
  app.get("/mulkler", async (req, reply) => {
    const s = req.query, kap = kapsamOku(req), konum = await konumYukle();
    const durum = secim(s.durum, ["acik", "hepsi", "satildi", "pasif"], "acik"), kat = kategori(s.kategori) ? s.kategori : "", no = Math.max(1, Number(s.sayfa) || 1);
    const v = await islem(req.kullanici, async (q) => {
      const kosul = ["m.silindi_at is null"], p = [];
      if (kap.sahipId) { p.push(kap.sahipId); kosul.push(`m.sahip_id = $${p.length}`); }
      if (durum === "acik") kosul.push("m.durum in ('aktif', 'opsiyonlu')");
      else if (durum !== "hepsi") { p.push(durum); kosul.push(`m.durum = $${p.length}`); }
      if (kat) { p.push(kat); kosul.push(`m.kategori = $${p.length}`); }
      const liste = await q(`select m.*, k.ad as malik_ad,
          (select count(*) from eslesmeler e where e.mulk_id = m.id and e.gecerli and e.durum <> 'reddedildi' and e.talep_sahip_id = e.mulk_sahip_id) as alici
        from mulkler m left join kisiler k on k.id = m.malik_kisi_id where ${kosul.join(" and ")} order by m.olusturma_at desc limit ${SAYFA + 1} offset ${(no - 1) * SAYFA}`, p);
      return { liste, danismanlar: await danismanlarAl(q, req) };
    });
    return reply.sayfa(sayfa(req, { baslik: "Mülkler", icerik: html`
      <div class="baslik-satiri"><h1>Mülkler</h1><a class="dugme kucuk" href="/mulkler/yeni">+ Mülk</a></div>
      <form class="arama" method="get">
        <select name="durum" aria-label="Durum">${[["acik", "Satışta olanlar"], ["satildi", "Satıldı / kiralandı"], ["pasif", "Pasif"], ["hepsi", "Hepsi"]].map(([k, a]) => html`<option value="${k}"${nitelik("selected", durum === k)}>${a}</option>`)}</select>
        <select name="kategori" aria-label="Kategori"><option value="">Bütün kategoriler</option>${KATEGORILER.map((k) => html`<option value="${k.kod}"${nitelik("selected", kat === k.kod)}>${k.ad}</option>`)}</select>
        ${kapsamSecici(v.danismanlar, kap.kimin)}<button class="dugme ikincil">Göster</button></form>
      <div class="kart">${v.liste.length ? html`<ul class="liste">${v.liste.slice(0, SAYFA).map((m) => html`<li>
        <div class="govde"><a class="ad" href="/mulkler/${m.id}">${ISLEM_ADI[m.islem]} · ${mulkTarifi(m, konum)}</a><small>${fiyatYaz(m)}${m.ofis_mulku ? " · ofis mülkü" : m.malik_ad ? " · " + m.malik_ad : ""}${m.baslik ? " · " + m.baslik : ""}</small>
          <div class="etiketler">${m.durum !== "aktif" ? html`<span class="etiket-k">${MULK_DURUMU[m.durum]}</span>` : ""}${m.acil ? html`<span class="etiket-k uyari">acil</span>` : ""}${m.sahip_id !== req.kullanici.id ? danismanEtiketi(v.danismanlar.get(m.sahip_id)) : ""}</div></div>
        <div class="yan">${m.alici ? html`<span class="sayac">${m.alici} alıcı</span>` : ""}</div></li>`)}</ul>` : bos("Bu görünümde mülk yok.", html`<a class="dugme" href="/mulkler/yeni">Mülk ekle</a>`)}</div>
      ${sayfalama(req, no, v.liste.length > SAYFA)}` }));
  });

  app.get("/mulkler/alanlar", async (req, reply) => {
    const kat = kategori(req.query.kategori) ? req.query.kategori : "konut";
    return reply.type("text/html; charset=utf-8").send(String(ozellikAlanlari(kat, String(req.query.alt_tur || ""))));
  });

  app.get("/mulkler/yeni", async (req, reply) => {
    const s = req.query, konum = await konumYukle();
    const kat = kategori(s.kategori) ? s.kategori : "konut";
    const yer = konumOku(konum, s);
    const malik = uuidMi(s.kisi) ? await islem(req.kullanici, (q) => q.bir("select id, ad from kisiler where id = $1 and sahip_id = $2 and silindi_at is null", [s.kisi, req.kullanici.id])) : null;
    const m = { islem: secim(s.islem, ["satilik", "kiralik"], "satilik"), kategori: kat, alt_tur: kategori(kat).turler.some((t) => t.kod === s.alt_tur) ? s.alt_tur : kategori(kat).turler[0].kod, ...yer, fiyat_tutar: sayi(s.fiyat_tutar), fiyat_para: secim(s.fiyat_para, ["TRY", "USD"], "TRY"), ozellikler: {} };
    return reply.sayfa(sayfa(req, { baslik: "Yeni mülk", geri: { yol: "/mulkler", ad: "Mülkler" }, icerik: html`<h1>Yeni mülk</h1>${mulkFormu(req, konum, m, malik)}` }));
  });
  app.post("/mulkler", async (req, reply) => {
    const { id, sayi: n } = await mulkKaydet(req, null);
    return reply.bildir(n ? `Mülk kaydedildi. ${n} eşleşme bulundu.` : "Mülk kaydedildi.").redirect("/mulkler/" + id);
  });
  const kendiMulku = (m, req) => { if (m.sahip_id !== req.kullanici.id || m.silindi_at) throw new KullaniciHatasi("Bu kaydı yalnızca kaydın sahibi değiştirebilir.", 403); return m; };
  app.get("/mulkler/:id/duzenle", async (req, reply) => {
    const v = await islem(req.kullanici, async (q) => {
      const m = kendiMulku(await mulkGetir(q, req.params.id), req);
      return { m, malik: m.malik_kisi_id ? await q.bir("select id, ad from kisiler where id = $1", [m.malik_kisi_id]) : null };
    });
    return reply.sayfa(sayfa(req, { baslik: "Mülkü düzenle", geri: { yol: "/mulkler/" + v.m.id, ad: "Mülk" }, icerik: html`<h1>Mülkü düzenle</h1>${mulkFormu(req, await konumYukle(), v.m, v.malik)}` }));
  });
  app.post("/mulkler/:id", async (req, reply) => {
    const m = kendiMulku(await islem(req.kullanici, (q) => mulkGetir(q, req.params.id)), req);
    await mulkKaydet(req, m);
    return reply.bildir("Değişiklikler kaydedildi.").redirect("/mulkler/" + m.id);
  });
  app.post("/mulkler/:id/durum", async (req, reply) => {
    const durum = secim(req.form.durum, Object.keys(MULK_DURUMU));
    if (!durum) throw new KullaniciHatasi("Durum seçin.");
    await islem(req.kullanici, async (q) => {
      const m = kendiMulku(await mulkGetir(q, req.params.id), req);
      await q("update mulkler set durum = $2, guncelleme_at = now() where id = $1", [m.id, durum]);
      await kaydet(q, req, "mulk_durum", "mulk", m.id, { durum });
      await mulkIcinHesapla(q, m.id);
    });
    return reply.bildir("Durum güncellendi.").redirect("/mulkler/" + req.params.id);
  });
  app.post("/mulkler/:id/sil", async (req, reply) => {
    if (!uuidMi(req.params.id)) throw new KullaniciHatasi("Mülk bulunamadı.", 404);
    await islem(req.kullanici, (q) => mulkSil(q, req, req.params.id));
    return reply.bildir("Mülk silindi.").redirect("/mulkler");
  });
  // Alıcı bu mülkle ilgilenmiyor: eşleşme listeden kalkar
  app.post("/mulkler/:id/reddet", async (req, reply) => {
    await islem(req.kullanici, async (q) => {
      const m = kendiMulku(await mulkGetir(q, req.params.id), req);
      if (!uuidMi(req.form.reddet)) throw new KullaniciHatasi("Eşleşme bulunamadı.", 404);
      await q.sistem(() => q("update eslesmeler set durum = 'reddedildi' where mulk_id = $1 and talep_id = $2 and talep_sahip_id = $3 and mulk_sahip_id = $3", [m.id, req.form.reddet, req.kullanici.id]));
    });
    return reply.bildir("Eşleşme listeden kaldırıldı.").redirect("/mulkler/" + req.params.id);
  });

  app.get("/mulkler/:id", async (req, reply) => {
    const konum = await konumYukle(), ben = req.kullanici.id;
    const v = await islem(req.kullanici, async (q) => {
      const m = await mulkGetir(q, req.params.id);
      const benim = m.sahip_id === ben && !m.silindi_at;
      const alicilar = await mulkunAlicilari(q, m, "kendi");
      if (benim) await q.sistem(() => q("update eslesmeler set durum = 'goruldu' where mulk_id = $1 and durum = 'yeni' and talep_sahip_id = $2 and mulk_sahip_id = $2", [m.id, ben]));
      return {
        m, benim, alicilar,
        malik: m.malik_kisi_id ? await q.bir("select id, ad, mesaj_istemiyor from kisiler where id = $1", [m.malik_kisi_id]) : null,
        adaylar: benim && ["aktif", "opsiyonlu"].includes(m.durum) ? await talepsizAdaylar(q, m, ben, alicilar.map((a) => a.kisi_id)) : [],
        ekip: yoneticiMi(req.kullanici) ? await mulkunAlicilari(q, m, "ekip") : [],
        belgeler: await q("select * from belgeler where mulk_id = $1 order by olusturma_at desc", [m.id]),
        kur: await kurAl(q), danismanlar: await danismanlarAl(q, req),
      };
    });
    const { m, benim } = v, o = m.ozellikler || {};
    const ozellikler = mulkAlanlari(m.kategori, m.alt_tur).map((a) => [a.ad, ozellikDegeri(a.anahtar, o[a.anahtar])]).filter(([, d]) => d != null);
    const izmir = m.il_id === 35;
    return reply.sayfa(sayfa(req, { baslik: mulkTarifi(m, konum), geri: { yol: "/mulkler", ad: "Mülkler" }, icerik: html`
      <div class="kart">
        <div class="baslik-satiri"><h1>${m.baslik || mulkTarifi(m, konum)}</h1>${benim ? html`<a class="dugme ikincil kucuk" href="/mulkler/${m.id}/duzenle">Düzenle</a>` : ""}</div>
        <p><b>${ISLEM_ADI[m.islem]} · ${fiyatYaz(m)}</b> <small>${dolarKarsiligi(m.fiyat_tutar, m.fiyat_para, v.kur?.usd_try)}${m.onceki_fiyat_tutar != null && m.onceki_fiyat_tutar !== m.fiyat_tutar ? ` · önceki fiyat ${paraYaz(m.onceki_fiyat_tutar, m.fiyat_para)} (${tarihYaz(m.fiyat_degisim_at)})` : ""}</small></p>
        <div class="etiketler"><span class="etiket-k${m.durum === "aktif" ? " iyi" : ""}">${MULK_DURUMU[m.durum]}</span>${m.acil ? html`<span class="etiket-k uyari">acil</span>` : ""}${m.pazarlik_payi ? html`<span class="etiket-k">pazarlık payı var</span>` : ""}${m.silindi_at ? html`<span class="etiket-k uyari">silindi</span>` : ""}${!benim && m.sahip_id !== ben ? danismanEtiketi(v.danismanlar.get(m.sahip_id)) : ""}</div>
        <dl class="tanim">
          <dt>Tür</dt><dd>${kategoriAdi(m.kategori)} · ${altTurAdi(m.kategori, m.alt_tur)}</dd>
          <dt>Yer</dt><dd>${[konum.ilAdi(m.il_id), konum.ilceAdi(m.ilce_id), konum.mahalleAdi(m.mahalle_id)].filter(Boolean).join(" / ")}${m.konum_notu ? " · " + m.konum_notu : ""}</dd>
          <dt>Sahibi</dt><dd>${m.ofis_mulku ? "Ofis mülkü" : v.malik ? html`<a href="/kisiler/${v.malik.id}">${v.malik.ad}</a>` : "—"}</dd>
          ${ozellikler.map(([ad, d]) => html`<dt>${ad}</dt><dd>${d}</dd>`)}
          ${m.tahmini_deger_tutar != null ? html`<dt>Tahmini değer</dt><dd>${paraYaz(m.tahmini_deger_tutar, m.tahmini_deger_para || m.fiyat_para)} <small>(danışman tahmini)</small></dd>` : ""}
          ${m.tahmini_satis_ay != null ? html`<dt>Tahmini satış süresi</dt><dd>${sayiYaz(m.tahmini_satis_ay, 1)} ay <small>(danışman tahmini)</small></dd>` : ""}
          ${m.tahmini_kira_tutar != null ? html`<dt>Tahmini kira</dt><dd>${paraYaz(m.tahmini_kira_tutar, "TRY")} / ay <small>(danışman tahmini)</small></dd>` : ""}
          ${m.notlar && benim ? html`<dt>Notlar</dt><dd>${satirli(m.notlar)}</dd>` : ""}
        </dl>
        ${m.ada || m.parsel ? html`<p><b>Ada / parsel:</b> ${m.ada || "—"} / ${m.parsel || "—"} <button type="button" class="dugme sade kucuk" data-kopyala="${m.ada} / ${m.parsel}">Kopyala</button></p>` : ""}
        <div class="dugmeler"><span class="soluk">Resmi kaynaklar ${ampul("parsel")}</span>
          <a class="dugme sade kucuk" href="https://parselsorgu.tkgm.gov.tr/" target="_blank" rel="noopener noreferrer">TKGM Parsel Sorgu</a>
          ${izmir ? html`<a class="dugme sade kucuk" href="https://kentrehberi.izmir.bel.tr/" target="_blank" rel="noopener noreferrer">İzmir Kent Rehberi</a>` : ""}
          <a class="dugme sade kucuk" href="https://www.turkiye.gov.tr/belediyeler" target="_blank" rel="noopener noreferrer">Belediye e-İmar (e-Devlet)</a></div>
        ${benim ? html`<form method="post" action="/mulkler/${m.id}/durum" class="satir-form">${csrfAlani(req)}<select name="durum" aria-label="Durum">${Object.entries(MULK_DURUMU).map(([k, a]) => html`<option value="${k}"${nitelik("selected", m.durum === k)}>${a}</option>`)}</select> <button class="dugme ikincil kucuk">Durumu değiştir</button></form>` : ""}
      </div>

      <div class="kart"><div class="baslik-satiri"><h2>Uygun alıcılar (${v.alicilar.length}) ${ampul("puan")}</h2>
          ${benim && v.malik && v.alicilar.length ? html`<a class="dugme ikincil kucuk" href="/mesaj?kisi=${v.malik.id}&mulk=${m.id}&yon=saticiya">Mülk sahibine haber ver</a>` : ""}</div>
        ${v.alicilar.length ? html`<form method="post" action="/mesaj/sira">${csrfAlani(req)}<input type="hidden" name="mulk" value="${m.id}">
          <ul class="liste">${v.alicilar.map((e) => eslesmeSatiri(e, { yon: "alici", konum, secim: benim,
            ekDugme: benim ? html`<a class="dugme kucuk" href="/mesaj?kisi=${e.kisi_id}&mulk=${m.id}&talep=${e.talep_id}">Mesaj</a><button class="baglanti-dugme" name="reddet" value="${e.talep_id}" formaction="/mulkler/${m.id}/reddet" data-onay="Bu alıcı listeden kaldırılsın mı?">ilgilenmiyor</button>` : "" }))}</ul>
          ${benim ? html`<div class="dugmeler"><button type="button" class="dugme sade kucuk" data-hepsi=".alici-secim:not(:disabled)|1">Hepsini seç</button><button type="button" class="dugme sade kucuk" data-hepsi=".alici-secim|0">Seçimi kaldır</button>
            <button class="dugme">Seçilenlere sırayla gönder (<span data-secili-sayac=".alici-secim">0</span>)</button> ${ampul("sirayla_gonder")}</div>` : ""}</form>`
          : html`<p class="soluk">${["aktif", "opsiyonlu"].includes(m.durum) ? "Rehberde bu mülke uyan açık talep yok." : "Mülk satışta olmadığı için eşleşme aranmıyor."}</p>`}
      </div>
      ${v.adaylar.length ? html`<div class="kart"><h2>Talebi yok ama alabilir (${v.adaylar.length})</h2><ul class="liste">${v.adaylar.map((k) => html`<li>
        <div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a><div class="neden">${k.nedenler.join(" · ")}</div><div class="etiketler">${kisiEtiketleri(k)}${k.para_bilinmiyor ? html`<span class="etiket-k uyari">parası bilinmiyor</span>` : ""}</div></div>
        <div class="yan">${k.mesaj_istemiyor ? "" : html`<a class="dugme kucuk ikincil" href="/mesaj?kisi=${k.id}&mulk=${m.id}">Mesaj</a>`}</div></li>`)}</ul></div>` : ""}
      ${v.ekip.length ? html`<div class="kart"><h2>Ekip eşleşmeleri (${v.ekip.length}) ${ampul("ekip_eslesmeleri")}</h2><p class="soluk">Başka danışmanların alıcıları. Bu bölümü yalnızca yöneticiler görür.</p>
        <ul class="liste">${v.ekip.map((e) => eslesmeSatiri(e, { yon: "alici", konum, danisman: v.danismanlar.get(e.talep_sahip_id) }))}</ul><p><a href="/yonetim/ekip-eslesmeleri">Ekip eşleşmeleri ekranına git ›</a></p></div>` : ""}
      ${belgeBolumu(req, v.belgeler, { mulkId: m.id, yazabilir: benim })}
      ${(m.sahip_id === ben || req.kullanici.rol === "sahip") && !m.silindi_at ? html`<form method="post" action="/mulkler/${m.id}/sil">${csrfAlani(req)}<button class="dugme tehlike kucuk" data-onay="Mülk silinsin mi?">Mülkü sil</button></form>` : ""}` }));
  });
}
