// Yönetim: ekip ve üyelikler, ekip eşleşmeleri, çift kayıtlar, ayarlar, komşuluklar, yardım metinleri,
// işlem kaydı; yalnızca sistem sahibi için çöp kutusu, kalıcı silme ve dışa aktarma.
import { ayar } from "../ayar.js";
import { islem } from "../db.js";
import { html, nitelik } from "../lib/html.js";
import { sayfa, ampul, alan, csrfAlani, bos, puanRozeti, danismanEtiketi } from "../gorunum/duzen.js";
import { VARSAYILAN_IL } from "../gorunum/konum.js";
import { mulkTarifi, talepTarifi, fiyatYaz, eslesmeNotlari } from "../gorunum/parcalar.js";
import { VARSAYILAN_AYAR } from "../alan/eslestirme.js";
import { konumYukle, ayarlarAl, ayarYaz, kurAl, kurKaydet, kaydet, KullaniciHatasi, sahipMi, danismanlarAl } from "../servis/ortak.js";
import { hepsiniHesapla } from "../servis/eslesme.js";
import { kisiKaliciSil, dosyalariSil } from "../servis/silme.js";
import { jetonUret, jetonHash } from "../kimlik.js";
import { epostaGonder, sablonlar } from "../eposta.js";
import { VARSAYILAN_GIZLILIK } from "./giris.js";
import { metin, sayi, uuidMi, isaretli, secim } from "../lib/form.js";
import { tarihYaz, tarihSaatYaz, neKadarOnce, sayiYaz, telefonYaz, bugun } from "../lib/metin.js";

const yonetici = { config: { rol: ["yonetici", "sahip"] } };
const sahip = { config: { rol: ["sahip"] } };
const ROL_ADI = { danisman: "Danışman", yonetici: "Yönetici", sahip: "Sistem sahibi" };
const DURUM_ADI = { eposta_bekliyor: "E-posta onayı bekliyor", onay_bekliyor: "Onayınızı bekliyor", aktif: "Aktif", kapali: "Kapalı" };
const MODULLER = [{ kod: "crm", ad: "Müşteri takibi (CRM)" }, { kod: "claude_mesaj", ad: "Claude ile mesaj yazdırma" }];
const EYLEM_ADI = { kisi_eklendi: "Kişi ekledi", kisi_degisti: "Kişiyi değiştirdi", kisi_silindi: "Kişi sildi", mulk_eklendi: "Mülk ekledi", mulk_degisti: "Mülkü değiştirdi", mulk_silindi: "Mülk sildi", mulk_durum: "Mülk durumunu değiştirdi",
  talep_eklendi: "Talep ekledi", talep_degisti: "Talebi değiştirdi", talep_silindi: "Talep sildi", talep_teyit: "Talebi teyit etti", rehber_yuklendi: "Rehber yükledi", belge_eklendi: "Belge ekledi", giris: "Giriş yaptı", giris_basarisiz: "Hatalı giriş denemesi",
  davet: "Davet gönderdi", uyelik_basvurusu: "Üyelik başvurusu", uyelik_onay: "Üyeliği onayladı", uyelik_kapat: "Üyeliği kapattı", uyelik_ac: "Üyeliği açtı", oturumlar_kapatildi: "Oturumları kapattı", moduller: "Bölümleri değiştirdi", devret: "Rehberi devretti",
  ayar: "Ayar değiştirdi", kur: "Kur girdi", komsuluk: "Komşuluk değiştirdi", yardim: "Yardım metnini değiştirdi", disa_aktarma: "Dışa aktardı", kalici_silme: "Kalıcı sildi", ekip_eslesme: "Ekip eşleşmesini işaretledi", gizlilik_onayi: "Gizlilik beyanını onayladı", claude_mesaji: "Claude'a mesaj yazdırdı", sifre_belirlendi: "Şifre belirledi",
  kontrol_baglandi: "Getireni / tanıştıranı rehbere bağladı", kontrol_yanitlandi: "“Bu kim?” sorusunu yanıtladı", kontrol_edildi: "Kontrol etti", kontrol_yanlis: "Varsayımı yanlış buldu", toplu_aktarim: "Toplu aktarım" };
