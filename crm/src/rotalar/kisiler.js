// Kişiler: rehber listesi, kişi kartı, görüşme ve hatırlatmalar, rehber yükleme, belgeler.
import fs from "node:fs";
import crypto from "node:crypto";
import { islem } from "../db.js";
import { html, nitelik, satirli } from "../lib/html.js";
import { sayfa, ampul, alan, paraAlani, csrfAlani, bos, danismanEtiketi } from "../gorunum/duzen.js";
import { konumSecici, konumOku, bolgeSecici, bolgeleriOku } from "../gorunum/konum.js";
import { kisiEtiketleri, mulkTarifi, talepTarifi, fiyatYaz, telefonBaglantisi, kapsamSecici, sayfalama, kutular, belgeBolumu, kisiSecici, kaynakYaz, gorusmeTarihi, GORUSME_TURU, SONUC_ADI, MULK_DURUMU, TALEP_DURUMU, ISLEM_ADI, KISI_TIPI, KISI_TIPI_SECENEKLERI } from "../gorunum/parcalar.js";
import { KATEGORILER, kategori, kategoriAdi, altTurAdi } from "../alan/kategoriler.js";
import { usd } from "../alan/eslestirme.js";
import { konumYukle, kurAl, dolaraSabitle, kaydet, KullaniciHatasi, kapsamOku, danismanlarAl, adNormSql } from "../servis/ortak.js";
import { kisiIcinHesapla } from "../servis/eslesme.js";
import { kisiSil } from "../servis/silme.js";
import { adaylariAl } from "../servis/kontrol.js";
import { kimKutusu, teyitKutusu, gorusmeTeyidi } from "../gorunum/kontrol.js";
import { BAG_DURUMU } from "../alan/kontrol.js";
import { dosyaTuru, dosyaKaydet, dosyaYolu, dosyaSil } from "../servis/dosya.js";
import { dosyaOku, yuklemeHazirla } from "../lib/rehber-oku.js";
import { metin, dizi, sayi, secim, uuidMi, tarih, isaretli } from "../lib/form.js";
import { norm, telefonNorm, telefonYaz, tarihYaz, neKadarOnce, paraYaz, bugun, ilkAd } from "../lib/metin.js";
import { hitapYaz } from "../alan/mesaj.js";

const HITAP = [{ kod: "bey_hanim_yok", ad: "Yalnızca adıyla (Ahmet)" }, { kod: "bey", ad: "Bey (Ahmet Bey)" }, { kod: "hanim", ad: "Hanım (Ayşe Hanım)" }, { kod: "abi", ad: "Abi (Ahmet Abi)" }, { kod: "abla", ad: "Abla (Ayşe Abla)" }, { kod: "ozel", ad: "Kendim yazacağım" }];
const POTANSIYEL = [{ kod: "", ad: "Belirtilmedi" }, { kod: "A", ad: "A — alır ya da satar" }, { kod: "B", ad: "B — belki" }, { kod: "C", ad: "C — zor" }];
const SAYFA = 50;
const idGerekli = (id) => { if (!uuidMi(id)) throw new KullaniciHatasi("Kayıt bulunamadı.", 404); return id; };

export async function kisiGetir(q, id) {
  const k = uuidMi(id) ? await q.bir("select * from kisiler where id = $1", [id]) : null;
  if (!k) throw new KullaniciHatasi("Kişi bulunamadı. Silinmiş ya da size ait olmayabilir.", 404);
  return k;
}
const telefonlarOku = (f) => [...new Set([f.telefon1, f.telefon2, f.telefon3].map((x) => String(x || "").trim()).filter(Boolean).map((x) => {
  const n = telefonNorm(x);
  if (!n) throw new KullaniciHatasi(`“${x}” geçerli bir telefon numarası değil.`);
  return n;
}))];

// Numara bu danışmanın rehberinde başka birine kayıtlı mı?
export async function numaraCakismasi(q, sahipId, numaralar, haricKisi = null) {
  if (!numaralar.length) return;
  const c = await q.bir(`select k.ad, t.numara from kisi_telefonlari t join kisiler k on k.id = t.kisi_id where t.sahip_id = $1 and t.aktif and t.numara = any($2) and ($3::uuid is null or t.kisi_id <> $3) limit 1`, [sahipId, numaralar, haricKisi]);
  if (c) throw new KullaniciHatasi(`${telefonYaz(c.numara)} numarası rehberinizde “${c.ad}” adına zaten kayıtlı.`);
}

