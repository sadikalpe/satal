// Ana ekran ("bugün kimi aramalıyım"), "kim alır?", profil, yardım ve konum listeleri.
import fs from "node:fs";
import { islem } from "../db.js";
import { html, jsonGom, nitelik } from "../lib/html.js";
import { sayfa, ampul, alan, paraAlani, csrfAlani, bos, rozet } from "../gorunum/duzen.js";
import { konumSecici, konumOku, VARSAYILAN_IL } from "../gorunum/konum.js";
import { eslesmeSatiri, mulkTarifi, talepTarifi, fiyatYaz, kisiEtiketleri, ISLEM_ADI } from "../gorunum/parcalar.js";
import { KATEGORILER, kategori } from "../alan/kategoriler.js";
import { sirala } from "../alan/eslestirme.js";
import { konumYukle, ayarlarAl, kurAl, KullaniciHatasi, kaydet, yoneticiMi } from "../servis/ortak.js";
import { taslakMulkIcinBul } from "../servis/eslesme.js";
import { talepsizAdaylar } from "../servis/liste.js";
import { kontrolSayilari } from "../servis/kontrol.js";
import { dosyaTuru, dosyaKaydet, dosyaYolu, dosyaSil } from "../servis/dosya.js";
import { metin, sayi, secim } from "../lib/form.js";
import { tarihYaz, sayiYaz, neKadarOnce, telefonNorm, telefonYaz, tarihSaatYaz } from "../lib/metin.js";