const csvHucre = (v) => { let s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

async function hedefKullanici(q, req, id) {
  const u = uuidMi(id) ? await q.bir("select * from kullanicilar where id = $1", [id]) : null;
  if (!u) throw new KullaniciHatasi("Kullanıcı bulunamadı.", 404);
  if (u.id === req.kullanici.id) throw new KullaniciHatasi("Bu işlemi kendi hesabınıza uygulayamazsınız.");
  if (u.rol === "sahip" || (u.rol === "yonetici" && !sahipMi(req.kullanici))) throw new KullaniciHatasi("Bu hesap üzerinde işlem yapma yetkiniz yok.", 403);
  return u;
}

export default async function (app) {
  app.get("/yonetim", yonetici, async (req, reply) => {
    const s = await islem(req.kullanici, async (q) => ({
      bekleyen: (await q.bir("select count(*) as n from kullanicilar where durum = 'onay_bekliyor'")).n,
      ekip: (await q.bir("select count(*) as n from eslesmeler where gecerli and talep_sahip_id <> mulk_sahip_id and ekip_durum is null")).n,
    }));
    const bag = (yol, ad, aciklama, sayac = 0) => html`<li><div class="govde"><a class="ad" href="${yol}">${ad}</a><small>${aciklama}</small></div>${sayac ? html`<div class="yan"><span class="sayac">${sayac}</span></div>` : ""}</li>`;
    return reply.sayfa(sayfa(req, { baslik: "Yönetim", icerik: html`<h1>Yönetim</h1>
      <div class="kart"><ul class="liste">
        ${bag("/yonetim/ekip", "Ekip ve üyelikler", "Davet gönderme, üyelik onayı, hesap kapatma", s.bekleyen)}
        ${bag("/yonetim/ekip-eslesmeleri", "Ekip eşleşmeleri", "Bir danışmanın mülkü başka danışmanın alıcısına uyuyorsa", s.ekip)}
        ${bag("/yonetim/cift-kayitlar", "Çift kayıtlar", "Aynı kişi ya da aynı parsel birden fazla danışmandaysa")}
        ${bag("/yonetim/kur", "Dolar kuru", "Günlük TCMB kuru; alınamadıysa elle girme")}
        ${bag("/yonetim/komsuluk", "Mahalle komşulukları", "Haritada eksik kalan komşulukları elle ekleme")}
        ${bag("/yonetim/yardim", "Yardım metinleri", "💡 işaretlerinde açılan açıklamalar")}
        ${bag("/yonetim/kayit", "İşlem kaydı", "Kim, ne zaman, ne yaptı")}
      </ul></div>
      ${sahipMi(req.kullanici) ? html`<div class="kart"><h3>Yalnızca sistem sahibi</h3><ul class="liste">
        ${bag("/yonetim/ayarlar", "Puanlama ve sınırlar", "Ağırlıklar, bütçe payı, günlük mesaj sınırı")}
        ${bag("/yonetim/gizlilik", "Gizlilik beyanı", "Danışmanların ilk girişte onayladığı metin")}
        ${bag("/yonetim/cop", "Silinen kayıtlar", "Danışmanların sildiği kayıtlar; kalıcı silme")}
        ${bag("/yonetim/disa-aktar", "Dışa aktarma", "Kişi, mülk ve talep listelerini dosya olarak alma")}
      </ul></div>` : ""}` }));
  });

  // ---------- Ekip ----------
  app.get("/yonetim/ekip", yonetici, async (req, reply) => {
    const v = await islem(req.kullanici, (q) => q.sistem(async () => ({
      liste: await q(`select u.*, (select count(*) from kisiler k where k.sahip_id = u.id and k.silindi_at is null) as kisi,
          (select max(son_gorulme_at) from oturumlar o where o.kullanici_id = u.id) as son from kullanicilar u
          order by case u.durum when 'onay_bekliyor' then 0 when 'aktif' then 1 when 'eposta_bekliyor' then 2 else 3 end, u.ad`),
      davetler: await q("select d.eposta, d.bitis_at, u.ad as davet_eden from davetler d join kullanicilar u on u.id = d.davet_eden where d.kullanildi_at is null and d.bitis_at > now() order by d.olusturma_at desc"),
    })));
    const ben = req.kullanici, sahibim = sahipMi(ben);
    const aktifler = v.liste.filter((u) => u.durum === "aktif");
    const islemYapabilir = (u) => u.id !== ben.id && u.rol !== "sahip" && (u.rol === "danisman" || sahibim);
    return reply.sayfa(sayfa(req, { baslik: "Ekip", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Ekip ve üyelikler</h1>
      <div class="kart"><h2>Davet gönder</h2><p class="soluk">Üyelik yalnızca davetle açılır. Davet edilen kişi üye olduktan sonra sizin onayınızı bekler.</p>
        <form method="post" action="/yonetim/davet" class="form">${csrfAlani(req)}${alan({ ad: "eposta", etiket: "E-posta adresi", tip: "email", zorunlu: true })}<button class="dugme">Davet gönder</button></form>
        ${v.davetler.length ? html`<h3>Bekleyen davetler</h3><ul class="liste">${v.davetler.map((d) => html`<li><div class="govde"><span class="ad">${d.eposta}</span><small>${d.davet_eden} davet etti · ${tarihYaz(d.bitis_at)} tarihine kadar geçerli</small></div></li>`)}</ul>` : ""}</div>
      <div class="kart"><ul class="liste">${v.liste.map((u) => html`<li>
        <div class="govde">${danismanEtiketi({ id: u.id, ad: u.ad || u.eposta, foto: !!u.foto_yol })}<small class="blok">${u.eposta} · ${telefonYaz(u.telefon)} · ${ROL_ADI[u.rol]} · ${u.kisi} kişi${u.son ? " · son giriş " + neKadarOnce(u.son) : ""}</small>
          <div class="etiketler"><span class="etiket-k ${u.durum === "aktif" ? "iyi" : u.durum === "onay_bekliyor" ? "sari" : ""}">${DURUM_ADI[u.durum]}</span>${MODULLER.filter((m) => u.moduller?.[m.kod]).map((m) => html`<span class="etiket-k bilgi">${m.ad}</span>`)}</div>
          ${islemYapabilir(u) ? html`<div class="dugmeler">
            ${u.durum === "onay_bekliyor" ? html`<form method="post" action="/yonetim/kullanici/${u.id}/onay" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk">Üyeliği onayla</button></form>` : ""}
            ${u.durum === "aktif" ? html`<form method="post" action="/yonetim/kullanici/${u.id}/oturum-kapat" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk sade">Oturumlarını kapat</button></form>` : ""}
            ${u.durum !== "kapali" ? html`<form method="post" action="/yonetim/kullanici/${u.id}/kapat" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk tehlike" data-onay="${u.ad || u.eposta} hesabı kapatılsın mı? Giriş yapamaz; rehberi ofiste kalır.">Hesabı kapat</button></form>`
              : html`<form method="post" action="/yonetim/kullanici/${u.id}/ac" class="satir-form">${csrfAlani(req)}<button class="dugme kucuk ikincil">Hesabı yeniden aç</button></form>`}
          </div>` : ""}
          ${sahibim && u.rol !== "sahip" ? html`<form method="post" action="/yonetim/kullanici/${u.id}/moduller" class="satir-form">${csrfAlani(req)}${MODULLER.map((m) => html`<label class="secenek"><input type="checkbox" name="${m.kod}" value="1"${nitelik("checked", !!u.moduller?.[m.kod])}> ${m.ad}</label>`)} <button class="dugme kucuk ikincil">Bölümleri kaydet</button></form>` : ""}
          ${sahibim && u.durum === "kapali" && u.kisi > 0 ? html`<form method="post" action="/yonetim/kullanici/${u.id}/devret" class="satir-form">${csrfAlani(req)}<select name="hedef" required aria-label="Devralacak kişi"><option value="">Rehberi kime devredelim?</option>${aktifler.map((a) => html`<option value="${a.id}">${a.ad}</option>`)}</select> <button class="dugme kucuk" data-onay="Rehber, mülkler ve talepler seçilen kişiye devredilsin mi?">Rehberi devret</button></form>` : ""}
        </div></li>`)}</ul></div>` }));
  });
  app.post("/yonetim/davet", yonetici, async (req, reply) => {
    const eposta = metin(req.form.eposta, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta)) throw new KullaniciHatasi("E-posta adresi geçersiz.");
    const jeton = jetonUret();
    await islem(req.kullanici, (q) => q.sistem(async () => {
      if (await q.bir("select 1 from kullanicilar where eposta = $1", [eposta])) throw new KullaniciHatasi("Bu e-posta adresiyle zaten bir üyelik var.");
      await q("update davetler set bitis_at = now() where eposta = $1 and kullanildi_at is null", [eposta]);
      await q("insert into davetler (eposta, jeton_hash, davet_eden, bitis_at) values ($1, $2, $3, now() + interval '7 days')", [eposta, jetonHash(jeton), req.kullanici.id]);
      await kaydet(q, req, "davet", "eposta", eposta);
    }));
    const baglanti = `${ayar.adres}/davet/${jeton}`;
    const gonderim = await epostaGonder({ kime: eposta, ...sablonlar.davet(baglanti, req.kullanici.ad) }).catch(() => null);
    return reply.sayfa(sayfa(req, { baslik: "Davet", dar: true, geri: { yol: "/yonetim/ekip", ad: "Ekip" }, icerik: html`<div class="kart"><h1>Davet hazır</h1>
      <p>${gonderim && !gonderim.deneme ? html`<b>${eposta}</b> adresine davet e-postası gönderildi.` : html`E-posta gönderilemedi; aşağıdaki bağlantıyı <b>${eposta}</b> adresinin sahibine kendiniz iletin.`}</p>
      <p class="soluk">Bağlantı 7 gün geçerlidir ve bir kez kullanılır. İsterseniz WhatsApp'tan da iletebilirsiniz:</p>
      <textarea id="davet-baglantisi" rows="3" readonly>${baglanti}</textarea><div class="dugmeler"><button type="button" class="dugme ikincil" data-kopyala="#davet-baglantisi">Bağlantıyı kopyala</button></div></div>` }));
  });
  const kullaniciIslemi = (yol, kosul, fn, mesaj, rota = yonetici) => app.post(`/yonetim/kullanici/:id/${yol}`, rota, async (req, reply) => {
    const u = await islem(req.kullanici, (q) => q.sistem(async () => {
      const u = await hedefKullanici(q, req, req.params.id);
      if (!kosul(u)) throw new KullaniciHatasi("Bu işlem bu hesap için uygun değil.");
      await fn(q, u, req);
      return u;
    }));
    if (yol === "onay") await epostaGonder({ kime: u.eposta, ...sablonlar.onaylandi(ayar.adres + "/giris") }).catch(() => {});
    return reply.bildir(mesaj(u)).redirect("/yonetim/ekip");
  });
  kullaniciIslemi("onay", (u) => u.durum === "onay_bekliyor", async (q, u, req) => {
    await q("update kullanicilar set durum = 'aktif', onaylayan_id = $2, onay_at = now() where id = $1", [u.id, req.kullanici.id]);
    await kaydet(q, req, "uyelik_onay", "kullanici", u.id);
  }, (u) => `${u.ad} onaylandı; artık giriş yapabilir.`);
  kullaniciIslemi("kapat", (u) => u.durum !== "kapali", async (q, u, req) => {
    await q("update kullanicilar set durum = 'kapali', kapatma_at = now() where id = $1", [u.id]);
    await q("delete from oturumlar where kullanici_id = $1", [u.id]);
    await kaydet(q, req, "uyelik_kapat", "kullanici", u.id);
  }, (u) => `${u.ad || u.eposta} hesabı kapatıldı.`);
  kullaniciIslemi("ac", (u) => u.durum === "kapali", async (q, u, req) => {
    await q("update kullanicilar set durum = 'aktif', kapatma_at = null where id = $1", [u.id]);
    await kaydet(q, req, "uyelik_ac", "kullanici", u.id);
  }, (u) => `${u.ad || u.eposta} hesabı yeniden açıldı.`);
  kullaniciIslemi("oturum-kapat", (u) => u.durum === "aktif", async (q, u, req) => {
    await q("delete from oturumlar where kullanici_id = $1", [u.id]);
    await kaydet(q, req, "oturumlar_kapatildi", "kullanici", u.id, { kim: "yonetici" });
  }, (u) => `${u.ad} bütün cihazlardan çıkarıldı.`);
  kullaniciIslemi("moduller", () => true, async (q, u, req) => {
    const m = Object.fromEntries(MODULLER.map((x) => [x.kod, isaretli(req.form[x.kod])]));
    await q("update kullanicilar set moduller = $2 where id = $1", [u.id, JSON.stringify(m)]);
    await kaydet(q, req, "moduller", "kullanici", u.id, m);
  }, (u) => `${u.ad || u.eposta} için bölümler güncellendi.`, sahip);
  // Ayrılan danışmanın rehberini başka bir danışmana devret
  kullaniciIslemi("devret", (u) => u.durum === "kapali", async (q, u, req) => {
    const hedef = uuidMi(req.form.hedef) ? await q.bir("select id from kullanicilar where id = $1 and durum = 'aktif'", [req.form.hedef]) : null;
    if (!hedef) throw new KullaniciHatasi("Rehberi devralacak kişiyi seçin.");
    // Devralan kişide zaten kayıtlı numaralar: devredilen kayıtta numara pasifleşir (çift kayıt oluşmaz)
    await q("update kisi_telefonlari set aktif = false where sahip_id = $1 and aktif and numara in (select numara from kisi_telefonlari where sahip_id = $2 and aktif)", [u.id, hedef.id]);
    // Ayrılanın yanıtlamadığı "bu kim?" soruları devralanın kontrol listesini doldurmasın: adı o yazmadı, kim olduğunu bilemez.
    // "Kim olduğu bilinmiyor" diye ayrı listede durur; tanıyorsa oradan bağlar.
    await q("update kisiler set referans_durumu = 'bilinmiyor' where sahip_id = $1 and referans_kisi_id is null and referans_notu <> '' and referans_durumu is null", [u.id]);
    await q("update mulkler set kaynak_durumu = 'bilinmiyor' where sahip_id = $1 and kaynak_kisi_id is null and kaynak_notu <> '' and kaynak_durumu is null", [u.id]);
    await q("update kisiler set devralinan_sahip_id = coalesce(devralinan_sahip_id, sahip_id), sahip_id = $2 where sahip_id = $1", [u.id, hedef.id]);
    for (const t of ["kisi_telefonlari", "talepler", "mulkler", "gorusmeler", "hatirlatmalar", "mesajlar", "belgeler"]) await q(`update ${t} set sahip_id = $2 where sahip_id = $1`, [u.id, hedef.id]);
    await q("update eslesmeler set talep_sahip_id = $2 where talep_sahip_id = $1", [u.id, hedef.id]);
    await q("update eslesmeler set mulk_sahip_id = $2 where mulk_sahip_id = $1", [u.id, hedef.id]);
    await kaydet(q, req, "devret", "kullanici", u.id, { hedef: hedef.id });
  }, (u) => `${u.ad || u.eposta} rehberi devredildi.`, sahip);

  // ---------- Ekip eşleşmeleri ----------
  app.get("/yonetim/ekip-eslesmeleri", yonetici, async (req, reply) => {
    const konum = await konumYukle(), gorunum = secim(req.query.g, ["bekleyen", "paylasildi", "ilgisiz"], "bekleyen");
    const v = await islem(req.kullanici, async (q) => ({
      liste: await q(`select e.talep_id, e.mulk_id, e.puan, e.sinif, e.ayrinti, e.talep_sahip_id, e.mulk_sahip_id, e.ekip_durum, e.ekip_at,
          k.id as kisi_id, k.ad as kisi_ad, t.bolgeler, t.alt_turler, t.kategoriler, t.kriterler, t.butce_para, t.butce_min_tutar, t.butce_max_tutar,
          m.kategori, m.alt_tur, m.ilce_id, m.mahalle_id, m.fiyat_tutar, m.fiyat_para, m.islem, m.ozellikler
        from eslesmeler e join talepler t on t.id = e.talep_id join kisiler k on k.id = t.kisi_id join mulkler m on m.id = e.mulk_id
        where e.gecerli and e.talep_sahip_id <> e.mulk_sahip_id and ${gorunum === "bekleyen" ? "e.ekip_durum is null" : "e.ekip_durum = $1"}
        order by e.mulk_sahip_id, e.puan desc nulls last limit 300`, gorunum === "bekleyen" ? [] : [gorunum]),
      danismanlar: await danismanlarAl(q, req),
    }));
    const gruplar = new Map();
    for (const e of v.liste) { const a = e.mulk_sahip_id + "|" + e.talep_sahip_id; if (!gruplar.has(a)) gruplar.set(a, []); gruplar.get(a).push(e); }
    return reply.sayfa(sayfa(req, { baslik: "Ekip eşleşmeleri", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Ekip eşleşmeleri ${ampul("ekip_eslesmeleri")}</h1>
      <div class="sekmeler">${[["bekleyen", "Bekleyenler"], ["paylasildi", "Paylaştıklarım"], ["ilgisiz", "İlgisiz"]].map(([k, a]) => html`<a href="?g=${k}"${nitelik('class="etkin"', gorunum === k)}>${a}</a>`)}</div>
      ${gruplar.size ? [...gruplar.values()].map((g) => html`<div class="kart"><div class="grup-baslik">${danismanEtiketi(v.danismanlar.get(g[0].mulk_sahip_id))} <span class="soluk">mülkü</span> ↔ ${danismanEtiketi(v.danismanlar.get(g[0].talep_sahip_id))} <span class="soluk">alıcısı</span></div>
        <ul class="liste">${g.map((e) => html`<li>${puanRozeti({ puan: e.puan, sinif: e.sinif, puansiz: e.ayrinti?.puansiz })}
          <div class="govde"><a class="ad" href="/mulkler/${e.mulk_id}">${mulkTarifi(e, konum)} · ${fiyatYaz(e)}</a>
            <small>Alıcı: <a href="/kisiler/${e.kisi_id}">${e.kisi_ad}</a> · ${talepTarifi(e, konum)}</small>
            <div class="neden">${(e.ayrinti?.nedenler || []).join(" · ")}</div><div class="etiketler">${eslesmeNotlari(e.ayrinti || {})}</div></div>
          <div class="yan"><form method="post" action="/yonetim/ekip-eslesmeleri/isaret" class="satir-form">${csrfAlani(req)}<input type="hidden" name="talep" value="${e.talep_id}"><input type="hidden" name="mulk" value="${e.mulk_id}">
            ${gorunum !== "paylasildi" ? html`<button class="dugme kucuk" name="durum" value="paylasildi">Paylaştım</button>` : ""}${gorunum !== "ilgisiz" ? html`<button class="dugme kucuk sade" name="durum" value="ilgisiz">İlgisiz</button>` : ""}</form></div></li>`)}</ul></div>`)
        : html`<div class="kart">${bos(gorunum === "bekleyen" ? "Bekleyen ekip eşleşmesi yok." : "Bu görünümde kayıt yok.")}</div>`}
      <p class="soluk">Danışmanlar bu ekranı ve birbirlerinin kayıtlarını görmez. İki danışmanı siz bir araya getirirsiniz.</p>` }));
  });
  app.post("/yonetim/ekip-eslesmeleri/isaret", yonetici, async (req, reply) => {
    const f = req.form, durum = secim(f.durum, ["paylasildi", "ilgisiz"]);
    if (!durum || !uuidMi(f.talep) || !uuidMi(f.mulk)) throw new KullaniciHatasi("Eşleşme bulunamadı.", 404);
    await islem(req.kullanici, (q) => q.sistem(async () => {
      await q("update eslesmeler set ekip_durum = $3, ekip_isaretleyen = $4, ekip_at = now() where talep_id = $1 and mulk_id = $2 and talep_sahip_id <> mulk_sahip_id", [f.talep, f.mulk, durum, req.kullanici.id]);
      await kaydet(q, req, "ekip_eslesme", "mulk", f.mulk, { durum });
    }));
    return reply.bildir(durum === "paylasildi" ? "Paylaşıldı olarak işaretlendi." : "İlgisiz olarak işaretlendi.").redirect("/yonetim/ekip-eslesmeleri");
  });

  // ---------- Çift kayıtlar ----------
  app.get("/yonetim/cift-kayitlar", yonetici, async (req, reply) => {
    const konum = await konumYukle();
    const v = await islem(req.kullanici, async (q) => ({
      kisiler: await q(`select t.numara, json_agg(json_build_object('id', k.id, 'ad', k.ad, 'sahip_id', k.sahip_id) order by k.olusturma_at) as kayitlar
        from kisi_telefonlari t join kisiler k on k.id = t.kisi_id where t.aktif and k.silindi_at is null group by t.numara having count(distinct k.sahip_id) > 1 order by t.numara limit 300`),
      mulkler: await q(`select m.ilce_id, m.ada, m.parsel, json_agg(json_build_object('id', m.id, 'sahip_id', m.sahip_id, 'kategori', m.kategori, 'alt_tur', m.alt_tur, 'ilce_id', m.ilce_id, 'mahalle_id', m.mahalle_id, 'ozellikler', m.ozellikler) order by m.olusturma_at) as kayitlar
        from mulkler m where m.silindi_at is null and m.ada <> '' and m.parsel <> '' and m.ilce_id is not null group by m.ilce_id, m.mahalle_id, m.ada, m.parsel having count(*) > 1 limit 300`),
      danismanlar: await danismanlarAl(q, req),
    }));
    return reply.sayfa(sayfa(req, { baslik: "Çift kayıtlar", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Çift kayıtlar ${ampul("cift_kayit")}</h1>
      <div class="kart"><h2>Aynı kişi birden fazla danışmanda (${v.kisiler.length})</h2>${v.kisiler.length ? html`<ul class="liste">${v.kisiler.map((c) => html`<li><div class="govde"><span class="ad">${telefonYaz(c.numara)}</span>
        ${c.kayitlar.map((k) => html`<div><a href="/kisiler/${k.id}">${k.ad}</a> — ${danismanEtiketi(v.danismanlar.get(k.sahip_id))}</div>`)}</div></li>`)}</ul>` : html`<p class="soluk">Çift kayıtlı kişi yok.</p>`}
        <p class="soluk">Danışmanlara bildirim gitmez. Kimin ilgileneceğine siz karar verirsiniz.</p></div>
      <div class="kart"><h2>Aynı ada / parsel birden fazla kayıtta (${v.mulkler.length})</h2>${v.mulkler.length ? html`<ul class="liste">${v.mulkler.map((c) => html`<li><div class="govde"><span class="ad">${konum.ilceAdi(c.ilce_id)} · ada ${c.ada} / parsel ${c.parsel}</span>
        ${c.kayitlar.map((m) => html`<div><a href="/mulkler/${m.id}">${mulkTarifi(m, konum)}</a> — ${danismanEtiketi(v.danismanlar.get(m.sahip_id))}</div>`)}</div></li>`)}</ul>` : html`<p class="soluk">Çift kayıtlı parsel yok.</p>`}</div>` }));
  });

  // ---------- Kur ----------
  app.get("/yonetim/kur", yonetici, async (req, reply) => {
    const v = await islem(req.kullanici, async (q) => ({ kur: await kurAl(q), gecmis: await q("select * from kurlar order by tarih desc limit 14") }));
    return reply.sayfa(sayfa(req, { baslik: "Dolar kuru", dar: true, geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Dolar kuru</h1>
      <div class="kart">${v.kur ? html`<div class="kur-satiri"><b>1 $ = ${sayiYaz(v.kur.usd_try, 4)} TL</b><small>${v.kur.kaynak} · ${tarihYaz(v.kur.tarih)}</small></div>` : html`<p class="uyari-kutu">Henüz kur yok. Kur olmadan TL bütçeler dolara sabitlenemez.</p>`}
        <p class="soluk">Kur her gün TCMB'den kendiliğinden alınır. Alınamadığı gün buradan elle girebilirsiniz.</p>
        <form method="post" action="/yonetim/kur" class="form">${csrfAlani(req)}${alan({ ad: "usd_try", etiket: "Bugünün dolar satış kuru (TL)", zorunlu: true, ek: 'inputmode="decimal"', yer: "örn. 42,15" })}<button class="dugme">Kuru kaydet</button></form></div>
      <div class="kart"><h3>Son günler</h3><ul class="liste">${v.gecmis.map((k) => html`<li><div class="govde"><span class="ad">${sayiYaz(k.usd_try, 4)} TL</span><small>${tarihYaz(k.tarih)} · ${k.kaynak}</small></div></li>`)}</ul></div>` }));
  });
  app.post("/yonetim/kur", yonetici, async (req, reply) => {
    const kur = sayi(String(req.form.usd_try || "").replace(/\.(?=\d{1,4}$)/, ","));
    if (!(kur > 1 && kur < 10000)) throw new KullaniciHatasi("Kur geçersiz görünüyor. Örnek: 42,15");
    const n = await islem(req.kullanici, async (q) => {
      await kurKaydet(q, bugun(), kur, `Elle girildi (${req.kullanici.ad})`);
      await kaydet(q, req, "kur", null, null, { kur });
      return hepsiniHesapla(q);
    });
    return reply.bildir(`Kur kaydedildi; eşleşmeler yeniden hesaplandı (${n}).`).redirect("/yonetim/kur");
  });

  // ---------- Mahalle komşulukları ----------
  app.get("/yonetim/komsuluk", yonetici, async (req, reply) => {
    const konum = await konumYukle();
    const elle = await islem(req.kullanici, (q) => q("select a, b from mahalle_komsu where kaynak = 'elle' order by a, b"));
    const sec = (liste, bosAd) => html`<option value="">${bosAd}</option>${liste.map((x) => html`<option value="${x.id}"${nitelik("selected", x.id === VARSAYILAN_IL)}>${x.ad}</option>`)}`;
    const secici = (on, etiket) => html`<fieldset class="konum-secici"><legend>${etiket}</legend><div class="izgara uc"><select class="il" aria-label="İl">${sec(konum.iller, "İl seçin")}</select>
      <select class="ilce" aria-label="İlçe">${sec(konum.ilcelerIl.get(VARSAYILAN_IL) || [], "İlçe seçin")}</select><select class="mahalle" name="${on}" aria-label="Mahalle" required><option value="">Mahalle seçin</option></select></div></fieldset>`;
    const tam = (id) => { const m = konum.mahM.get(id); return m ? `${konum.ilceAdi(m.ilce_id)} ${m.ad}` : "?"; };
    return reply.sayfa(sayfa(req, { baslik: "Komşuluklar", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Mahalle komşulukları</h1>
      <div class="kart"><p>Komşu mahalleler açık harita verisinden (OpenStreetMap) hesaplanır. Bazı ilçelerde mahalle sınırı haritada yoktur; orada “komşu mahalle” puanı çalışmaz. Bildiğiniz komşulukları buradan ekleyebilirsiniz.</p>
        <form method="post" action="/yonetim/komsuluk" class="form">${csrfAlani(req)}${secici("a", "Birinci mahalle")}${secici("b", "Komşusu olan mahalle")}<button class="dugme">Komşu olarak ekle</button></form></div>
      <div class="kart"><h3>Elle eklenenler (${elle.length})</h3>${elle.length ? html`<ul class="liste">${elle.map((k) => html`<li><div class="govde"><span class="ad">${tam(k.a)} ↔ ${tam(k.b)}</span></div>
        <div class="yan"><form method="post" action="/yonetim/komsuluk/sil" class="satir-form">${csrfAlani(req)}<input type="hidden" name="a" value="${k.a}"><input type="hidden" name="b" value="${k.b}"><button class="dugme kucuk sade">Kaldır</button></form></div></li>`)}</ul>` : html`<p class="soluk">Elle eklenmiş komşuluk yok.</p>`}</div>` }));
  });
  const komsulukIsle = (yol, sql, mesaj) => app.post(yol, yonetici, async (req, reply) => {
    const konum = await konumYukle();
    let a = Number(req.form.a), b = Number(req.form.b);
    if (!konum.mahM.has(a) || !konum.mahM.has(b) || a === b) throw new KullaniciHatasi("İki ayrı mahalle seçin.");
    if (a > b) [a, b] = [b, a];
    await islem(req.kullanici, (q) => q.sistem(async () => { await q(sql, [a, b]); await kaydet(q, req, "komsuluk", "mahalle", a, { b, islem: yol.endsWith("sil") ? "sil" : "ekle" }); }));
    await konumYukle(true);
    await islem(req.kullanici, (q) => hepsiniHesapla(q));
    return reply.bildir(mesaj).redirect("/yonetim/komsuluk");
  });
  komsulukIsle("/yonetim/komsuluk", "insert into mahalle_komsu (a, b, kaynak) values ($1, $2, 'elle') on conflict do nothing", "Komşuluk eklendi; eşleşmeler yeniden hesaplandı.");
  komsulukIsle("/yonetim/komsuluk/sil", "delete from mahalle_komsu where a = $1 and b = $2 and kaynak = 'elle'", "Komşuluk kaldırıldı.");

  // ---------- Yardım metinleri ----------
  app.get("/yonetim/yardim", yonetici, async (req, reply) => {
    const liste = await islem(req.kullanici, (q) => q("select * from yardim_metinleri order by baslik"));
    return reply.sayfa(sayfa(req, { baslik: "Yardım metinleri", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Yardım metinleri</h1><p class="soluk">💡 işaretine dokununca açılan açıklamalar.</p>
      ${liste.map((y) => html`<form method="post" action="/yonetim/yardim" class="form kart">${csrfAlani(req)}<input type="hidden" name="anahtar" value="${y.anahtar}">
        ${alan({ ad: "baslik", etiket: "Başlık", deger: y.baslik, zorunlu: true, ek: 'maxlength="120"' })}${alan({ ad: "metin", etiket: "Açıklama", tip: "textarea", deger: y.metin, zorunlu: true, ek: 'maxlength="3000"' })}<button class="dugme ikincil kucuk">Kaydet</button></form>`)}` }));
  });
  app.post("/yonetim/yardim", yonetici, async (req, reply) => {
    const f = req.form, baslik = metin(f.baslik, 120), yazi = metin(f.metin, 3000);
    if (!baslik || !yazi) throw new KullaniciHatasi("Başlık ve açıklama boş olamaz.");
    await islem(req.kullanici, (q) => q.sistem(async () => {
      const r = await q("update yardim_metinleri set baslik = $2, metin = $3, guncelleme_at = now(), guncelleyen = $4 where anahtar = $1 returning anahtar", [metin(f.anahtar, 60), baslik, yazi, req.kullanici.id]);
      if (!r.length) throw new KullaniciHatasi("Yardım metni bulunamadı.", 404);
      await kaydet(q, req, "yardim", "yardim", r[0].anahtar);
    }));
    return reply.bildir("Yardım metni kaydedildi.").redirect("/yonetim/yardim");
  });

  // ---------- İşlem kaydı ----------
  app.get("/yonetim/kayit", yonetici, async (req, reply) => {
    const kim = uuidMi(req.query.kim) ? req.query.kim : null;
    const v = await islem(req.kullanici, async (q) => ({
      liste: await q(`select i.*, u.ad as kullanici_ad from islem_kaydi i left join kullanicilar u on u.id = i.kullanici_id where ($1::uuid is null or i.kullanici_id = $1) order by i.at desc limit 300`, [kim]),
      danismanlar: await danismanlarAl(q, req),
    }));
    const baglanti = (i) => (i.hedef_tur === "kisi" ? `/kisiler/${i.hedef_id}` : i.hedef_tur === "mulk" ? `/mulkler/${i.hedef_id}` : i.hedef_tur === "talep" ? `/talepler/${i.hedef_id}` : null);
    return reply.sayfa(sayfa(req, { baslik: "İşlem kaydı", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>İşlem kaydı</h1>
      <form class="arama" method="get"><select name="kim" aria-label="Kişi"><option value="">Herkes</option>${[...v.danismanlar.values()].map((d) => html`<option value="${d.id}"${nitelik("selected", kim === d.id)}>${d.ad}</option>`)}</select><button class="dugme ikincil">Göster</button></form>
      <div class="kart tablo-kap"><table class="tablo"><thead><tr><th>Zaman</th><th>Kim</th><th>Ne yaptı</th></tr></thead><tbody>${v.liste.map((i) => html`<tr><td>${tarihSaatYaz(i.at)}</td><td>${i.kullanici_ad || "—"}</td>
        <td>${baglanti(i) ? html`<a href="${baglanti(i)}">${EYLEM_ADI[i.eylem] || i.eylem}</a>` : EYLEM_ADI[i.eylem] || i.eylem}</td></tr>`)}</tbody></table></div>
      <p class="soluk">Son 300 işlem gösterilir.</p>` }));
  });

  // ---------- Puanlama ve sınırlar (sistem sahibi) ----------
  const SAYILAR = [["butce_payi", "Bütçeyi en çok yüzde kaç aşan mülk gösterilsin?", 0, 50], ["sinir_a", "A sınıfı alt sınırı", 1, 100], ["sinir_b", "B sınıfı alt sınırı", 1, 100], ["sinir_c", "Listeye girme alt sınırı (C)", 0, 100],
    ["gunluk_mesaj_siniri", "Bir danışman günde en çok kaç kişiye mesaj gönderebilir?", 1, 500], ["talep_teyit_ay", "Kaç ay dokunulmayan talep için “hâlâ arıyor mu?” sorulsun?", 1, 36], ["aranmayan_gun", "A potansiyelli kişi kaç gün aranmazsa hatırlatılsın?", 7, 720]];
  const AGIRLIK = [["konum", "Konum"], ["ozellik", "Özellikler"], ["alt_tur", "Alt tür"]];
  const BASAMAK = [["tam", "İstenen mahalle / ilçe"], ["komsu_mahalle", "Komşu mahalle"], ["ayni_ilce", "Aynı ilçe, başka mahalle"], ["komsu_ilce", "Komşu ilçe"]];
  app.get("/yonetim/ayarlar", sahip, async (req, reply) => {
    const a = await ayarlarAl(true);
    const say = (ad, etiket, deger) => alan({ ad, etiket, deger, zorunlu: true, ek: 'inputmode="numeric"' });
    return reply.sayfa(sayfa(req, { baslik: "Puanlama ve sınırlar", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Puanlama ve sınırlar ${ampul("puan")}</h1>
      <form method="post" action="/yonetim/ayarlar" class="form kart">${csrfAlani(req)}
        ${[["oturum", "Oturum alıcısı"], ["ticari", "Ticari kullanıcı"]].map(([tip, ad]) => html`<fieldset><legend>${ad}: puanın dağılımı (toplam 100)</legend><div class="izgara uc">${AGIRLIK.map(([k, e]) => say(`ag_${tip}_${k}`, e, a.agirliklar[tip][k]))}</div></fieldset>`)}
        <fieldset><legend>Konum basamakları (konum puanı 45 üzerinden)</legend><div class="izgara iki">${BASAMAK.map(([k, e]) => say(`kb_${k}`, e, a.konum_basamak[k]))}</div></fieldset>
        <fieldset><legend>Sınırlar</legend>${SAYILAR.map(([k, e]) => say(k, e, a[k]))}</fieldset>
        <button class="dugme">Kaydet ve eşleşmeleri yeniden hesapla</button>
      </form>
      <form method="post" action="/yonetim/ayarlar/varsayilan">${csrfAlani(req)}<button class="dugme sade kucuk" data-onay="Bütün puanlama ayarları onaylanan başlangıç değerlerine dönsün mü?">Başlangıç değerlerine dön</button></form>` }));
  });
  app.post("/yonetim/ayarlar", sahip, async (req, reply) => {
    const f = req.form;
    const tam = (ad, min, max) => { const n = sayi(f[ad]); if (n == null || !Number.isInteger(n) || n < min || n > max) throw new KullaniciHatasi(`Geçersiz değer: ${ad} (${min}–${max} arası tam sayı olmalı).`); return n; };
    const agirliklar = {};
    for (const tip of ["oturum", "ticari"]) {
      agirliklar[tip] = Object.fromEntries(AGIRLIK.map(([k]) => [k, tam(`ag_${tip}_${k}`, 0, 100)]));
      if (AGIRLIK.reduce((t, [k]) => t + agirliklar[tip][k], 0) !== 100) throw new KullaniciHatasi("Puan dağılımının toplamı 100 olmalı.");
    }
    const kb = Object.fromEntries(BASAMAK.map(([k]) => [k, tam(`kb_${k}`, 0, 45)]));
    if (!(kb.tam >= kb.komsu_mahalle && kb.komsu_mahalle >= kb.ayni_ilce && kb.ayni_ilce >= kb.komsu_ilce)) throw new KullaniciHatasi("Konum basamakları yakından uzağa doğru azalmalı.");
    const sayilar = Object.fromEntries(SAYILAR.map(([k, , min, max]) => [k, tam(k, min, max)]));
    if (!(sayilar.sinir_a > sayilar.sinir_b && sayilar.sinir_b > sayilar.sinir_c)) throw new KullaniciHatasi("Sınırlar A > B > C sırasında olmalı.");
    const n = await islem(req.kullanici, async (q) => {
      await ayarYaz(q, "agirliklar", agirliklar, req.kullanici.id);
      await ayarYaz(q, "konum_basamak", kb, req.kullanici.id);
      for (const [k, v] of Object.entries(sayilar)) await ayarYaz(q, k, v, req.kullanici.id);
      await kaydet(q, req, "ayar", null, null, { agirliklar, kb, ...sayilar });
      return 0;
    });
    await ayarlarAl(true);
    const adet = await islem(req.kullanici, (q) => hepsiniHesapla(q));
    return reply.bildir(`Ayarlar kaydedildi; ${adet + n} eşleşme yeniden hesaplandı.`).redirect("/yonetim/ayarlar");
  });
  app.post("/yonetim/ayarlar/varsayilan", sahip, async (req, reply) => {
    await islem(req.kullanici, (q) => q.sistem(async () => { await q("delete from ayarlar where anahtar = any($1)", [Object.keys(VARSAYILAN_AYAR)]); await kaydet(q, req, "ayar", null, null, { varsayilan: true }); }));
    await ayarlarAl(true);
    await islem(req.kullanici, (q) => hepsiniHesapla(q));
    return reply.bildir("Başlangıç değerlerine dönüldü.").redirect("/yonetim/ayarlar");
  });

  // ---------- Gizlilik beyanı ----------
  app.get("/yonetim/gizlilik", sahip, async (req, reply) => reply.sayfa(sayfa(req, { baslik: "Gizlilik beyanı", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Gizlilik beyanı</h1>
    <form method="post" action="/yonetim/gizlilik" class="form kart">${csrfAlani(req)}<p class="soluk">Danışmanlar ilk girişte bu metni “Okudum, anladım” diyerek onaylar. Metni değiştirmeden önce avukatınıza gösterin.</p>
      ${alan({ ad: "metin", etiket: "Beyan metni", tip: "textarea", deger: (await ayarlarAl()).gizlilik_metni || VARSAYILAN_GIZLILIK, zorunlu: true, ek: 'rows="14" maxlength="8000"' })}<button class="dugme">Kaydet</button></form>` })));
  app.post("/yonetim/gizlilik", sahip, async (req, reply) => {
    const yazi = metin(req.form.metin, 8000);
    if (yazi.length < 50) throw new KullaniciHatasi("Beyan metni çok kısa.");
    await islem(req.kullanici, async (q) => { await ayarYaz(q, "gizlilik_metni", yazi, req.kullanici.id); await kaydet(q, req, "ayar", null, null, { gizlilik_metni: true }); });
    return reply.bildir("Gizlilik beyanı kaydedildi.").redirect("/yonetim/gizlilik");
  });

  // ---------- Silinen kayıtlar ve kalıcı silme (sistem sahibi) ----------
  app.get("/yonetim/cop", sahip, async (req, reply) => {
    const konum = await konumYukle();
    const v = await islem(req.kullanici, async (q) => ({
      kisiler: await q(`select k.id, k.ad, k.silindi_at, k.sahip_id, s.ad as silen from kisiler k left join kullanicilar s on s.id = k.silen_id where k.silindi_at is not null order by k.silindi_at desc limit 300`),
      mulkler: await q(`select m.*, s.ad as silen from mulkler m left join kullanicilar s on s.id = m.silen_id left join kisiler k on k.id = m.malik_kisi_id where m.silindi_at is not null and (k.id is null or k.silindi_at is null) order by m.silindi_at desc limit 200`),
      silmeler: await q("select k.*, u.ad as yapan from kalici_silme_kaydi k join kullanicilar u on u.id = k.yapan_id order by k.at desc limit 50").catch(() => []),
      danismanlar: await danismanlarAl(q, req),
    }));
    return reply.sayfa(sayfa(req, { baslik: "Silinen kayıtlar", geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Silinen kayıtlar</h1>
      <p class="soluk">Danışmanların sildiği kayıtlar notlarıyla birlikte yalnızca burada durur. Bir kişi “beni silin” derse kaydını buradan ya da kişi kartından kalıcı olarak silebilirsiniz.</p>
      <div class="kart"><h2>Kişiler (${v.kisiler.length})</h2>${v.kisiler.length ? html`<ul class="liste">${v.kisiler.map((k) => html`<li><div class="govde"><a class="ad" href="/kisiler/${k.id}">${k.ad}</a><small>${tarihYaz(k.silindi_at)} · silen: ${k.silen || "—"} · rehber: ${v.danismanlar.get(k.sahip_id)?.ad || "—"}</small></div>
        <div class="yan"><form method="post" action="/yonetim/kalici-sil" class="satir-form">${csrfAlani(req)}<input type="hidden" name="kisi" value="${k.id}"><input type="hidden" name="neden" value="Silinen kayıtlardan kalıcı silme"><button class="dugme kucuk tehlike" data-onay="${k.ad} ve bütün verisi kalıcı olarak silinsin mi? Bu işlem geri alınamaz.">Kalıcı sil</button></form></div></li>`)}</ul>` : html`<p class="soluk">Silinmiş kişi yok.</p>`}</div>
      <div class="kart"><h2>Mülkler (${v.mulkler.length})</h2>${v.mulkler.length ? html`<ul class="liste">${v.mulkler.map((m) => html`<li><div class="govde"><a class="ad" href="/mulkler/${m.id}">${mulkTarifi(m, konum)}</a><small>${tarihYaz(m.silindi_at)} · silen: ${m.silen || "—"}</small></div></li>`)}</ul>` : html`<p class="soluk">Silinmiş mülk yok.</p>`}</div>
      <div class="kart"><h2>“Beni silin” talebi</h2><p class="soluk">Telefon numarasını yazın; bu numaranın geçtiği bütün kayıtlar (hangi danışmanda olursa olsun) kalıcı olarak silinir. Geriye yalnızca silme işleminin yapıldığını gösteren, kişi bilgisi içermeyen bir kayıt kalır.</p>
        <form method="post" action="/yonetim/kalici-sil" class="form">${csrfAlani(req)}${alan({ ad: "telefon", etiket: "Telefon numarası", tip: "tel", zorunlu: true })}${alan({ ad: "neden", etiket: "Neden", deger: "Kişinin kendi talebi (KVKK)", zorunlu: true, ek: 'maxlength="200"' })}
          <button class="dugme tehlike" data-onay="Bu numaranın geçtiği bütün kayıtlar kalıcı olarak silinsin mi? Geri alınamaz.">Kalıcı olarak sil</button></form>
        ${v.silmeler.length ? html`<h3>Yapılan kalıcı silmeler</h3><ul class="liste">${v.silmeler.map((s) => html`<li><div class="govde"><span class="ad">${tarihSaatYaz(s.at)}</span><small>${s.yapan} · ${s.neden}</small></div></li>`)}</ul>` : ""}</div>` }));
  });
  app.post("/yonetim/kalici-sil", sahip, async (req, reply) => {
    const f = req.form, neden = metin(f.neden, 200) || "Belirtilmedi";
    const { telefonNorm } = await import("../lib/metin.js");
    const sonuc = await islem(req.kullanici, async (q) => {
      let idler = [];
      if (uuidMi(f.kisi)) idler = [f.kisi];
      else {
        const tel = telefonNorm(f.telefon);
        if (!tel) throw new KullaniciHatasi("Telefon numarası geçersiz.");
        idler = (await q.sistem(() => q("select distinct kisi_id from kisi_telefonlari where numara = $1", [tel]))).map((r) => r.kisi_id);
        if (!idler.length) throw new KullaniciHatasi("Bu numarayla kayıtlı kimse yok.", 404);
      }
      const dosyalar = [];
      for (const id of idler) dosyalar.push(...await kisiKaliciSil(q, req, id, neden));
      await kaydet(q, req, "kalici_silme", null, null, { adet: idler.length });
      return { dosyalar, adet: idler.length };
    });
    await dosyalariSil(sonuc.dosyalar);
    return reply.bildir(`${sonuc.adet} kayıt kalıcı olarak silindi.`).redirect("/yonetim/cop");
  });

  // ---------- Dışa aktarma (sistem sahibi) ----------
  const AKTARIM = {
    kisiler: { ad: "Kişiler", sql: `select k.ad, (select string_agg(t.numara, ' | ') from kisi_telefonlari t where t.kisi_id = k.id and t.aktif) as telefonlar, u.ad as danisman, k.potansiyel, k.meslek, k.sirket, k.alim_gucu_tutar, k.alim_gucu_para, k.yatirimci_tipi, k.mesaj_istemiyor, k.son_temas_at, k.olusturma_at, k.silindi_at, r.ad as tanistiran, k.referans_notu, k.referans_durumu, k.kontrol_notu, k.notlar
        from kisiler k join kullanicilar u on u.id = k.sahip_id left join kisiler r on r.id = k.referans_kisi_id order by u.ad, k.ad` },
    mulkler: { ad: "Mülkler", sql: `select m.islem, m.kategori, m.alt_tur, m.baslik, i.ad as ilce, h.ad as mahalle, m.ada, m.parsel, m.fiyat_tutar, m.fiyat_para, m.durum, k.ad as malik, u.ad as danisman, m.ozellikler, m.olusturma_at, m.silindi_at, g.ad as getiren, m.kaynak_notu, m.kaynak_durumu, m.kontrol_notu, m.notlar
        from mulkler m join kullanicilar u on u.id = m.sahip_id left join kisiler k on k.id = m.malik_kisi_id left join kisiler g on g.id = m.kaynak_kisi_id left join ilceler i on i.id = m.ilce_id left join mahalleler h on h.id = m.mahalle_id order by u.ad, m.olusturma_at` },
    talepler: { ad: "Talepler", sql: `select k.ad as kisi, u.ad as danisman, t.islem, t.alici_tipi, t.kategoriler, t.alt_turler, t.butce_min_tutar, t.butce_max_tutar, t.butce_para, t.butce_tarih, t.durum, t.kriterler, t.olusturma_at, t.silindi_at, t.notlar
        from talepler t join kullanicilar u on u.id = t.sahip_id join kisiler k on k.id = t.kisi_id order by u.ad, k.ad` },
  };
  app.get("/yonetim/disa-aktar", sahip, async (req, reply) => reply.sayfa(sayfa(req, { baslik: "Dışa aktarma", dar: true, geri: { yol: "/yonetim", ad: "Yönetim" }, icerik: html`<h1>Dışa aktarma</h1>
    <div class="kart"><p>Listeler Excel'de açılabilen dosya (CSV) olarak iner. Her dışa aktarma işlem kaydına yazılır.</p>
      ${Object.entries(AKTARIM).map(([k, a]) => html`<form method="post" action="/yonetim/disa-aktar/${k}">${csrfAlani(req)}<p><button class="dugme ikincil genis">${a.ad} listesini indir</button></p></form>`)}</div>` })));
  app.post("/yonetim/disa-aktar/:tur", sahip, async (req, reply) => {
    const a = AKTARIM[req.params.tur];
    if (!a) throw new KullaniciHatasi("Bulunamadı.", 404);
    const satirlar = await islem(req.kullanici, async (q) => { await kaydet(q, req, "disa_aktarma", req.params.tur); return q(a.sql); });
    const basliklar = satirlar.length ? Object.keys(satirlar[0]) : ["kayit_yok"];
    const csv = "﻿" + [basliklar.join(";"), ...satirlar.map((s) => basliklar.map((b) => csvHucre(s[b] instanceof Date ? s[b].toISOString() : s[b])).join(";"))].join("\r\n");
    return reply.header("content-disposition", `attachment; filename="satal-${req.params.tur}-${bugun()}.csv"`).type("text/csv; charset=utf-8").send(csv);
  });
}