function kisiFormu(req, konum, k, telefonlar, referans = null) {
  const yeni = !k.id;
  return html`<form class="form kart" method="post" action="${yeni ? "/kisiler" : `/kisiler/${k.id}`}" id="kisi-formu">${csrfAlani(req)}
    ${alan({ ad: "ad", etiket: "Ad soyad", deger: k.ad, zorunlu: true, ek: 'maxlength="200" autocomplete="off"' })}
    <div class="izgara uc">
      ${alan({ ad: "telefon1", etiket: "Telefon", tip: "tel", deger: telefonYaz(telefonlar[0] || ""), zorunlu: true, yer: "05xx xxx xx xx" })}
      ${alan({ ad: "telefon2", etiket: "İkinci telefon", tip: "tel", deger: telefonYaz(telefonlar[1] || "") })}
      ${alan({ ad: "telefon3", etiket: "Üçüncü telefon", tip: "tel", deger: telefonYaz(telefonlar[2] || "") })}
    </div>
    <fieldset><legend>Mesajlarda nasıl seslenilsin? ${ampul("hitap")}</legend>
      <div class="izgara uc">
        ${alan({ ad: "hitap_adi", etiket: "Seslenilecek ad", deger: k.hitap_adi, yer: ilkAd(k.ad) || "örn. Ahmet", ipucu: "Boşsa ilk adı kullanılır." })}
        ${alan({ ad: "hitap_turu", etiket: "Hitap", tip: "select", deger: k.hitap_turu, liste: HITAP })}
        ${alan({ ad: "sen_siz", etiket: "Sen / siz", tip: "select", deger: k.sen_siz || "siz", liste: [{ kod: "siz", ad: "Siz" }, { kod: "sen", ad: "Sen" }], yardim: "sen_siz" })}
      </div>
      <div id="hitap-ozel-alani">${alan({ ad: "hitap_ozel", etiket: "Hitap (tam olarak böyle yazılır)", deger: k.hitap_ozel, yer: "örn. Ahmet Hocam" })}</div>
      ${alan({ ad: "dil", etiket: "Mesaj dili", tip: "select", deger: k.dil || "tr", liste: [{ kod: "tr", ad: "Türkçe" }, { kod: "en", ad: "İngilizce" }] })}
    </fieldset>
    <div class="izgara iki">
      ${alan({ ad: "potansiyel", etiket: "Potansiyel", tip: "select", deger: k.potansiyel || "", liste: POTANSIYEL, yardim: "potansiyel" })}
      ${paraAlani({ ad: "alim_gucu", etiket: "Tahmini alım gücü", tutar: k.alim_gucu_tutar, para: k.alim_gucu_para, yardim: "alim_gucu" })}
    </div>
    <div class="izgara iki">
      ${alan({ ad: "meslek", etiket: "Meslek", deger: k.meslek })}
      ${alan({ ad: "sirket", etiket: "Şirket", deger: k.sirket })}
    </div>
    ${alan({ ad: "yatirimci_tipi", etiket: "Al-satçı, yatırımcı ya da “olursa alır” mı?", tip: "select", deger: k.yatirimci_tipi || "", liste: KISI_TIPI_SECENEKLERI, yardim: "yatirimci" })}
    <div id="calisma-alani">
      ${bolgeSecici(konum, { ad: "calisma_bolge", bolgeler: k.calisma_bolgeleri || [], etiket: "Çalıştığı bölgeler" })}
      <div class="alan"><span class="etiket">İlgilendiği türler</span>${kutular("calisma_kategorileri", KATEGORILER, k.calisma_kategorileri || [])}</div>
    </div>
    <fieldset><legend>Kim tanıştırdı? ${ampul("referans")}</legend>
      ${kisiSecici({ ad: "referans_kisi_id", etiket: "Tanıştıran kişi (rehberinizden)", secili: referans })}
      ${alan({ ad: "referans_notu", etiket: "Nasıl tanıştınız, yakınlığı ne?", deger: k.referans_notu, yer: "örn. Feride Hanım'ın kuzeni; onun üzerinden aranır", ek: 'maxlength="300"' })}
    </fieldset>
    <label class="secenek"><input type="checkbox" name="mesaj_istemiyor" value="1"${nitelik("checked", k.mesaj_istemiyor)}> Mülk tanıtım mesajı istemiyor ${ampul("mesaj_istemiyor")}</label>
    ${alan({ ad: "notlar", etiket: "Notlar", tip: "textarea", deger: k.notlar, ek: 'maxlength="5000"' })}
    ${k.kontrol_notu ? html`<div class="sor-kutu"><p><b>Kontrol edilecek:</b> ${k.kontrol_notu}</p><label class="secenek"><input type="checkbox" name="kontrol_tamam" value="1"> Kontrol ettim</label></div>` : ""}
    <button class="dugme genis">${yeni ? "Kişiyi kaydet" : "Değişiklikleri kaydet"}</button>
  </form>`;
}

const TANISTIRAN_SORUSU = " Tanıştıranı rehberinizden seçmediniz; kim olduğunu aşağıdan seçin.";
async function kisiKaydet(req, mevcut) {
  const f = req.form, ben = req.kullanici.id;
  const ad = metin(f.ad, 200);
  if (ad.length < 2) throw new KullaniciHatasi("Ad soyad yazın.");
  const telefonlar = telefonlarOku(f);
  if (!telefonlar.length) throw new KullaniciHatasi("En az bir telefon numarası yazın.");
  const konum = await konumYukle();
  const yatirimci = secim(f.yatirimci_tipi, Object.keys(KISI_TIPI));
  const referansId = uuidMi(f.referans_kisi_id) ? f.referans_kisi_id : null;
  if (referansId && referansId === mevcut?.id) throw new KullaniciHatasi("Kişi kendisinin tanıştıranı olamaz.");
  const guc = sayi(f.alim_gucu_tutar), gucPara = secim(f.alim_gucu_para, ["TRY", "USD"], "TRY");
  return islem(req.kullanici, async (q) => {
    await numaraCakismasi(q, ben, telefonlar, mevcut?.id);
    // Tanıştıran kişi danışmanın kendi rehberinden olmalı (başkasının ya da silinmiş bir kişi bağlanamaz)
    if (referansId && !(await q.bir("select 1 from kisiler where id = $1 and sahip_id = $2 and silindi_at is null", [referansId, ben]))) throw new KullaniciHatasi("Tanıştıran kişi rehberinizde bulunamadı.");
    // "Bu kim?" yanıtı (rehberde yok / hatırlamıyorum) tanıştıran notu değişmedikçe korunur; not değişirse ya da kişi seçilirse yeniden sorulur
    const referansNotu = metin(f.referans_notu, 300);
    const referansDurumu = !referansId && referansNotu && mevcut && mevcut.referans_notu === referansNotu && !mevcut.referans_kisi_id ? mevcut.referans_durumu : null;
    const sabit = dolaraSabitle({ tutar: guc, para: gucPara, kur: await kurAl(q), onceki: mevcut && { tutar: mevcut.alim_gucu_tutar, para: mevcut.alim_gucu_para, usd: mevcut.alim_gucu_usd, kur: mevcut.alim_gucu_kur, tarih: mevcut.alim_gucu_tarih } });
    const d = [ad, metin(f.hitap_adi, 60), secim(f.hitap_turu, HITAP.map((h) => h.kod), "bey_hanim_yok"), metin(f.hitap_ozel, 80), secim(f.sen_siz, ["sen", "siz"], "siz"), secim(f.dil, ["tr", "en"], "tr"),
      metin(f.meslek, 200), metin(f.sirket, 200), metin(f.notlar, 5000), guc, guc == null ? null : gucPara, sabit.usd, sabit.kur, sabit.tarih, secim(f.potansiyel, ["A", "B", "C"]), isaretli(f.mesaj_istemiyor),
      yatirimci, JSON.stringify(yatirimci ? bolgeleriOku(konum, f.calisma_bolge) : []), yatirimci ? dizi(f.calisma_kategorileri).filter((x) => kategori(x)) : [], referansId, referansNotu, referansDurumu];
    let id = mevcut?.id;
    if (id) {
      await q(`update kisiler set ad=$2, hitap_adi=$3, hitap_turu=$4, hitap_ozel=$5, sen_siz=$6, dil=$7, meslek=$8, sirket=$9, notlar=$10, alim_gucu_tutar=$11, alim_gucu_para=$12, alim_gucu_usd=$13, alim_gucu_kur=$14, alim_gucu_tarih=$15,
        potansiyel=$16, mesaj_istemiyor=$17, yatirimci_tipi=$18, calisma_bolgeleri=$19, calisma_kategorileri=$20, referans_kisi_id=$21, referans_notu=$22, referans_durumu=$23, guncelleme_at=now(),
        kontrol_notu = case when $24 then '' else kontrol_notu end where id=$1`, [id, ...d, isaretli(f.kontrol_tamam)]);
      await q("delete from kisi_telefonlari where kisi_id = $1", [id]);
    } else {
      id = (await q.bir(`insert into kisiler (sahip_id, ad, hitap_adi, hitap_turu, hitap_ozel, sen_siz, dil, meslek, sirket, notlar, alim_gucu_tutar, alim_gucu_para, alim_gucu_usd, alim_gucu_kur, alim_gucu_tarih,
        potansiyel, mesaj_istemiyor, yatirimci_tipi, calisma_bolgeleri, calisma_kategorileri, referans_kisi_id, referans_notu, referans_durumu) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning id`, [ben, ...d])).id;
    }
    for (const [i, n] of telefonlar.entries()) await q("insert into kisi_telefonlari (kisi_id, sahip_id, numara, ana) values ($1, $2, $3, $4)", [id, ben, n, i === 0]);
    await kaydet(q, req, mevcut ? "kisi_degisti" : "kisi_eklendi", "kisi", id);
    if (mevcut && mevcut.alim_gucu_usd !== sabit.usd) await kisiIcinHesapla(q, id);
    // sor: tanıştıran yalnızca adla yazıldı ve henüz yanıtlanmadı; kart açılınca "bu kim?" diye sorulur
    return { id, sor: !referansId && !!referansNotu && !referansDurumu };
  });
}