export default async function (app) {
  app.get("/", async (req, reply) => {
    const ben = req.kullanici.id;
    const [konum, ayarlar] = [await konumYukle(), await ayarlarAl()];
    const v = await islem(req.kullanici, async (q) => ({
      kur: await kurAl(q),
      yeni: await q(
        `select e.puan, e.sinif, e.ayrinti, e.fiyat_dustu, e.ilk_at, t.id as talep_id, k.id as kisi_id, k.ad as kisi_ad, k.potansiyel,
                m.id as mulk_id, m.kategori, m.alt_tur, m.ilce_id, m.mahalle_id, m.fiyat_tutar, m.fiyat_para, m.islem, m.ozellikler
           from eslesmeler e join talepler t on t.id = e.talep_id join kisiler k on k.id = t.kisi_id join mulkler m on m.id = e.mulk_id
          where e.gecerli and e.durum = 'yeni' and e.talep_sahip_id = $1 and e.mulk_sahip_id = $1 and e.ilk_at > now() - interval '14 days'
          order by e.puan desc nulls last, e.ilk_at desc limit 15`, [ben]),
      sozler: await q(
        `select h.id, h.tarih, h.notu, k.id as kisi_id, k.ad as kisi_ad, k.potansiyel from hatirlatmalar h join kisiler k on k.id = h.kisi_id
          where h.sahip_id = $1 and h.tamamlandi_at is null and h.tarih <= current_date + 1 order by h.tarih limit 30`, [ben]),
      aranmayan: await q(
        `select k.id, k.ad, k.potansiyel, coalesce(k.son_temas_at, k.olusturma_at) as son from kisiler k
          where k.sahip_id = $1 and k.silindi_at is null and k.potansiyel = 'A' and coalesce(k.son_temas_at, k.olusturma_at) < now() - make_interval(days => $2)
          order by son limit 10`, [ben, ayarlar.aranmayan_gun]),
      teyit: await q(
        `select t.*, k.ad as kisi_ad from talepler t join kisiler k on k.id = t.kisi_id
          where t.sahip_id = $1 and t.silindi_at is null and t.durum = 'aktif' and t.son_teyit_at < now() - make_interval(months => $2)
          order by t.son_teyit_at limit 10`, [ben, ayarlar.talep_teyit_ay]),
      sayilar: await q.bir(
        `select (select count(*) from kisiler where sahip_id = $1 and silindi_at is null) as kisi,
                (select count(*) from mulkler where sahip_id = $1 and silindi_at is null and durum in ('aktif', 'opsiyonlu')) as mulk,
                (select count(*) from talepler where sahip_id = $1 and silindi_at is null and durum = 'aktif') as talep`, [ben]),
      bekleyen: yoneticiMi(req.kullanici) ? (await q.bir("select count(*) as n from kullanicilar where durum = 'onay_bekliyor'")).n : 0,
      kontrol: await kontrolSayilari(q, ben),
    }));
    const bosMu = !v.yeni.length && !v.sozler.length && !v.aranmayan.length && !v.teyit.length;
    return reply.sayfa(sayfa(req, { baslik: "Bugün", icerik: html`
      <a class="dugme buyuk genis" href="/kim-alir">Elimde bir mülk var, kim alır?</a>
      ${v.bekleyen ? html`<p class="bilgi-kutu"><a href="/yonetim/ekip">${v.bekleyen} üyelik onayınızı bekliyor</a></p>` : ""}
      ${v.kontrol.kim + v.kontrol.teyit ? html`<p class="bilgi-kutu"><a href="/kontrol">Kontrol listenizde ${v.kontrol.kim + v.kontrol.teyit} açık soru var</a>
        <small>(${[v.kontrol.kim ? `${v.kontrol.kim} kayıtta getiren ya da tanıştıran rehberden seçilmedi` : "", v.kontrol.teyit ? `${v.kontrol.teyit} kayıt teyit bekliyor` : ""].filter(Boolean).join(", ")})</small></p>` : ""}
      <div class="baslik-satiri ust-bosluk"><h1>Bugün kimi aramalıyım? ${ampul("bugun")}</h1></div>
      ${bosMu ? html`<div class="kart">${bos(v.sayilar.kisi ? "Bugün için bekleyen bir şey yok." : "Henüz rehberiniz boş. Başlamak için rehberinizi yükleyin.", v.sayilar.kisi ? "" : html`<a class="dugme" href="/kisiler/yukle">Rehberimi yükle</a>`)}</div>` : ""}
      ${v.sozler.length ? html`<div class="kart"><h2>Geri arama sözü verdikleriniz</h2><ul class="liste">${v.sozler.map((s) => html`<li>
          <div class="govde"><a class="ad" href="/kisiler/${s.kisi_id}">${s.kisi_ad}</a><small>${tarihYaz(s.tarih)}${s.notu ? " · " + s.notu : ""}</small></div>
          <div class="yan"><form method="post" action="/hatirlatmalar/${s.id}/tamam" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk sade">Arandı ✓</button></form></div></li>`)}</ul></div>` : ""}
      ${v.yeni.length ? html`<div class="kart"><h2>Yeni eşleşmeler</h2><ul class="liste">${v.yeni.map((e) => eslesmeSatiri({ ...e, mulk_tarifi: `${e.kisi_ad} için: ${mulkTarifi(e, konum)}`, fiyat_yazi: fiyatYaz(e), durum: "" }, { yon: "mulk", konum,
          ekDugme: html`<a class="dugme kucuk" href="/mesaj?kisi=${e.kisi_id}&mulk=${e.mulk_id}&talep=${e.talep_id}">Mesaj</a>` }))}</ul></div>` : ""}
      ${v.aranmayan.length ? html`<div class="kart"><h2>Uzun süredir aramadığınız A potansiyelliler</h2><ul class="liste">${v.aranmayan.map((k) => html`<li>
          <div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a><small>Son temas: ${neKadarOnce(k.son)}</small></div><div class="yan">${rozet("A")}</div></li>`)}</ul></div>` : ""}
      ${v.teyit.length ? html`<div class="kart"><h2>Bu kişiler hâlâ arıyor mu?</h2><p class="soluk">Bu taleplere ${ayarlar.talep_teyit_ay} aydır dokunulmadı. Bütçe de hâlâ aynı mı, kişiye sorun.</p><ul class="liste">${v.teyit.map((t) => html`<li>
          <div class="govde"><a class="ad" href="/talepler/${t.id}">${t.kisi_ad}</a><small>${talepTarifi(t, konum)}</small></div>
          <div class="yan"><form method="post" action="/talepler/${t.id}/teyit" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk" name="yanit" value="evet">Evet</button> <button class="dugme kucuk sade" name="yanit" value="hayir" data-onay="Talep kapatılsın mı?">Hayır</button></form></div></li>`)}</ul></div>` : ""}
      <div class="izgara iki">
        <div class="kart"><h3>Dolar kuru</h3>${v.kur ? html`<div class="kur-satiri"><b>1 $ = ${sayiYaz(v.kur.usd_try, 4)} TL</b><small>${v.kur.kaynak} · ${tarihYaz(v.kur.tarih)}</small></div>` : html`<p class="soluk">Kur henüz alınmadı.</p>`}</div>
        <div class="kart"><h3>Rehberim</h3><p><a href="/kisiler">${v.sayilar.kisi} kişi</a> · <a href="/mulkler">${v.sayilar.mulk} mülk</a> · <a href="/talepler">${v.sayilar.talep} açık talep</a> · <a href="/kontrol">Kontrol listesi</a></p></div>
      </div>` }));
  });

  // ---------- Elimde bir mülk var, kim alır? ----------
  app.get("/kim-alir", { config: { modul: "crm" } }, async (req, reply) => {
    const konum = await konumYukle();
    const s = req.query;
    const kat = kategori(s.kategori) ? s.kategori : "konut";
    const tur = kategori(kat).turler.some((t) => t.kod === s.alt_tur) ? s.alt_tur : kategori(kat).turler[0].kod;
    const yer = konumOku(konum, s);
    const fiyat = sayi(s.fiyat_tutar), para = secim(s.fiyat_para, ["TRY", "USD"], "TRY"), islemTuru = secim(s.islem, ["satilik", "kiralik"], "satilik");
    let sonuc = null;
    if (s.ara && yer.ilce_id) {
      const mulk = { islem: islemTuru, kategori: kat, alt_tur: tur, ...yer, fiyat_tutar: fiyat, fiyat_para: para, ozellikler: {}, durum: "aktif" };
      sonuc = await islem(req.kullanici, async (q) => {
        const { liste } = await taslakMulkIcinBul(q, mulk, req.kullanici.id);
        const adlar = liste.length ? await q("select id, ad, potansiyel, mesaj_istemiyor from kisiler where id = any($1::uuid[])", [liste.map((x) => x.talep.kisi_id)]) : [];
        const adM = new Map(adlar.map((k) => [k.id, k]));
        const satirlar = sirala(liste.map((x) => ({ ...x, ayrinti: x, kisi_id: x.talep.kisi_id, kisi_ad: adM.get(x.talep.kisi_id)?.ad, mesaj_istemiyor: adM.get(x.talep.kisi_id)?.mesaj_istemiyor,
          isaretler: adM.get(x.talep.kisi_id)?.potansiyel === "A" ? ["A potansiyel"] : [], talep_tarifi: talepTarifi(x.talep, konum), butce_tarih: x.talep.butce_tarih })));
        const adaylar = await talepsizAdaylar(q, mulk, req.kullanici.id, satirlar.map((x) => x.kisi_id));
        return { satirlar, adaylar, mulk };
      });
    }
    const kaydetAdresi = "/mulkler/yeni?" + new URLSearchParams({ islem: islemTuru, kategori: kat, alt_tur: tur, ilce_id: yer.ilce_id || "", mahalle_id: yer.mahalle_id || "", fiyat_tutar: fiyat ?? "", fiyat_para: para });
    return reply.sayfa(sayfa(req, { baslik: "Kim alır?", geri: { yol: "/", ad: "Bugün" }, icerik: html`
      <h1>Elimde bir mülk var, kim alır? ${ampul("kim_alir")}</h1>
      <form class="form kart" method="get" id="mulk-formu">
        <input type="hidden" name="ara" value="1">
        <div class="izgara uc">
          ${alan({ ad: "islem", etiket: "İşlem", tip: "select", deger: islemTuru, liste: [{ kod: "satilik", ad: "Satılık" }, { kod: "kiralik", ad: "Kiralık" }] })}
          ${alan({ ad: "kategori", etiket: "Kategori", tip: "select", deger: kat, liste: KATEGORILER })}
          ${alan({ ad: "alt_tur", etiket: "Tür", tip: "select", deger: tur, liste: kategori(kat).turler })}
        </div>
        ${konumSecici(konum, { il: Number(s.il_id) || VARSAYILAN_IL, ilce: yer.ilce_id, mahalle: yer.mahalle_id, zorunlu: true })}
        ${paraAlani({ ad: "fiyat", etiket: "Fiyat (kiralıkta aylık kira)", tutar: s.fiyat_tutar, para })}
        <div id="ozellik-alanlari" hidden></div>
        <script type="application/json" id="kategori-agaci">${jsonGom(KATEGORILER.map((k) => ({ kod: k.kod, turler: k.turler.map((t) => ({ kod: t.kod, ad: t.ad })) })))}</script>
        <button class="dugme genis">Alıcıları göster</button>
      </form>
      ${sonuc ? html`
        <div class="kart"><div class="baslik-satiri"><h2>Uygun alıcılar (${sonuc.satirlar.length})</h2><a class="dugme kucuk ikincil" href="${kaydetAdresi}">Bu mülkü kaydet</a></div>
          ${sonuc.satirlar.length ? html`<ul class="liste">${sonuc.satirlar.map((e) => eslesmeSatiri(e, { yon: "alici", konum }))}</ul>` : bos("Rehberinizde bu mülke uyan açık talep yok.")}
          <p class="soluk">Mesaj göndermek ve sırayla gönderim için mülkü kaydedin.</p></div>
        ${sonuc.adaylar.length ? html`<div class="kart"><h2>Talebi yok ama alabilir (${sonuc.adaylar.length})</h2><ul class="liste">${sonuc.adaylar.map((k) => html`<li>
          <div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a><div class="neden">${k.nedenler.join(" · ")}</div><div class="etiketler">${kisiEtiketleri(k)}${k.para_bilinmiyor ? html`<span class="etiket-k uyari">parası bilinmiyor</span>` : ""}</div></div></li>`)}</ul></div>` : ""}`
        : s.ara ? html`<p class="uyari-kutu">Alıcıları görmek için ilçeyi seçin.</p>` : ""}` }));
  });

  // ---------- Yardım ve konum (tarayıcıdaki küçük yardımcılar için) ----------
  app.get("/yardim/:anahtar", async (req) => {
    const y = await islem(req.kullanici, (q) => q.bir("select baslik, metin from yardim_metinleri where anahtar = $1", [req.params.anahtar]));
    if (!y) throw new KullaniciHatasi("Yardım metni yok.", 404);
    return y;
  });
  app.get("/konum/ilceler", async (req) => ((await konumYukle()).ilcelerIl.get(Number(req.query.il)) || []).map((d) => ({ id: d.id, ad: d.ad })));
  app.get("/konum/mahalleler", async (req) => ((await konumYukle()).mahallelerIlce.get(Number(req.query.ilce)) || []).map((m) => ({ id: m.id, ad: m.ad })));

  // ---------- Profil ----------
  app.get("/profil", async (req, reply) => {
    const k = req.kullanici;
    const oturumlar = await islem(k, (q) => q.sistem(() => q("select id, cihaz, olusturma_at, son_gorulme_at from oturumlar where kullanici_id = $1 and bitis_at > now() order by son_gorulme_at desc", [k.id])));
    const TON = [{ kod: "samimi", ad: "Samimi" }, { kod: "resmi", ad: "Resmi" }, { kod: "kisa", ad: "Kısa" }];
    return reply.sayfa(sayfa(req, { baslik: "Profil", dar: true, icerik: html`
      <h1>Profil</h1>
      <form class="form kart" method="post" action="/profil" enctype="multipart/form-data">${csrfAlani(req)}
        <div>${k.foto_yol ? html`<img class="buyuk" src="/foto/${k.id}" alt="">` : html`<span class="avatar buyuk">${(k.ad || "?").slice(0, 1)}</span>`}</div>
        <label class="alan"><span class="etiket">Fotoğraf</span><input type="file" name="foto" accept="image/jpeg,image/png,image/webp" data-kucult="480"></label>
        ${alan({ ad: "ad", etiket: "Ad soyad", deger: k.ad, zorunlu: true, ek: 'maxlength="100"' })}
        ${alan({ ad: "telefon", etiket: "Telefon", tip: "tel", deger: telefonYaz(k.telefon) })}
        ${alan({ ad: "eposta_goster", etiket: "E-posta", deger: k.eposta, ek: "disabled" })}
        ${alan({ ad: "mesaj_tonu", etiket: "WhatsApp mesaj tonu", tip: "select", deger: k.mesaj_tonu, liste: TON })}
        ${alan({ ad: "imza", etiket: "Mesaj imzası", tip: "textarea", deger: k.imza, ipucu: "Boş bırakırsanız adınız ve “STA Gayrimenkul” yazılır.", ek: 'maxlength="200"' })}
        <button class="dugme">Kaydet</button>
      </form>
      <div class="kart"><h3>Açık oturumlar</h3><p class="soluk">Giriş yaptığınız cihazda oturum 1 ay açık kalır.</p>
        <ul class="liste">${oturumlar.map((o) => html`<li><div class="govde"><span class="ad">${cihazAdi(o.cihaz)}${o.id === k.oturum_id ? " (bu cihaz)" : ""}</span><small>Giriş: ${tarihSaatYaz(o.olusturma_at)} · son: ${neKadarOnce(o.son_gorulme_at)}</small></div></li>`)}</ul>
        <form method="post" action="/profil/oturumlari-kapat">${csrfAlani(req)}<button class="dugme sade kucuk" data-onay="Diğer cihazlardaki oturumlar kapatılsın mı?">Diğer cihazlardan çıkış yap</button></form></div>
      <div class="kart"><p><a href="/gizlilik">Gizlilik beyanı</a></p>
        <form method="post" action="/cikis">${csrfAlani(req)}<button class="dugme tehlike">Çıkış yap</button></form></div>` }));
  });
  app.post("/profil", async (req, reply) => {
    const f = req.form, k = req.kullanici;
    const ad = metin(f.ad, 100);
    if (ad.length < 3) throw new KullaniciHatasi("Ad soyad yazın.");
    let foto = k.foto_yol;
    const dosya = Array.isArray(f.foto) ? f.foto[0] : f.foto;
    if (dosya?.veri?.length) {
      if (dosya.veri.length > 2 * 1024 * 1024) throw new KullaniciHatasi("Fotoğraf çok büyük (en çok 2 MB).");
      const tur = dosyaTuru(dosya.veri, true);
      if (!tur) throw new KullaniciHatasi("Fotoğraf JPG, PNG ya da WEBP olmalı.");
      foto = await dosyaKaydet("fotolar", dosya.veri, tur.uzanti);
    }
    await islem(k, (q) => q.sistem(() => q("update kullanicilar set ad = $2, telefon = $3, mesaj_tonu = $4, imza = $5, foto_yol = $6 where id = $1",
      [k.id, ad, telefonNorm(f.telefon), secim(f.mesaj_tonu, ["samimi", "resmi", "kisa"], "samimi"), metin(f.imza, 200), foto])));
    if (foto !== k.foto_yol && k.foto_yol) await dosyaSil(k.foto_yol).catch(() => {});
    return reply.bildir("Profiliniz kaydedildi.").redirect("/profil");
  });
  app.post("/profil/oturumlari-kapat", async (req, reply) => {
    await islem(req.kullanici, (q) => q.sistem(async () => {
      await q("delete from oturumlar where kullanici_id = $1 and id <> $2", [req.kullanici.id, req.kullanici.oturum_id]);
      await kaydet(q, req, "oturumlar_kapatildi", "kullanici", req.kullanici.id, { kim: "kendisi" });
    }));
    return reply.bildir("Diğer cihazlardaki oturumlar kapatıldı.").redirect("/profil");
  });
  // Danışman fotoğrafı: kişi kendisininkini, yöneticiler herkesinkini görür.
  app.get("/foto/:id", async (req, reply) => {
    if (req.params.id !== req.kullanici.id && !yoneticiMi(req.kullanici)) throw new KullaniciHatasi("Bulunamadı.", 404);
    const k = await islem(req.kullanici, (q) => q.bir("select foto_yol from kullanicilar where id = $1", [req.params.id]));
    if (!k?.foto_yol) throw new KullaniciHatasi("Bulunamadı.", 404);
    const yol = dosyaYolu(k.foto_yol);
    if (!fs.existsSync(yol)) throw new KullaniciHatasi("Bulunamadı.", 404);
    const uz = yol.split(".").pop();
    return reply.header("cache-control", "private, max-age=3600").type({ jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[uz] || "application/octet-stream").send(fs.createReadStream(yol));
  });
}
function cihazAdi(ua) {
  const s = String(ua || "");
  const cihaz = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android telefon" : /Windows/.test(s) ? "Windows bilgisayar" : /Mac OS/.test(s) ? "Mac" : "Cihaz";
  const tarayici = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : /Firefox\//.test(s) ? "Firefox" : "";
  return [cihaz, tarayici].filter(Boolean).join(" · ");
}
