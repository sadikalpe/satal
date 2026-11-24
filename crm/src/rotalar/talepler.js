// Talepler (aranan mülk): liste, kayıt formu, talep kartı (uygun mülkler).
import { islem } from "../db.js";
import { html, nitelik, satirli } from "../lib/html.js";
import { sayfa, ampul, alan, csrfAlani, bos, PARA, danismanEtiketi } from "../gorunum/duzen.js";
import { bolgeSecici, bolgeleriOku } from "../gorunum/konum.js";
import { eslesmeSatiri, talepTarifi, butceYaz, olcutMetni, kapsamSecici, sayfalama, kisiSecici, kutular, aliciTipiAdi, ISLEM_ADI, TALEP_DURUMU } from "../gorunum/parcalar.js";
import { TALEP_KATEGORILERI, kategori, kategoriAdi, altTurAdi, talepOlcutleri, kalip, ALICI_TIPLERI, aliciTipi } from "../alan/kategoriler.js";
import { konumYukle, kurAl, dolaraSabitle, kaydet, KullaniciHatasi, kapsamOku, danismanlarAl, yoneticiMi, ayarlarAl } from "../servis/ortak.js";
import { talepIcinHesapla } from "../servis/eslesme.js";
import { talebinMulkleri } from "../servis/liste.js";
import { talepSil } from "../servis/silme.js";
import { metin, dizi, sayi, secim, uuidMi, isaretli } from "../lib/form.js";
import { sayiYaz, tarihYaz, paraYaz, neKadarOnce } from "../lib/metin.js";

const SAYFA = 50;
const ODEME = [{ kod: "pesin", ad: "Peşin" }, { kod: "kredi", ad: "Kredi" }, { kod: "takas", ad: "Takas" }, { kod: "vadeli", ad: "Vadeli" }];
const ELDE = [{ kod: "", ad: "—" }, { kod: "kisa", ad: "Kısa (1 yıla kadar)" }, { kod: "orta", ad: "Orta (1–5 yıl)" }, { kod: "uzun", ad: "Uzun (5 yıldan fazla)" }];
const YATIRIM_TIPLERI = ALICI_TIPLERI.filter((t) => !t.puanli).map((t) => t.kod).join(" ");
const BUTUN_OLCUTLER = talepOlcutleri(TALEP_KATEGORILERI.map((k) => k.kod));
const olcutKategorileri = (anahtar) => TALEP_KATEGORILERI.filter((k) => kalip(k.kod).some((kl) => kl.olcutler.some((o) => o.anahtar === anahtar))).map((k) => k.kod).join(" ");

export async function talepGetir(q, id) {
  const t = uuidMi(id) ? await q.bir("select t.*, k.ad as kisi_ad from talepler t join kisiler k on k.id = t.kisi_id where t.id = $1", [id]) : null;
  if (!t) throw new KullaniciHatasi("Talep bulunamadı. Silinmiş ya da size ait olmayabilir.", 404);
  return t;
}

function olcutAlani(o, istek) {
  const ad = "k_" + o.anahtar, d = istek?.d;
  let giris;
  if (o.tip === "coklu") giris = html`<div class="secenekler">${o.secenekler.map((s) => html`<label class="secenek"><input type="checkbox" name="${ad}" value="${s.kod}"${nitelik("checked", (Array.isArray(d) ? d : []).includes(s.kod))}> ${s.ad}</label>`)}</div>`;
  else if (o.tip === "aralik") giris = html`<div class="yan-yana"><input type="text" inputmode="decimal" name="${ad}_min" value="${d?.min ?? ""}" placeholder="en az" aria-label="${o.ad} en az"><input type="text" inputmode="decimal" name="${ad}_max" value="${d?.max ?? ""}" placeholder="en çok" aria-label="${o.ad} en çok"></div>`;
  else if (o.tip === "evet") giris = html`<label class="secenek"><input type="checkbox" name="${ad}" value="1"${nitelik("checked", d === true)}> İsteniyor</label>`;
  else giris = html`<input type="text" inputmode="decimal" name="${ad}" value="${d ?? ""}" aria-label="${o.ad}">`;
  return html`<div class="olcut" data-kat="${olcutKategorileri(o.anahtar)}"><span class="etiket">${o.ad}</span>${giris}<label class="sart"><input type="checkbox" name="s_${o.anahtar}" value="1"${nitelik("checked", !!istek?.sart)}> olmazsa olmaz</label></div>`;
}