export default async function (app) {
  // ---------- Liste ----------
  app.get("/kisiler", async (req, reply) => {
    const s = req.query, kap = kapsamOku(req);
    const ara = metin(s.q, 80), pot = secim(s.p, ["A", "B", "C", "yatirimci", "aranmayan"]), no = Math.max(1, Number(s.sayfa) || 1);
    const rakam = ara.replace(/\D/g, "");
    const v = await islem(req.kullanici, async (q) => {
      const kosul = ["k.silindi_at is null"], p = [];
      if (kap.sahipId) { p.push(kap.sahipId); kosul.push(`k.sahip_id = $${p.length}`); }
      if (ara) {
        p.push("%" + norm(ara) + "%");
        let c = `${adNormSql("k.ad")} like $${p.length} or ${adNormSql("k.sirket")} like $${p.length}`;
        if (rakam.length >= 3) { p.push("%" + rakam.replace(/^0/, "") + "%"); c += ` or exists (select 1 from kisi_telefonlari t where t.kisi_id = k.id and t.aktif and t.numara like $${p.length})`; }
        kosul.push(`(${c})`);
      }
      if (["A", "B", "C"].includes(pot)) { p.push(pot); kosul.push(`k.potansiyel = $${p.length}`); }
      if (pot === "yatirimci") kosul.push("k.yatirimci_tipi is not null");
      if (pot === "aranmayan") kosul.push("coalesce(k.son_temas_at, k.olusturma_at) < now() - interval '60 days'");
      const liste = await q(
        `select k.id, k.ad, k.potansiyel, k.yatirimci_tipi, k.mesaj_istemiyor, k.sahip_id, k.son_temas_at, k.sirket, k.silindi_at,
                (select numara from kisi_telefonlari t where t.kisi_id = k.id and t.aktif order by t.ana desc limit 1) as telefon,
                (select count(*) from talepler t where t.kisi_id = k.id and t.silindi_at is null and t.durum = 'aktif') as talep,
                (select count(*) from mulkler m where m.malik_kisi_id = k.id and m.silindi_at is null and m.durum in ('aktif', 'opsiyonlu')) as mulk
           from kisiler k where ${kosul.join(" and ")} order by ${adNormSql("k.ad")}, k.id limit ${SAYFA + 1} offset ${(no - 1) * SAYFA}`, p);
      const toplam = (await q.bir(`select count(*) as n from kisiler k where ${kosul.join(" and ")}`, p)).n;
      return { liste, toplam, danismanlar: await danismanlarAl(q, req) };
    });
    const dahaVar = v.liste.length > SAYFA;
    const SUZGEC = [["", "Hepsi"], ["A", "A"], ["B", "B"], ["C", "C"], ["yatirimci", "Yatırımcı"], ["aranmayan", "Uzun süredir aranmayan"]];
    const suzgecAdresi = (kod) => "?" + new URLSearchParams({ ...(ara ? { q: ara } : {}), ...(kod ? { p: kod } : {}), ...(kap.kimin !== "ben" ? { kimin: kap.kimin } : {}) });
    return reply.sayfa(sayfa(req, { baslik: "Kişiler", icerik: html`
      <div class="baslik-satiri"><h1>Kişiler <small>(${v.toplam})</small></h1><div class="dugmeler"><a class="dugme ikincil kucuk" href="/kisiler/yukle">Rehber yükle</a><a class="dugme kucuk" href="/kisiler/yeni">+ Kişi</a></div></div>
      <form class="arama" method="get"><input type="search" name="q" value="${ara}" placeholder="Ad, şirket ya da telefon ara" aria-label="Ara">${pot ? html`<input type="hidden" name="p" value="${pot}">` : ""}${kapsamSecici(v.danismanlar, kap.kimin)}<button class="dugme ikincil">Ara</button></form>
      <div class="sekmeler">${SUZGEC.map(([kod, ad]) => html`<a href="${suzgecAdresi(kod)}"${nitelik('class="etkin"', (pot || "") === kod)}>${ad}</a>`)}</div>
      <div class="kart">${v.liste.length ? html`<ul class="liste">${v.liste.slice(0, SAYFA).map((k) => html`<li>
        <div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a><small>${telefonYaz(k.telefon)}${k.sirket ? " · " + k.sirket : ""}${k.talep ? ` · ${k.talep} talep` : ""}${k.mulk ? ` · ${k.mulk} mülk` : ""}</small>
          <div class="etiketler">${kisiEtiketleri(k)}${k.sahip_id !== req.kullanici.id ? danismanEtiketi(v.danismanlar.get(k.sahip_id)) : ""}</div></div>
        <div class="yan"><small>${k.son_temas_at ? neKadarOnce(k.son_temas_at) : ""}</small></div></li>`)}</ul>`
        : bos(ara || pot ? "Aramanıza uyan kişi yok." : "Rehberiniz boş.", ara || pot ? "" : html`<a class="dugme" href="/kisiler/yukle">Rehberimi yükle</a>`)}</div>
      ${sayfalama(req, no, dahaVar)}` }));
  });

  // Kişi seçici için arama (yalnızca kendi rehberi)
  app.get("/kisiler/ara", async (req) => {
    const ara = metin(req.query.q, 60), rakam = ara.replace(/\D/g, "").replace(/^0/, "");
    if (ara.length < 2) return [];
    return islem(req.kullanici, async (q) => (await q(
      `select k.id, k.ad, (select numara from kisi_telefonlari t where t.kisi_id = k.id and t.aktif order by t.ana desc limit 1) as telefon
         from kisiler k where k.sahip_id = $1 and k.silindi_at is null and (${adNormSql("k.ad")} like $2 or ($3 <> '' and exists (select 1 from kisi_telefonlari t where t.kisi_id = k.id and t.aktif and t.numara like $4)))
        order by ${adNormSql("k.ad")} limit 12`, [req.kullanici.id, "%" + norm(ara) + "%", rakam.length >= 3 ? rakam : "", "%" + rakam + "%"])).map((k) => ({ id: k.id, ad: k.ad, telefon: telefonYaz(k.telefon) })));
  });

  // ---------- Yeni / düzenle ----------
  // Kişinin kendi rehberindeki bir başka kişi (tanıştıran): yalnızca adı ve kimliği
  const rehberdenKisi = (q, req, id) => (uuidMi(id) ? q.bir("select id, ad from kisiler where id = $1 and sahip_id = $2 and silindi_at is null", [id, req.kullanici.id]) : null);
  app.get("/kisiler/yeni", async (req, reply) => {
    // "?referans=…": bir kişinin kartından "tanıştırdığı kişiyi ekle" denince tanıştıran hazır gelir
    const referans = await islem(req.kullanici, (q) => rehberdenKisi(q, req, req.query.referans));
    return reply.sayfa(sayfa(req, { baslik: "Yeni kişi", geri: referans ? { yol: "/kisiler/" + referans.id, ad: referans.ad } : { yol: "/kisiler", ad: "Kişiler" },
      icerik: html`<h1>Yeni kişi</h1>${kisiFormu(req, await konumYukle(), { ad: metin(req.query.ad, 200) }, [req.query.telefon ? telefonNorm(req.query.telefon) : ""], referans)}` }));
  });
  app.post("/kisiler", async (req, reply) => {
    const { id, sor } = await kisiKaydet(req, null);
    return reply.bildir("Kişi kaydedildi." + (sor ? TANISTIRAN_SORUSU : "")).redirect("/kisiler/" + id);
  });
  app.get("/kisiler/:id/duzenle", async (req, reply) => {
    const v = await islem(req.kullanici, async (q) => {
      const k = await kisiGetir(q, req.params.id);
      return { k, referans: await rehberdenKisi(q, req, k.referans_kisi_id), telefonlar: (await q("select numara from kisi_telefonlari where kisi_id = $1 and aktif order by ana desc, numara", [k.id])).map((t) => t.numara) };
    });
    if (v.k.sahip_id !== req.kullanici.id || v.k.silindi_at) throw new KullaniciHatasi("Bu kaydı yalnızca kaydın sahibi değiştirebilir.", 403);
    return reply.sayfa(sayfa(req, { baslik: v.k.ad, geri: { yol: "/kisiler/" + v.k.id, ad: v.k.ad }, icerik: html`<h1>Kişiyi düzenle</h1>${kisiFormu(req, await konumYukle(), v.k, v.telefonlar, v.referans)}` }));
  });
  app.post("/kisiler/:id", async (req, reply) => {
    const k = await islem(req.kullanici, (q) => kisiGetir(q, req.params.id));
    if (k.sahip_id !== req.kullanici.id || k.silindi_at) throw new KullaniciHatasi("Bu kaydı yalnızca kaydın sahibi değiştirebilir.", 403);
    const { sor } = await kisiKaydet(req, k);
    return reply.bildir("Değişiklikler kaydedildi." + (sor ? TANISTIRAN_SORUSU : "")).redirect("/kisiler/" + k.id);
  });
  app.post("/kisiler/:id/sil", async (req, reply) => {
    await islem(req.kullanici, (q) => kisiSil(q, req, idGerekli(req.params.id)));
    return reply.bildir("Kişi silindi.").redirect("/kisiler");
  });

  // ---------- Kişi kartı ----------
  app.get("/kisiler/:id", async (req, reply) => {
    if (!uuidMi(req.params.id)) throw new KullaniciHatasi("Kişi bulunamadı.", 404);
    const konum = await konumYukle(), ben = req.kullanici.id;
    const v = await islem(req.kullanici, async (q) => {
      const k = await kisiGetir(q, req.params.id);
      const benim = k.sahip_id === ben && !k.silindi_at;
      return {
        k, benim,
        telefonlar: await q("select numara, ana from kisi_telefonlari where kisi_id = $1 and (aktif or $2) order by ana desc, numara", [k.id, !!k.silindi_at]),
        talepler: await q("select * from talepler where kisi_id = $1 and ($2 or silindi_at is null) order by durum, olusturma_at desc", [k.id, !!k.silindi_at]),
        mulkler: await q("select * from mulkler where malik_kisi_id = $1 and ($2 or silindi_at is null) order by durum, olusturma_at desc", [k.id, !!k.silindi_at]),
        gorusmeler: await q("select * from gorusmeler where kisi_id = $1 order by tarih desc nulls last, olusturma_at desc limit 60", [k.id]),
        // Kim tanıştırdı, kimi tanıştırdı, hangi yerleri getirdi. Başka danışmanın ya da silinmiş kişinin adı okuma kuralından geçmez.
        referans: k.referans_kisi_id ? await q.bir("select id, ad from kisiler where id = $1", [k.referans_kisi_id]) : null,
        // Tanıştıran yazılı ama rehberden seçilmemişse (ve "rehberde yok" denmemişse) rehberden adı benzeyenler önerilir
        kimAdaylari: benim && k.referans_notu && !k.referans_kisi_id && k.referans_durumu !== "rehberde_yok" ? await adaylariAl(q, ben, k.referans_notu, k.id) : null,
        tanistirdiklari: await q(`select id, ad, referans_notu from kisiler where referans_kisi_id = $1 and silindi_at is null order by ${adNormSql("ad")} limit 100`, [k.id]),
        getirdikleri: await q("select * from mulkler where kaynak_kisi_id = $1 and silindi_at is null order by (durum in ('aktif', 'opsiyonlu')) desc, olusturma_at desc limit 100", [k.id]),
        hatirlatmalar: await q("select * from hatirlatmalar where kisi_id = $1 and tamamlandi_at is null order by tarih", [k.id]),
        belgeler: await q("select * from belgeler where kisi_id = $1 order by olusturma_at desc", [k.id]),
        danismanlar: await danismanlarAl(q, req),
      };
    });
    const k = v.k, benim = v.benim, kartYolu = "/kisiler/" + k.id;
    const ana = v.telefonlar[0]?.numara;
    return reply.sayfa(sayfa(req, { baslik: k.ad, geri: { yol: "/kisiler", ad: "Kişiler" }, icerik: html`
      <div class="kart">
        <div class="baslik-satiri"><h1>${k.ad}</h1>${benim ? html`<a class="dugme ikincil kucuk" href="/kisiler/${k.id}/duzenle">Düzenle</a>` : ""}</div>
        <div class="etiketler">${kisiEtiketleri(k)}${!benim && k.sahip_id !== req.kullanici.id ? danismanEtiketi(v.danismanlar.get(k.sahip_id)) : ""}</div>
        <dl class="tanim">
          <dt>Telefon</dt><dd>${v.telefonlar.map((t, i) => html`${i ? ", " : ""}${telefonBaglantisi(t.numara)}`)}</dd>
          <dt>Hitap</dt><dd>${hitapYaz(k)} · ${k.sen_siz === "sen" ? "sen" : "siz"}${k.dil === "en" ? " · İngilizce" : ""}</dd>
          ${k.meslek || k.sirket ? html`<dt>İş</dt><dd>${[k.meslek, k.sirket].filter(Boolean).join(" · ")}</dd>` : ""}
          ${v.referans || k.referans_notu ? html`<dt>Kim tanıştırdı</dt><dd>${kaynakYaz(v.referans, k.referans_notu)}${!k.referans_kisi_id && k.referans_durumu ? html` <span class="etiket-k${k.referans_durumu === "bilinmiyor" ? " sari" : ""}">${BAG_DURUMU[k.referans_durumu]}</span>` : ""}</dd>` : ""}
          ${v.tanistirdiklari.length || v.getirdikleri.length ? html`<dt>Ondan gelenler</dt><dd><a href="#ondan-gelenler">${[v.tanistirdiklari.length ? `${v.tanistirdiklari.length} kişi tanıştırdı` : "", v.getirdikleri.length ? `${v.getirdikleri.length} yer getirdi` : ""].filter(Boolean).join(" · ")}</a></dd>` : ""}
          ${k.yatirimci_tipi ? html`<dt>Tipi</dt><dd>${KISI_TIPI[k.yatirimci_tipi]}${(k.calisma_bolgeleri || []).length ? " · " + k.calisma_bolgeleri.map((b) => konum.yerAdi(b.ilce, b.mahalle)).filter(Boolean).join(", ") : ""}${(k.calisma_kategorileri || []).length ? " · " + k.calisma_kategorileri.map((x) => kategoriAdi(x).toLocaleLowerCase("tr")).join(", ") : ""}</dd>` : ""}
          ${k.alim_gucu_tutar != null ? html`<dt>Alım gücü</dt><dd>${paraYaz(k.alim_gucu_tutar, k.alim_gucu_para)}${k.alim_gucu_para === "TRY" && k.alim_gucu_usd ? html` <small>(${paraYaz(k.alim_gucu_usd, "USD")} · ${tarihYaz(k.alim_gucu_tarih)} kuruyla)</small>` : ""}</dd>` : ""}
          <dt>Son temas</dt><dd>${k.son_temas_at ? neKadarOnce(k.son_temas_at) : "kayıt yok"}</dd>
          ${k.notlar ? html`<dt>Notlar</dt><dd>${satirli(k.notlar)}</dd>` : ""}
        </dl>
        ${v.kimAdaylari ? kimKutusu(req, { ne: "Tanıştıran", kayit: "k:" + k.id, notu: k.referans_notu, durum: k.referans_durumu, adaylar: v.kimAdaylari, geri: kartYolu }) : ""}
        ${benim ? teyitKutusu(req, { kayit: "k:" + k.id, notu: k.kontrol_notu, geri: kartYolu }) : ""}
        ${benim ? html`<div class="dugmeler">
          ${ana ? html`<a class="dugme kucuk" href="tel:+${ana}">Ara</a><a class="dugme kucuk wa" href="https://wa.me/${ana}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          <form method="post" action="/kisiler/${k.id}/arandi" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk ikincil">Bugün aradım ✓</button></form>
          <a class="dugme kucuk ikincil" href="/talepler/yeni?kisi=${k.id}">+ Talep</a>
          <a class="dugme kucuk ikincil" href="/mulkler/yeni?kisi=${k.id}">+ Mülk</a>
        </div>` : ""}
      </div>
      <div class="kart"><h2>Aradığı (talepler)</h2>${v.talepler.length ? html`<ul class="liste">${v.talepler.map((t) => html`<li><div class="govde"><a class="ad" href="/talepler/${t.id}">${ISLEM_ADI[t.islem]} · ${talepTarifi(t, konum)}</a><small>${TALEP_DURUMU[t.durum]}</small></div></li>`)}</ul>` : html`<p class="soluk">Açık talebi yok.</p>`}</div>
      <div class="kart"><h2>Mülkleri</h2>${v.mulkler.length ? html`<ul class="liste">${v.mulkler.map((m) => html`<li><div class="govde"><a class="ad" href="/mulkler/${m.id}">${ISLEM_ADI[m.islem]} · ${mulkTarifi(m, konum)}</a><small>${fiyatYaz(m)} · ${MULK_DURUMU[m.durum]}</small></div></li>`)}</ul>` : html`<p class="soluk">Kayıtlı mülkü yok.</p>`}</div>
      <div class="kart"><h2>Geri arama sözü</h2>
        ${v.hatirlatmalar.length ? html`<ul class="liste">${v.hatirlatmalar.map((h) => html`<li><div class="govde"><span class="ad">${tarihYaz(h.tarih)}</span><small>${h.notu}</small></div>
          ${benim ? html`<div class="yan"><form method="post" action="/hatirlatmalar/${h.id}/tamam" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk sade">Arandı ✓</button></form></div>` : ""}</li>`)}</ul>` : ""}
        ${benim ? html`<form method="post" action="/kisiler/${k.id}/hatirlatma" class="form">${csrfAlani(req)}<div class="izgara iki">
          ${alan({ ad: "tarih", etiket: "Ne zaman arayacaksınız?", tip: "date", zorunlu: true, ek: `min="${bugun()}"` })}${alan({ ad: "notu", etiket: "Not", ek: 'maxlength="300"' })}</div>
          <button class="dugme ikincil kucuk">Hatırlat</button></form>` : ""}
      </div>
      <div class="kart" id="gorusmeler"><h2>Görüşmeler</h2>
        ${benim ? html`<details><summary class="dugme ikincil kucuk">+ Görüşme ekle</summary><form method="post" action="/kisiler/${k.id}/gorusme" class="form">${csrfAlani(req)}
          <div class="izgara uc">
            ${alan({ ad: "tarih", etiket: "Tarih", tip: "date", deger: bugun(), zorunlu: true, ek: `max="${bugun()}"` })}
            ${alan({ ad: "tur", etiket: "Tür", tip: "select", deger: "gorusme", liste: Object.entries(GORUSME_TURU).map(([kod, ad]) => ({ kod, ad })) })}
            ${alan({ ad: "sonuc", etiket: "Sonuç", tip: "select", liste: [{ kod: "", ad: "—" }, ...Object.entries(SONUC_ADI).map(([kod, ad]) => ({ kod, ad }))] })}
          </div>
          <p class="soluk">Bir mülk için görüştüyseniz yerini ve türünü de yazın; ileride benzer mülk çıktığında bu kişi öne çıkar.</p>
          ${konumSecici(konum, {})}
          <div class="izgara uc">${alan({ ad: "kategori", etiket: "Mülk türü", tip: "select", liste: [{ kod: "", ad: "—" }, ...KATEGORILER] })}
            ${alan({ ad: "islem", etiket: "Satılık / kiralık", tip: "select", liste: [{ kod: "", ad: "—" }, { kod: "satilik", ad: "Satılık" }, { kod: "kiralik", ad: "Kiralık" }] })}${paraAlani({ ad: "tutar", etiket: "Konuşulan tutar" })}</div>
          ${alan({ ad: "notu", etiket: "Not", tip: "textarea", ek: 'maxlength="2000"' })}
          <button class="dugme kucuk">Görüşmeyi kaydet</button></form></details>` : ""}
        ${v.gorusmeler.length ? html`<ul class="liste">${v.gorusmeler.map((g) => html`<li><div class="govde"><span class="ad">${gorusmeTarihi(g)} · ${GORUSME_TURU[g.tur]}${g.sonuc ? " · " + SONUC_ADI[g.sonuc] : ""}</span>
          <small>${[konum.yerAdi(g.ilce_id, g.mahalle_id), g.islem === "kiralik" ? "kiralık" : "", g.kategori ? (g.alt_tur ? altTurAdi(g.kategori, g.alt_tur) : kategoriAdi(g.kategori)) : "", g.tutar_usd ? paraYaz(g.tutar_usd, "USD") : ""].filter(Boolean).join(" · ")}</small>${g.notu ? html`<div class="neden">${satirli(g.notu)}</div>` : ""}
          ${g.kontrol_notu ? html`<div class="neden"><b>Kontrol edilecek:</b> ${g.kontrol_notu}</div>` : ""}</div>
          ${g.kontrol_notu && benim && g.sahip_id === ben ? html`<div class="yan">${gorusmeTeyidi(req, g.id, kartYolu + "#gorusmeler")}</div>` : ""}</li>`)}</ul>` : html`<p class="soluk">Henüz görüşme kaydı yok.</p>`}
      </div>
      <div class="kart" id="ondan-gelenler"><h2>Tanıştırdıkları ve getirdiği yerler ${ampul("referans")}</h2>
        ${v.tanistirdiklari.length ? html`<h3>Tanıştırdığı kişiler (${v.tanistirdiklari.length})</h3><ul class="liste">${v.tanistirdiklari.map((t) => html`<li><div class="govde"><a class="ad" href="/kisiler/${t.id}">${t.ad}</a>${t.referans_notu ? html`<small>${t.referans_notu}</small>` : ""}</div></li>`)}</ul>` : ""}
        ${v.getirdikleri.length ? html`<h3>Getirdiği yerler (${v.getirdikleri.length})</h3><ul class="liste">${v.getirdikleri.map((m) => html`<li><div class="govde"><a class="ad" href="/mulkler/${m.id}">${m.baslik || `${ISLEM_ADI[m.islem]} · ${mulkTarifi(m, konum)}`}</a><small>${[m.baslik ? mulkTarifi(m, konum) : "", fiyatYaz(m), MULK_DURUMU[m.durum]].filter(Boolean).join(" · ")}</small></div></li>`)}</ul>` : ""}
        ${!v.tanistirdiklari.length && !v.getirdikleri.length ? html`<p class="soluk">Bu kişinin tanıştırdığı biri ya da getirdiği bir yer kayıtlı değil.</p>` : ""}
        ${benim ? html`<div class="dugmeler"><a class="dugme kucuk ikincil" href="/kisiler/yeni?referans=${k.id}">+ Tanıştırdığı kişi</a><a class="dugme kucuk ikincil" href="/mulkler/yeni?kaynak=${k.id}">+ Getirdiği yer</a></div>` : ""}
      </div>
      ${belgeBolumu(req, v.belgeler, { kisiId: k.id, yazabilir: benim })}
      ${(k.sahip_id === req.kullanici.id || req.kullanici.rol === "sahip") && !k.silindi_at ? html`<form method="post" action="/kisiler/${k.id}/sil">${csrfAlani(req)}<button class="dugme tehlike kucuk" data-onay="${k.ad} silinsin mi? Talepleri ve mülkleri de silinir.">Kişiyi sil</button> ${ampul("silme")}</form>` : ""}` }));
  });

  // ---------- Görüşme, hatırlatma, arandı ----------
  const kendiKisisi = async (q, req) => {
    const k = await kisiGetir(q, req.params.id);
    if (k.sahip_id !== req.kullanici.id || k.silindi_at) throw new KullaniciHatasi("Bu işlem yalnızca kaydın sahibine açık.", 403);
    return k;
  };
  app.post("/kisiler/:id/gorusme", async (req, reply) => {
    const f = req.form, konum = await konumYukle(), yer = konumOku(konum, f);
    await islem(req.kullanici, async (q) => {
      const k = await kendiKisisi(q, req);
      const kur = await kurAl(q), para = secim(f.tutar_para, ["TRY", "USD"], "TRY"), tutar = sayi(f.tutar_tutar);
      const t = tarih(f.tarih) || bugun();
      if (t > bugun()) throw new KullaniciHatasi("Görüşme tarihi ileride olamaz.");
      await q("insert into gorusmeler (kisi_id, sahip_id, tarih, tur, ilce_id, mahalle_id, kategori, tutar_usd, sonuc, notu, islem) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [k.id, req.kullanici.id, t, secim(f.tur, Object.keys(GORUSME_TURU), "gorusme"), yer.ilce_id, yer.mahalle_id, kategori(f.kategori) ? f.kategori : null, tutar == null ? null : Math.round(usd(tutar, para, kur?.usd_try) ?? 0) || null, secim(f.sonuc, Object.keys(SONUC_ADI)), metin(f.notu, 2000), secim(f.islem, ["satilik", "kiralik"])]);
      await q("update kisiler set son_temas_at = greatest(coalesce(son_temas_at, 'epoch'), $2::date) where id = $1", [k.id, t]);
    });
    return reply.bildir("Görüşme kaydedildi.").redirect("/kisiler/" + req.params.id);
  });
  app.post("/kisiler/:id/hatirlatma", async (req, reply) => {
    const t = tarih(req.form.tarih);
    if (!t) throw new KullaniciHatasi("Tarih seçin.");
    await islem(req.kullanici, async (q) => {
      const k = await kendiKisisi(q, req);
      await q("insert into hatirlatmalar (kisi_id, sahip_id, tarih, notu) values ($1, $2, $3, $4)", [k.id, req.kullanici.id, t, metin(req.form.notu, 300)]);
    });
    return reply.bildir(`${tarihYaz(t)} günü hatırlatılacak.`).redirect("/kisiler/" + req.params.id);
  });
  app.post("/kisiler/:id/arandi", async (req, reply) => {
    await islem(req.kullanici, async (q) => {
      const k = await kendiKisisi(q, req);
      await q("insert into gorusmeler (kisi_id, sahip_id, tur) values ($1, $2, 'arama')", [k.id, req.kullanici.id]);
      await q("update kisiler set son_temas_at = now() where id = $1", [k.id]);
    });
    return reply.bildir("Arama kaydedildi.").redirect("/kisiler/" + req.params.id);
  });
  app.post("/hatirlatmalar/:id/tamam", async (req, reply) => {
    await islem(req.kullanici, async (q) => {
      const h = await q.bir("update hatirlatmalar set tamamlandi_at = now() where id = $1 and sahip_id = $2 and tamamlandi_at is null returning kisi_id", [idGerekli(req.params.id), req.kullanici.id]);
      if (h) await q("update kisiler set son_temas_at = now() where id = $1", [h.kisi_id]);
    });
    return reply.bildir("Tamamlandı.").redirect(req.headers.referer ? new URL(req.headers.referer).pathname : "/");
  });

  // ---------- Belgeler (kişiye ya da mülke bağlı) ----------
  app.post("/belgeler", async (req, reply) => {
    const f = req.form, dosya = Array.isArray(f.dosya) ? f.dosya[0] : f.dosya;
    if (!dosya?.veri?.length) throw new KullaniciHatasi("Dosya seçin.");
    const tur = dosyaTuru(dosya.veri);
    if (!tur) throw new KullaniciHatasi("Yalnızca PDF ve fotoğraf (JPG, PNG, WEBP, HEIC) yüklenebilir.");
    const kisiId = uuidMi(f.kisi_id) ? f.kisi_id : null, mulkId = uuidMi(f.mulk_id) ? f.mulk_id : null;
    if (!kisiId && !mulkId) throw new KullaniciHatasi("Belgenin bağlanacağı kayıt bulunamadı.");
    const yol = await dosyaKaydet("belgeler", dosya.veri, tur.uzanti);
    try {
      await islem(req.kullanici, async (q) => {
        await q("insert into belgeler (sahip_id, kisi_id, mulk_id, tur, dosya_adi, mime, boyut, depo_yolu) values ($1,$2,$3,$4,$5,$6,$7,$8)",
          [req.kullanici.id, kisiId, mulkId, secim(f.tur, ["tapu", "imar", "plan_notu", "roleve", "diger"], "diger"), metin(dosya.dosyaAdi, 150).replace(/[\\/\r\n"]/g, "_") || "belge." + tur.uzanti, tur.mime, dosya.veri.length, yol]);
        await kaydet(q, req, "belge_eklendi", kisiId ? "kisi" : "mulk", kisiId || mulkId);
      });
    } catch (e) {
      await dosyaSil(yol).catch(() => {});
      if (e.code === "42501") throw new KullaniciHatasi("Bu kayda belge ekleyemezsiniz.", 403);
      throw e;
    }
    return reply.bildir("Belge eklendi.").redirect(kisiId ? "/kisiler/" + kisiId : "/mulkler/" + mulkId);
  });
  app.get("/belgeler/:id", async (req, reply) => {
    const b = await islem(req.kullanici, (q) => q.bir("select * from belgeler where id = $1", [idGerekli(req.params.id)]));
    if (!b) throw new KullaniciHatasi("Belge bulunamadı.", 404);
    const yol = dosyaYolu(b.depo_yolu);
    if (!fs.existsSync(yol)) throw new KullaniciHatasi("Belge bulunamadı.", 404);
    return reply.header("cache-control", "private, no-store").header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(b.dosya_adi)}`).type(b.mime).send(fs.createReadStream(yol));
  });
  app.post("/belgeler/:id/sil", async (req, reply) => {
    const b = await islem(req.kullanici, (q) => q.bir("delete from belgeler where id = $1 and sahip_id = $2 returning *", [idGerekli(req.params.id), req.kullanici.id]));
    if (!b) throw new KullaniciHatasi("Belge bulunamadı.", 404);
    await dosyaSil(b.depo_yolu).catch(() => {});
    return reply.bildir("Belge silindi.").redirect(b.kisi_id ? "/kisiler/" + b.kisi_id : "/mulkler/" + b.mulk_id);
  });

  // ---------- Rehber yükleme ----------
  app.get("/kisiler/yukle", async (req, reply) => reply.sayfa(sayfa(req, { baslik: "Rehber yükle", geri: { yol: "/kisiler", ad: "Kişiler" }, dar: true, icerik: html`
    <h1>Rehberimi yükle ${ampul("rehber_yukleme")}</h1>
    <div class="kart"><p>Telefonunuzdaki rehberi dosya olarak dışa aktarıp buraya yükleyin. Aynı dosyayı sonra yeniden yüklerseniz yalnızca yeni kişiler eklenir, kayıtlılar güncellenir; kimse iki kez yazılmaz.</p>
      <form method="post" action="/kisiler/yukle" enctype="multipart/form-data" class="form">${csrfAlani(req)}
        <label class="alan"><span class="etiket">Rehber dosyası (.vcf ya da .csv)</span><input type="file" name="dosya" accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv" required></label>
        <button class="dugme genis">Dosyayı oku</button></form>
      <p class="soluk">Yüklemeden önce bir ön izleme göreceksiniz.</p></div>
    <div class="kart"><button type="button" class="dugme ikincil genis" id="telefondan-sec">Telefon rehberinden seç (Android)</button>
      <form method="post" action="/kisiler/yukle/telefondan" id="telefondan-formu">${csrfAlani(req)}<input type="hidden" name="kisiler"></form>
      <p class="soluk">iPhone'da tarayıcı rehbere erişemez; rehberi dosya olarak dışa aktarın (💡 işaretine dokunun).</p></div>` })));

  async function taslakOlustur(req, kayitlar) {
    if (!kayitlar.length) throw new KullaniciHatasi("Dosyada kişi bulunamadı. Rehberi .vcf ya da .csv olarak dışa aktardığınızdan emin olun.");
    if (kayitlar.length > 20000) throw new KullaniciHatasi("Dosyada 20.000'den fazla kişi var; lütfen parçalara bölün.");
    return islem(req.kullanici, async (q) => {
      const mevcut = new Map((await q("select numara, kisi_id from kisi_telefonlari where sahip_id = $1 and aktif", [req.kullanici.id])).map((t) => [t.numara, t.kisi_id]));
      const { satirlar, ozet } = yuklemeHazirla(kayitlar, mevcut);
      if (!satirlar.length) throw new KullaniciHatasi("Dosyadaki kişilerin hiçbirinde geçerli telefon numarası yok.");
      await q("delete from yukleme_taslaklari where sahip_id = $1", [req.kullanici.id]);
      return (await q.bir("insert into yukleme_taslaklari (sahip_id, kayitlar, ozet) values ($1, $2, $3) returning id", [req.kullanici.id, JSON.stringify(satirlar), JSON.stringify(ozet)])).id;
    });
  }
  app.post("/kisiler/yukle", async (req, reply) => {
    const dosya = Array.isArray(req.form.dosya) ? req.form.dosya[0] : req.form.dosya;
    if (!dosya?.veri?.length) throw new KullaniciHatasi("Dosya seçin.");
    const id = await taslakOlustur(req, dosyaOku(dosya.veri, dosya.dosyaAdi));
    return reply.redirect("/kisiler/yukle/" + id);
  });
  app.post("/kisiler/yukle/telefondan", async (req, reply) => {
    let liste;
    try { liste = JSON.parse(req.form.kisiler || "[]"); } catch { liste = []; }
    if (!Array.isArray(liste)) liste = [];
    const id = await taslakOlustur(req, liste.slice(0, 20000).map((c) => ({ ad: String(c?.ad || ""), telefonlar: Array.isArray(c?.telefonlar) ? c.telefonlar.map(String) : [] })));
    return reply.redirect("/kisiler/yukle/" + id);
  });
  app.get("/kisiler/yukle/:id", async (req, reply) => {
    const t = await islem(req.kullanici, (q) => q.bir("select * from yukleme_taslaklari where id = $1 and sahip_id = $2", [idGerekli(req.params.id), req.kullanici.id]));
    if (!t) throw new KullaniciHatasi("Ön izleme bulunamadı; dosyayı yeniden yükleyin.", 404);
    const o = t.ozet, GOSTER = 300;
    return reply.sayfa(sayfa(req, { baslik: "Ön izleme", geri: { yol: "/kisiler/yukle", ad: "Rehber yükle" }, icerik: html`
      <h1>Ön izleme</h1>
      <div class="kart"><p><b>${o.yeni}</b> yeni kişi eklenecek${o.kayitli ? html`, <b>${o.kayitli}</b> kayıtlı kişi güncellenecek` : ""}.</p>
        <p class="soluk">Dosyada ${o.okunan} satır okundu.${o.numarasiz ? ` ${o.numarasiz} kişide telefon numarası olmadığı için alınmadı.` : ""}${o.tekrar ? ` ${o.tekrar} tekrar birleştirildi.` : ""}</p>
        <form method="post" action="/kisiler/yukle/${t.id}">${csrfAlani(req)}<div class="dugmeler"><button class="dugme">Hepsini rehberime ekle</button><a class="dugme sade" href="/kisiler/yukle">Vazgeç</a></div></form></div>
      <div class="kart"><ul class="liste onizleme-liste">${t.kayitlar.slice(0, GOSTER).map((s) => html`<li><div class="govde"><span class="ad">${s.ad}</span><small>${s.telefonlar.map(telefonYaz).join(", ")}${s.sirket ? " · " + s.sirket : ""}</small></div>
        <div class="yan">${s.kayitli_kisi_id ? html`<span class="etiket-k">kayıtlı</span>` : html`<span class="etiket-k iyi">yeni</span>`}</div></li>`)}</ul>
        ${t.kayitlar.length > GOSTER ? html`<p class="soluk">… ve ${t.kayitlar.length - GOSTER} kişi daha.</p>` : ""}</div>` }));
  });
  app.post("/kisiler/yukle/:id", async (req, reply) => {
    const ben = req.kullanici.id;
    const sonuc = await islem(req.kullanici, async (q) => {
      const t = await q.bir("delete from yukleme_taslaklari where id = $1 and sahip_id = $2 returning *", [idGerekli(req.params.id), ben]);
      if (!t) throw new KullaniciHatasi("Ön izleme bulunamadı; dosyayı yeniden yükleyin.", 404);
      // Ön izlemeden bu yana eklenmiş olabilecek numaralar için yeniden bak
      const mevcut = new Map((await q("select numara, kisi_id from kisi_telefonlari where sahip_id = $1 and aktif", [ben])).map((x) => [x.numara, x.kisi_id]));
      const yeni = { id: [], ad: [], sirket: [], meslek: [], notlar: [] }, tel = { kisi: [], numara: [], ana: [] };
      let guncellenen = 0;
      for (const s of t.kayitlar) {
        const kayitli = s.telefonlar.map((n) => mevcut.get(n)).find(Boolean);
        let id = kayitli;
        if (kayitli) {
          guncellenen++;
          await q("update kisiler set sirket = case when sirket = '' then $2 else sirket end, meslek = case when meslek = '' then $3 else meslek end, guncelleme_at = now() where id = $1", [kayitli, s.sirket || "", s.meslek || ""]);
        } else {
          id = crypto.randomUUID();
          yeni.id.push(id); yeni.ad.push(s.ad); yeni.sirket.push(s.sirket || ""); yeni.meslek.push(s.meslek || ""); yeni.notlar.push(s.not || "");
        }
        for (const [i, n] of s.telefonlar.entries()) {
          if (mevcut.has(n)) continue;
          mevcut.set(n, id);
          tel.kisi.push(id); tel.numara.push(n); tel.ana.push(!kayitli && i === 0);
        }
      }
      await q("insert into kisiler (id, sahip_id, ad, sirket, meslek, notlar) select a, $1, b, c, d, e from unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[]) as t(a, b, c, d, e)", [ben, yeni.id, yeni.ad, yeni.sirket, yeni.meslek, yeni.notlar]);
      await q("insert into kisi_telefonlari (kisi_id, sahip_id, numara, ana) select a, $1, b, c from unnest($2::uuid[], $3::text[], $4::bool[]) as t(a, b, c)", [ben, tel.kisi, tel.numara, tel.ana]);
      await kaydet(q, req, "rehber_yuklendi", null, null, { yeni: yeni.id.length, guncellenen });
      return { yeni: yeni.id.length, guncellenen };
    });
    return reply.bildir(`${sonuc.yeni} kişi eklendi${sonuc.guncellenen ? `, ${sonuc.guncellenen} kişi güncellendi` : ""}.`).redirect("/kisiler");
  });
}