function talepFormu(req, konum, t, kisi) {
  const yeni = !t.id, kr = t.kriterler || {};
  return html`<form class="form kart" method="post" action="${yeni ? "/talepler" : `/talepler/${t.id}`}" id="talep-formu">${csrfAlani(req)}
    ${kisi && (kisi.sabit || !yeni) ? html`<input type="hidden" name="kisi_id" value="${kisi.id}"><p><b>${kisi.ad}</b> ne arıyor?</p>` : kisiSecici({ ad: "kisi_id", etiket: "Kim arıyor?", secili: kisi, zorunlu: true })}
    <div class="izgara iki">
      ${alan({ ad: "islem", etiket: "İşlem", tip: "select", deger: t.islem, liste: [{ kod: "satilik", ad: "Satın almak istiyor" }, { kod: "kiralik", ad: "Kiralamak istiyor" }] })}
      ${alan({ ad: "alici_tipi", etiket: "Alıcı tipi", tip: "select", deger: t.alici_tipi, liste: ALICI_TIPLERI.map((a) => ({ kod: a.kod, ad: `${a.ad} — ${a.aciklama}` })), yardim: "alici_tipi" })}
    </div>
    <div class="izgara iki" data-tip="${YATIRIM_TIPLERI}">
      ${alan({ ad: "elde_tutma", etiket: "Elde tutma süresi", tip: "select", deger: t.elde_tutma || "", liste: ELDE })}
      <div data-tip="al_satci_bolgesel al_satci_serbest">${alan({ ad: "en_az_kazanc", etiket: "En az kazanç beklentisi (%)", deger: t.en_az_kazanc ?? "", ek: 'inputmode="decimal"', ipucu: "Tahmini değerine göre bu kazancı vermeyen mülk listelenmez." })}</div>
    </div>
    <div class="alan"><span class="etiket">Ne arıyor?<i>*</i></span>${kutular("kategoriler", TALEP_KATEGORILERI, t.kategoriler || [])}</div>
    ${TALEP_KATEGORILERI.filter((k) => k.turler.length > 1).map((k) => html`<fieldset data-kat="${k.kod}"><legend>${k.ad}: türü</legend>
      <div class="secenekler">${k.turler.map((x) => html`<label class="secenek"><input type="checkbox" name="alt_turler" value="${k.kod}:${x.kod}"${nitelik("checked", (t.alt_turler || []).includes(k.kod + ":" + x.kod))}> ${x.ad}</label>`)}</div>
      <small>Hiçbirini işaretlemezseniz bütün türler aranır.${k.turSartiVarsayilan ? " Bu kategoride seçtiğiniz tür olmazsa olmazdır; yakın türler de gösterilsin isterseniz aşağıdaki kutuyu işaretleyin." : ""}</small></fieldset>`)}
    <label class="secenek" data-kat="${TALEP_KATEGORILERI.filter((k) => k.turSartiVarsayilan).map((k) => k.kod).join(" ")}"><input type="checkbox" name="tur_esnek" value="1"${nitelik("checked", kr._tur_sart === false)}> Arsa ve iş yerinde başka türler de gösterilsin (tür olmazsa olmaz değil)</label>
    ${bolgeSecici(konum, { ad: "bolge", bolgeler: t.bolgeler || [], etiket: "Hangi bölgelerde?" })}
    <label class="secenek"><input type="checkbox" name="sadece_bu_bolgeler" value="1"${nitelik("checked", t.sadece_bu_bolgeler)}> Yalnızca bu bölgeler (komşu mahalle ve ilçe gösterilmesin) ${ampul("sadece_bu_bolgeler")}</label>
    <div class="alan"><span class="etiket">Bütçe (kiralıkta aylık kira) ${ampul("butce")}</span>
      <div class="yan-yana"><input type="text" inputmode="decimal" name="butce_min_tutar" value="${t.butce_min_tutar == null ? "" : sayiYaz(t.butce_min_tutar)}" placeholder="en az" aria-label="En az bütçe"><input type="text" inputmode="decimal" name="butce_max_tutar" value="${t.butce_max_tutar == null ? "" : sayiYaz(t.butce_max_tutar)}" placeholder="en çok" aria-label="En çok bütçe">
      <select name="butce_para" class="para-secimi" aria-label="Para birimi">${PARA.map((p) => html`<option value="${p.kod}"${nitelik("selected", p.kod === (t.butce_para || "TRY"))}>${p.ad}</option>`)}</select></div>
      <small>Boş bırakırsanız kişinin tahmini alım gücü kullanılır.</small></div>
    <fieldset><legend>İstenen özellikler ${ampul("olmazsa_olmaz")}</legend>${BUTUN_OLCUTLER.map((o) => olcutAlani(o, kr[o.anahtar]))}</fieldset>
    <div class="alan"><span class="etiket">Ödeme şekli</span>${kutular("odeme", ODEME, t.odeme || [])}</div>
    ${alan({ ad: "notlar", etiket: "Notlar", tip: "textarea", deger: t.notlar, ek: 'maxlength="5000"' })}
    <button class="dugme genis">${yeni ? "Talebi kaydet ve mülkleri göster" : "Değişiklikleri kaydet"}</button>
  </form>`;
}

async function talepKaydet(req, mevcut) {
  const f = req.form, ben = req.kullanici.id, konum = await konumYukle();
  const kategoriler = dizi(f.kategoriler).filter((k) => TALEP_KATEGORILERI.some((x) => x.kod === k));
  if (!kategoriler.length) throw new KullaniciHatasi("Ne aradığını seçin (konut, arsa, iş yeri…).");
  const kisiId = mevcut ? mevcut.kisi_id : uuidMi(f.kisi_id) ? f.kisi_id : null;
  if (!kisiId) throw new KullaniciHatasi("Talebin kime ait olduğunu seçin.");
  const altTurler = dizi(f.alt_turler).filter((x) => { const [k, a] = x.split(":"); return kategoriler.includes(k) && kategori(k).turler.some((u) => u.kod === a); });
  const kriterler = {};
  for (const o of talepOlcutleri(kategoriler)) {
    const a = "k_" + o.anahtar;
    let d = null;
    if (o.tip === "coklu") { d = dizi(f[a]).filter((x) => o.secenekler.some((s) => s.kod === x)); if (!d.length) d = null; }
    else if (o.tip === "aralik") { const min = sayi(f[a + "_min"]), max = sayi(f[a + "_max"]); if (min != null || max != null) { if (min != null && max != null && min > max) throw new KullaniciHatasi(`${o.ad}: en az değer en çok değerden büyük olamaz.`); d = { min, max }; } }
    else if (o.tip === "evet") d = isaretli(f[a]) ? true : null;
    else d = sayi(f[a]);
    if (d != null) kriterler[o.anahtar] = { d, sart: isaretli(f["s_" + o.anahtar]) };
  }
  if (isaretli(f.tur_esnek) && kategoriler.some((k) => kategori(k).turSartiVarsayilan)) kriterler._tur_sart = false;
  const min = sayi(f.butce_min_tutar), max = sayi(f.butce_max_tutar), para = secim(f.butce_para, ["TRY", "USD"], "TRY");
  if (min != null && max != null && min > max) throw new KullaniciHatasi("En az bütçe en çok bütçeden büyük olamaz.");
  const tip = secim(f.alici_tipi, ALICI_TIPLERI.map((a) => a.kod), "oturum");
  return islem(req.kullanici, async (q) => {
    const kur = await kurAl(q);
    const onceki = (alanAdi) => mevcut && { tutar: mevcut[`butce_${alanAdi}_tutar`], para: mevcut.butce_para, usd: mevcut[`butce_${alanAdi}_usd`], kur: mevcut.butce_kur, tarih: mevcut.butce_tarih };
    const sMax = dolaraSabitle({ tutar: max, para, kur, onceki: onceki("max") }), sMin = dolaraSabitle({ tutar: min, para, kur, onceki: onceki("min") });
    const d = [secim(f.islem, ["satilik", "kiralik"], "satilik"), tip, aliciTipi(tip).puanli ? null : secim(f.elde_tutma, ["kisa", "orta", "uzun"]), kategoriler, altTurler, JSON.stringify(bolgeleriOku(konum, f.bolge)), isaretli(f.sadece_bu_bolgeler),
      min, max, para, sMin.usd, sMax.usd, sMax.kur ?? sMin.kur, sMax.tarih ?? sMin.tarih, JSON.stringify(kriterler), dizi(f.odeme).filter((x) => ODEME.some((o) => o.kod === x)), tip.startsWith("al_satci") ? sayi(f.en_az_kazanc) : null, metin(f.notlar, 5000)];
    let id = mevcut?.id;
    try {
      if (id) await q(`update talepler set islem=$2, alici_tipi=$3, elde_tutma=$4, kategoriler=$5, alt_turler=$6, bolgeler=$7, sadece_bu_bolgeler=$8, butce_min_tutar=$9, butce_max_tutar=$10, butce_para=$11, butce_min_usd=$12, butce_max_usd=$13,
        butce_kur=$14, butce_tarih=$15, kriterler=$16, odeme=$17, en_az_kazanc=$18, notlar=$19, guncelleme_at=now(), son_teyit_at=now() where id=$1`, [id, ...d]);
      else id = (await q.bir(`insert into talepler (sahip_id, kisi_id, islem, alici_tipi, elde_tutma, kategoriler, alt_turler, bolgeler, sadece_bu_bolgeler, butce_min_tutar, butce_max_tutar, butce_para, butce_min_usd, butce_max_usd,
        butce_kur, butce_tarih, kriterler, odeme, en_az_kazanc, notlar) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id`, [ben, kisiId, ...d])).id;
    } catch (e) {
      if (e.code === "42501") throw new KullaniciHatasi("Talebi yalnızca kendi rehberinizdeki bir kişi için açabilirsiniz.");
      throw e;
    }
    await kaydet(q, req, mevcut ? "talep_degisti" : "talep_eklendi", "talep", id);
    return { id, sayi: await talepIcinHesapla(q, id) };
  });
}

export default async function (app) {
  app.get("/talepler", async (req, reply) => {
    const s = req.query, kap = kapsamOku(req), konum = await konumYukle();
    const durum = secim(s.durum, ["aktif", "beklemede", "kapandi", "hepsi"], "aktif"), no = Math.max(1, Number(s.sayfa) || 1);
    const v = await islem(req.kullanici, async (q) => {
      const kosul = ["t.silindi_at is null", "k.silindi_at is null"], p = [];
      if (kap.sahipId) { p.push(kap.sahipId); kosul.push(`t.sahip_id = $${p.length}`); }
      if (durum !== "hepsi") { p.push(durum); kosul.push(`t.durum = $${p.length}`); }
      const liste = await q(`select t.*, k.ad as kisi_ad, k.potansiyel,
          (select count(*) from eslesmeler e where e.talep_id = t.id and e.gecerli and e.durum <> 'reddedildi' and e.talep_sahip_id = e.mulk_sahip_id) as mulk
        from talepler t join kisiler k on k.id = t.kisi_id where ${kosul.join(" and ")} order by t.olusturma_at desc limit ${SAYFA + 1} offset ${(no - 1) * SAYFA}`, p);
      return { liste, danismanlar: await danismanlarAl(q, req) };
    });
    return reply.sayfa(sayfa(req, { baslik: "Talepler", icerik: html`
      <div class="baslik-satiri"><h1>Talepler</h1><a class="dugme kucuk" href="/talepler/yeni">+ Talep</a></div>
      <form class="arama" method="get"><select name="durum" aria-label="Durum">${[["aktif", "Açık talepler"], ["beklemede", "Beklemede"], ["kapandi", "Kapananlar"], ["hepsi", "Hepsi"]].map(([k, a]) => html`<option value="${k}"${nitelik("selected", durum === k)}>${a}</option>`)}</select>
        ${kapsamSecici(v.danismanlar, kap.kimin)}<button class="dugme ikincil">Göster</button></form>
      <div class="kart">${v.liste.length ? html`<ul class="liste">${v.liste.slice(0, SAYFA).map((t) => html`<li>
        <div class="govde"><a class="ad" href="/talepler/${t.id}">${t.kisi_ad}</a><small>${ISLEM_ADI[t.islem]} · ${talepTarifi(t, konum)}</small>
          <div class="etiketler">${t.durum !== "aktif" ? html`<span class="etiket-k">${TALEP_DURUMU[t.durum]}</span>` : ""}${t.alici_tipi !== "oturum" ? html`<span class="etiket-k bilgi">${aliciTipiAdi(t.alici_tipi)}</span>` : ""}${t.sahip_id !== req.kullanici.id ? danismanEtiketi(v.danismanlar.get(t.sahip_id)) : ""}</div></div>
        <div class="yan">${t.mulk ? html`<span class="sayac">${t.mulk} mülk</span>` : ""}</div></li>`)}</ul>` : bos("Bu görünümde talep yok.", html`<a class="dugme" href="/talepler/yeni">Talep ekle</a>`)}</div>
      ${sayfalama(req, no, v.liste.length > SAYFA)}` }));
  });

  app.get("/talepler/yeni", async (req, reply) => {
    const kisi = uuidMi(req.query.kisi) ? await islem(req.kullanici, (q) => q.bir("select id, ad from kisiler where id = $1 and sahip_id = $2 and silindi_at is null", [req.query.kisi, req.kullanici.id])) : null;
    return reply.sayfa(sayfa(req, { baslik: "Yeni talep", geri: kisi ? { yol: "/kisiler/" + kisi.id, ad: kisi.ad } : { yol: "/talepler", ad: "Talepler" },
      icerik: html`<h1>Yeni talep</h1>${talepFormu(req, await konumYukle(), { islem: "satilik", alici_tipi: "oturum", kategoriler: ["konut"], butce_para: "TRY" }, kisi && { ...kisi, sabit: true })}` }));
  });
  app.post("/talepler", async (req, reply) => {
    const { id, sayi: n } = await talepKaydet(req, null);
    return reply.bildir(n ? `Talep kaydedildi. ${n} eşleşme bulundu.` : "Talep kaydedildi.").redirect("/talepler/" + id);
  });
  const kendiTalebi = (t, req) => { if (t.sahip_id !== req.kullanici.id || t.silindi_at) throw new KullaniciHatasi("Bu kaydı yalnızca kaydın sahibi değiştirebilir.", 403); return t; };
  app.get("/talepler/:id/duzenle", async (req, reply) => {
    const t = kendiTalebi(await islem(req.kullanici, (q) => talepGetir(q, req.params.id)), req);
    return reply.sayfa(sayfa(req, { baslik: "Talebi düzenle", geri: { yol: "/talepler/" + t.id, ad: "Talep" }, icerik: html`<h1>Talebi düzenle</h1>${talepFormu(req, await konumYukle(), t, { id: t.kisi_id, ad: t.kisi_ad })}` }));
  });
  app.post("/talepler/:id", async (req, reply) => {
    const t = kendiTalebi(await islem(req.kullanici, (q) => talepGetir(q, req.params.id)), req);
    await talepKaydet(req, t);
    return reply.bildir("Değişiklikler kaydedildi.").redirect("/talepler/" + t.id);
  });
  // "Hâlâ arıyor mu?" sorusunun yanıtı
  app.post("/talepler/:id/teyit", async (req, reply) => {
    const evet = req.form.yanit !== "hayir";
    await islem(req.kullanici, async (q) => {
      const t = kendiTalebi(await talepGetir(q, req.params.id), req);
      if (evet) await q("update talepler set son_teyit_at = now() where id = $1", [t.id]);
      else { await q("update talepler set durum = 'kapandi', guncelleme_at = now() where id = $1", [t.id]); await talepIcinHesapla(q, t.id); }
      await kaydet(q, req, "talep_teyit", "talep", t.id, { yanit: evet ? "evet" : "hayir" });
    });
    return reply.bildir(evet ? "Talep güncel olarak işaretlendi." : "Talep kapatıldı.").redirect(req.headers.referer ? new URL(req.headers.referer).pathname : "/");
  });
  app.post("/talepler/:id/durum", async (req, reply) => {
    const durum = secim(req.form.durum, Object.keys(TALEP_DURUMU));
    if (!durum) throw new KullaniciHatasi("Durum seçin.");
    await islem(req.kullanici, async (q) => {
      const t = kendiTalebi(await talepGetir(q, req.params.id), req);
      await q("update talepler set durum = $2, guncelleme_at = now(), son_teyit_at = now() where id = $1", [t.id, durum]);
      await talepIcinHesapla(q, t.id);
    });
    return reply.bildir("Durum güncellendi.").redirect("/talepler/" + req.params.id);
  });
  app.post("/talepler/:id/sil", async (req, reply) => {
    if (!uuidMi(req.params.id)) throw new KullaniciHatasi("Talep bulunamadı.", 404);
    const t = await islem(req.kullanici, async (q) => { const x = await talepGetir(q, req.params.id); await talepSil(q, req, x.id); return x; });
    return reply.bildir("Talep silindi.").redirect("/kisiler/" + t.kisi_id);
  });
  app.post("/talepler/:id/reddet", async (req, reply) => {
    await islem(req.kullanici, async (q) => {
      const t = kendiTalebi(await talepGetir(q, req.params.id), req);
      if (!uuidMi(req.form.mulk)) throw new KullaniciHatasi("Eşleşme bulunamadı.", 404);
      await q.sistem(() => q("update eslesmeler set durum = 'reddedildi' where talep_id = $1 and mulk_id = $2 and talep_sahip_id = $3 and mulk_sahip_id = $3", [t.id, req.form.mulk, req.kullanici.id]));
    });
    return reply.bildir("Eşleşme listeden kaldırıldı.").redirect("/talepler/" + req.params.id);
  });

  app.get("/talepler/:id", async (req, reply) => {
    const konum = await konumYukle(), ben = req.kullanici.id, ayarlar = await ayarlarAl();
    const v = await islem(req.kullanici, async (q) => {
      const t = await talepGetir(q, req.params.id);
      const benim = t.sahip_id === ben && !t.silindi_at;
      const mulkler = await talebinMulkleri(q, t, "kendi");
      if (benim) await q.sistem(() => q("update eslesmeler set durum = 'goruldu' where talep_id = $1 and durum = 'yeni' and talep_sahip_id = $2 and mulk_sahip_id = $2", [t.id, ben]));
      return { t, benim, mulkler, ekip: yoneticiMi(req.kullanici) ? await talebinMulkleri(q, t, "ekip") : [], danismanlar: await danismanlarAl(q, req),
        kisi: await q.bir("select id, ad, alim_gucu_tutar, alim_gucu_para from kisiler where id = $1", [t.kisi_id]) };
    });
    const { t, benim } = v;
    const olcutler = Object.entries(t.kriterler || {}).filter(([a]) => !a.startsWith("_")).map(([a, i]) => olcutMetni(a, i)).filter(Boolean);
    const turler = (t.alt_turler || []).map((x) => { const [k, a] = x.split(":"); return altTurAdi(k, a); });
    const eski = new Date(t.son_teyit_at) < new Date(Date.now() - ayarlar.talep_teyit_ay * 30 * 864e5);
    return reply.sayfa(sayfa(req, { baslik: "Talep · " + t.kisi_ad, geri: { yol: "/kisiler/" + t.kisi_id, ad: t.kisi_ad }, icerik: html`
      <div class="kart">
        <div class="baslik-satiri"><h1><a href="/kisiler/${t.kisi_id}">${t.kisi_ad}</a> ne arıyor?</h1>${benim ? html`<a class="dugme ikincil kucuk" href="/talepler/${t.id}/duzenle">Düzenle</a>` : ""}</div>
        <div class="etiketler"><span class="etiket-k${t.durum === "aktif" ? " iyi" : ""}">${TALEP_DURUMU[t.durum]}</span><span class="etiket-k bilgi">${aliciTipiAdi(t.alici_tipi)}</span>${t.silindi_at ? html`<span class="etiket-k uyari">silindi</span>` : ""}${!benim && t.sahip_id !== ben ? danismanEtiketi(v.danismanlar.get(t.sahip_id)) : ""}</div>
        <dl class="tanim">
          <dt>İşlem</dt><dd>${t.islem === "kiralik" ? "Kiralamak istiyor" : "Satın almak istiyor"}</dd>
          <dt>Aradığı</dt><dd>${t.kategoriler.map(kategoriAdi).join(", ")}${turler.length ? " · " + turler.join(", ") : ""}</dd>
          <dt>Bölge</dt><dd>${(t.bolgeler || []).length ? t.bolgeler.map((b) => konum.yerAdi(b.ilce, b.mahalle)).join(", ") : "belirtilmedi"}${t.sadece_bu_bolgeler ? " (yalnızca bu bölgeler)" : ""}</dd>
          <dt>Bütçe</dt><dd>${butceYaz(t) || (v.kisi?.alim_gucu_tutar != null ? `belirtilmedi · alım gücü ${paraYaz(v.kisi.alim_gucu_tutar, v.kisi.alim_gucu_para)}` : "belirtilmedi")}${t.butce_para === "TRY" && t.butce_max_usd ? html` <small>(${paraYaz(t.butce_max_usd, "USD")} · ${tarihYaz(t.butce_tarih)} kuruyla sabitlendi)</small>` : ""}</dd>
          ${olcutler.map((o) => html`<dt>${o.ad}</dt><dd>${o.deger}${o.sart ? html` <span class="etiket-k uyari">olmazsa olmaz</span>` : ""}</dd>`)}
          ${t.en_az_kazanc != null ? html`<dt>En az kazanç</dt><dd>%${sayiYaz(t.en_az_kazanc, 1)}</dd>` : ""}
          ${(t.odeme || []).length ? html`<dt>Ödeme</dt><dd>${t.odeme.map((x) => ODEME.find((o) => o.kod === x)?.ad || x).join(", ")}</dd>` : ""}
          ${t.notlar ? html`<dt>Notlar</dt><dd>${satirli(t.notlar)}</dd>` : ""}
          <dt>Son teyit</dt><dd>${neKadarOnce(t.son_teyit_at)}</dd>
        </dl>
        ${benim && eski && t.durum === "aktif" ? html`<div class="uyari-kutu">Bu talebe uzun süredir dokunulmadı. Kişi hâlâ arıyor mu, bütçesi aynı mı?
          <form method="post" action="/talepler/${t.id}/teyit" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk" name="yanit" value="evet">Evet, güncel</button> <button class="dugme kucuk sade" name="yanit" value="hayir">Hayır, kapat</button></form></div>` : ""}
        ${benim ? html`<form method="post" action="/talepler/${t.id}/durum" class="satir-form">${csrfAlani(req)}<select name="durum" aria-label="Durum">${Object.entries(TALEP_DURUMU).map(([k, a]) => html`<option value="${k}"${nitelik("selected", t.durum === k)}>${a}</option>`)}</select> <button class="dugme ikincil kucuk">Durumu değiştir</button></form>` : ""}
      </div>
      <div class="kart"><h2>Uygun mülkler (${v.mulkler.length}) ${ampul("puan")}</h2>
        ${v.mulkler.length ? html`<ul class="liste">${v.mulkler.map((e) => eslesmeSatiri(e, { yon: "mulk", konum,
          ekDugme: benim ? html`<a class="dugme kucuk" href="/mesaj?kisi=${t.kisi_id}&mulk=${e.mulk_id}&talep=${t.id}">Mesaj</a><form method="post" action="/talepler/${t.id}/reddet" class="satir-form">${csrfAlani(req)}<button class="baglanti-dugme" name="mulk" value="${e.mulk_id}" data-onay="Bu mülk listeden kaldırılsın mı?">ilgilenmiyor</button></form>` : "" }))}</ul>`
          : html`<p class="soluk">${t.durum === "aktif" ? "Elinizde bu talebe uyan mülk yok. Uygun bir mülk girildiğinde burada ve ana ekranda görünür." : "Talep açık olmadığı için eşleşme aranmıyor."}</p>`}
      </div>
      ${v.ekip.length ? html`<div class="kart"><h2>Ekip eşleşmeleri (${v.ekip.length}) ${ampul("ekip_eslesmeleri")}</h2><p class="soluk">Başka danışmanların mülkleri. Bu bölümü yalnızca yöneticiler görür.</p>
        <ul class="liste">${v.ekip.map((e) => eslesmeSatiri(e, { yon: "mulk", konum, danisman: v.danismanlar.get(e.mulk_sahip_id) }))}</ul><p><a href="/yonetim/ekip-eslesmeleri">Ekip eşleşmeleri ekranına git ›</a></p></div>` : ""}
      ${(t.sahip_id === ben || req.kullanici.rol === "sahip") && !t.silindi_at ? html`<form method="post" action="/talepler/${t.id}/sil">${csrfAlani(req)}<button class="dugme tehlike kucuk" data-onay="Talep silinsin mi?">Talebi sil</button></form>` : ""}` }));
  });
}
