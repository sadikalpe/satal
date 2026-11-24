// Giriş, davetle üyelik, şifre belirleme, Google ile giriş, gizlilik beyanı.
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ayar } from "../ayar.js";
import { sistem, islem } from "../db.js";
import { html, satirli } from "../lib/html.js";
import { sayfa, alan, csrfAlani } from "../gorunum/duzen.js";
import { CEREZ, sifreHash, sifreDogru, sifreUygunMu, jetonUret, jetonHash, oturumAc, hizSiniri } from "../kimlik.js";
import { epostaGonder, sablonlar } from "../eposta.js";
import { KullaniciHatasi, kaydet, ayarlarAl } from "../servis/ortak.js";
import { dosyaTuru, dosyaKaydet } from "../servis/dosya.js";
import { telefonNorm } from "../lib/metin.js";

export const VARSAYILAN_GIZLILIK = `Rehberiniz, talepleriniz ve mülkleriniz diğer danışmanlarla paylaşılmaz. Bunları yalnızca siz ve ofis yöneticileri görebilir.

Başka bir danışmanın rehberini, taleplerini ve mülklerini siz de göremezsiniz.

Satal'a girdiğiniz kişiler STA Gayrimenkul'ün müşteri kaydının parçasıdır. Ofisten ayrılırsanız rehberiniz ofiste kalır; rehberin toplu kopyası alınamaz.

Sistemde yapılan işlemler (kayıt açma, değiştirme, silme, mesaj hazırlama) güvenlik için kaydedilir.

Teknik bakım ve yedekleme için sistemi işleten kişilerin veriye erişimi olabilir.`;

const epostaGecerli = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 200;
const guvenliSonra = (s) => (typeof s === "string" && /^\/[^/\\]/.test(s) ? s : "/");

// Google'a gidip dönene kadar saklanan kısa ömürlü bilgi (durum → { nonce, dogrulayici, davet, uyelik, sonra })
const bekleyenler = new Map();
function bekleyenEkle(veri) {
  const durum = jetonUret();
  bekleyenler.set(durum, { ...veri, bitis: Date.now() + 10 * 60 * 1000 });
  for (const [k, v] of bekleyenler) if (v.bitis < Date.now()) bekleyenler.delete(k);
  return durum;
}
let anahtarlar = null;
const googleAnahtarlari = () => (anahtarlar ||= createRemoteJWKSet(new URL(ayar.google.anahtarAdresi)));
export const googleAnahtarlariniSifirla = () => { anahtarlar = null; };

async function yoneticilereBildir(ad, eposta) {
  const yoneticiler = await sistem((q) => q("select eposta from kullanicilar where rol in ('sahip', 'yonetici') and durum = 'aktif'"));
  const m = sablonlar.onayBekliyor(ad, eposta, ayar.adres + "/yonetim/ekip");
  for (const y of yoneticiler) await epostaGonder({ kime: y.eposta, ...m }).catch(() => {});
}
async function davetBul(q, jeton) {
  return q.bir("select * from davetler where jeton_hash = $1 and kullanildi_at is null and bitis_at > now()", [jetonHash(jeton || "")]);
}
async function fotoKaydet(dosya) {
  if (!dosya?.veri?.length) return null;
  if (dosya.veri.length > 2 * 1024 * 1024) throw new KullaniciHatasi("Fotoğraf çok büyük (en çok 2 MB).");
  const tur = dosyaTuru(dosya.veri, true);
  if (!tur) throw new KullaniciHatasi("Fotoğraf JPG, PNG ya da WEBP olmalı.");
  return dosyaKaydet("fotolar", dosya.veri, tur.uzanti);
}
const bilgiSayfasi = (req, baslik, metin, ek = "") => sayfa(req, { baslik, dar: true, icerik: html`<div class="kart giris-kutu"><h1>Satal</h1><h2>${baslik}</h2><p>${metin}</p>${ek}</div>` });

export default async function (app) {
  const acik = { config: { acik: true } };

  app.get("/giris", acik, async (req, reply) => {
    if (req.kullanici) return reply.redirect("/");
    const sonra = guvenliSonra(req.query.sonra);
    const denemeKullanicilari = ayar.denemeGirisi ? await sistem((q) => q("select eposta, ad, rol from kullanicilar where durum = 'aktif' order by rol desc, ad")) : [];
    return reply.sayfa(sayfa(req, { baslik: "Giriş", dar: true, icerik: html`
      <div class="kart giris-kutu">
        <h1>Satal</h1><p class="soluk">STA Gayrimenkul</p>
        ${ayar.google.istemciId ? html`<p><a class="dugme google-dugme genis" href="/giris/google?sonra=${encodeURIComponent(sonra)}">Google ile giriş yap</a></p><div class="ayrac">ya da</div>` : ""}
        <form class="form" method="post" action="/giris">
          ${csrfAlani(req)}<input type="hidden" name="sonra" value="${sonra}">
          ${alan({ ad: "eposta", etiket: "E-posta", tip: "email", zorunlu: true, ek: 'autocomplete="username"' })}
          ${alan({ ad: "sifre", etiket: "Şifre", tip: "password", zorunlu: true, ek: 'autocomplete="current-password"' })}
          <button class="dugme genis">Giriş yap</button>
        </form>
        <p><a href="/sifremi-unuttum">Şifremi unuttum</a></p>
        <p class="soluk">Yöneticiler Google ile giriş yapar. Üyelik yalnızca yöneticinin gönderdiği davet bağlantısıyla açılır.</p>
      </div>
      ${denemeKullanicilari.length ? html`<div class="kart"><h3>Deneme girişi (yalnızca geliştirme ortamı)</h3>
        <ul class="liste">${denemeKullanicilari.map((k) => html`<li><div class="govde"><a class="ad" href="/deneme-giris?eposta=${encodeURIComponent(k.eposta)}">${k.ad}</a><small>${k.rol} · ${k.eposta}</small></div></li>`)}</ul></div>` : ""}` }));
  });

  app.post("/giris", acik, async (req, reply) => {
    const eposta = String(req.form.eposta || "").trim().toLowerCase(), sifre = String(req.form.sifre || "");
    if (!hizSiniri("giris:" + req.ip, 30, 900) || !hizSiniri("giris:" + eposta, 10, 900)) throw new KullaniciHatasi("Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.", 429);
    const sonuc = await sistem(async (q) => {
      const k = await q.bir("select * from kullanicilar where eposta = $1", [eposta]);
      // Yöneticiler şifreyle giremez; hesabı olmayanla şifresi yanlış olan aynı yanıtı alır.
      if (!k || k.rol !== "danisman" || !k.sifre_hash || !sifreDogru(sifre, k.sifre_hash)) {
        if (!k?.sifre_hash) sifreDogru(sifre, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "=="); // süre farkından hesap var/yok anlaşılmasın
        await kaydet(q, req, "giris_basarisiz", "kullanici", k?.id, {});
        return { hata: "E-posta ya da şifre hatalı." };
      }
      if (k.durum === "onay_bekliyor") return { hata: "Üyeliğiniz yönetici onayı bekliyor. Onaylanınca e-posta alacaksınız." };
      if (k.durum !== "aktif") return { hata: "Bu hesap kapalı. Yöneticinize danışın." };
      await oturumAc(q, k.id, req, reply);
      await kaydet(q, { kullanici: k, ip: req.ip }, "giris", "kullanici", k.id, { yol: "sifre" });
      return { tamam: true };
    });
    if (sonuc.hata) return reply.bildir(sonuc.hata, "hata").redirect("/giris");
    return reply.redirect(guvenliSonra(req.form.sonra));
  });

  app.post("/cikis", { config: { gizlilikOncesi: true } }, async (req, reply) => {
    await sistem((q) => q("delete from oturumlar where id = $1", [req.kullanici.oturum_id]));
    reply.clearCookie(CEREZ, { path: "/" });
    return reply.redirect("/giris");
  });

  if (ayar.denemeGirisi) {
    app.get("/deneme-giris", acik, async (req, reply) => {
      await sistem(async (q) => {
        const k = await q.bir("select * from kullanicilar where eposta = $1 and durum = 'aktif'", [String(req.query.eposta || "")]);
        if (!k) throw new KullaniciHatasi("Kullanıcı yok.", 404);
        await oturumAc(q, k.id, req, reply);
      });
      return reply.redirect("/");
    });
  }

  // ---------- Şifremi unuttum ----------
  app.get("/sifremi-unuttum", acik, (req, reply) => reply.sayfa(sayfa(req, { baslik: "Şifremi unuttum", dar: true, geri: { yol: "/giris", ad: "Giriş" }, icerik: html`
    <div class="kart"><h1>Şifremi unuttum</h1><p>E-posta adresinizi yazın; yeni şifre belirleme bağlantısı gönderelim.</p>
    <form class="form" method="post">${csrfAlani(req)}${alan({ ad: "eposta", etiket: "E-posta", tip: "email", zorunlu: true })}<button class="dugme genis">Bağlantı gönder</button></form></div>` })));
  app.post("/sifremi-unuttum", acik, async (req, reply) => {
    const eposta = String(req.form.eposta || "").trim().toLowerCase();
    if (!hizSiniri("unuttum:" + req.ip, 10, 3600)) throw new KullaniciHatasi("Çok fazla istek yapıldı. Bir saat sonra tekrar deneyin.", 429);
    if (epostaGecerli(eposta) && hizSiniri("unuttum:" + eposta, 3, 3600)) {
      const jeton = await sistem(async (q) => {
        const k = await q.bir("select id from kullanicilar where eposta = $1 and rol = 'danisman' and durum in ('aktif', 'onay_bekliyor', 'eposta_bekliyor')", [eposta]);
        if (!k) return null;
        const j = jetonUret();
        await q("insert into eposta_jetonlari (kullanici_id, tur, jeton_hash, bitis_at) values ($1, 'sifre_sifirla', $2, now() + interval '1 hour')", [k.id, jetonHash(j)]);
        return j;
      });
      if (jeton) await epostaGonder({ kime: eposta, ...sablonlar.sifreSifirla(`${ayar.adres}/sifre/${jeton}`) }).catch((e) => req.log?.error?.(e));
    }
    // Adres kayıtlı olsun olmasın aynı yanıt verilir.
    return reply.sayfa(bilgiSayfasi(req, "E-postanızı kontrol edin", "Bu adres kayıtlıysa şifre belirleme bağlantısı gönderildi. Gelen kutunuzda yoksa gereksiz (spam) klasörüne de bakın.", html`<p><a href="/giris">Girişe dön</a></p>`));
  });

  const jetonSatiri = (q, jeton) => q.bir(
    `select j.*, k.eposta, k.durum, k.ad from eposta_jetonlari j join kullanicilar k on k.id = j.kullanici_id
      where j.jeton_hash = $1 and j.kullanildi_at is null and j.bitis_at > now() and k.durum <> 'kapali'`, [jetonHash(jeton)]);
  app.get("/sifre/:jeton", acik, async (req, reply) => {
    const j = await sistem((q) => jetonSatiri(q, req.params.jeton));
    if (!j) return reply.code(410).sayfa(bilgiSayfasi(req, "Bağlantı geçersiz", "Bu bağlantının süresi dolmuş ya da daha önce kullanılmış.", html`<p><a class="dugme" href="/sifremi-unuttum">Yeni bağlantı iste</a></p>`));
    return reply.sayfa(sayfa(req, { baslik: "Şifre belirle", dar: true, icerik: html`<div class="kart"><h1>Şifrenizi belirleyin</h1><p class="soluk">${j.eposta}</p>
      <form class="form" method="post">${csrfAlani(req)}
        ${alan({ ad: "sifre", etiket: "Yeni şifre", tip: "password", zorunlu: true, ipucu: "En az 10 karakter.", ek: 'autocomplete="new-password" minlength="10"' })}
        ${alan({ ad: "sifre2", etiket: "Yeni şifre (tekrar)", tip: "password", zorunlu: true, ek: 'autocomplete="new-password"' })}
        <button class="dugme genis">Kaydet</button></form></div>` }));
  });
  app.post("/sifre/:jeton", acik, async (req, reply) => {
    const { sifre, sifre2 } = req.form;
    if (sifre !== sifre2) throw new KullaniciHatasi("İki şifre aynı değil.");
    const sorun = sifreUygunMu(sifre);
    if (sorun) throw new KullaniciHatasi(sorun);
    const sonuc = await sistem(async (q) => {
      const j = await jetonSatiri(q, req.params.jeton);
      if (!j) throw new KullaniciHatasi("Bu bağlantının süresi dolmuş ya da daha önce kullanılmış.", 410);
      await q("update eposta_jetonlari set kullanildi_at = now() where kullanici_id = $1 and kullanildi_at is null", [j.kullanici_id]);
      const ilk = j.durum === "eposta_bekliyor";
      await q("update kullanicilar set sifre_hash = $2, durum = case when durum = 'eposta_bekliyor' then 'onay_bekliyor' else durum end where id = $1", [j.kullanici_id, sifreHash(sifre)]);
      await q("delete from oturumlar where kullanici_id = $1", [j.kullanici_id]);
      await kaydet(q, { ip: req.ip, kullanici: { id: j.kullanici_id } }, ilk ? "sifre_belirlendi" : "sifre_degisti", "kullanici", j.kullanici_id);
      return { ilk, durum: ilk ? "onay_bekliyor" : j.durum, ad: j.ad, eposta: j.eposta };
    });
    if (sonuc.ilk) await yoneticilereBildir(sonuc.ad, sonuc.eposta);
    if (sonuc.durum === "onay_bekliyor") return reply.sayfa(bilgiSayfasi(req, "Şifreniz kaydedildi", "Üyeliğiniz yönetici onayı bekliyor. Onaylanınca e-posta alacaksınız."));
    return reply.bildir("Şifreniz değişti. Yeni şifrenizle giriş yapın.").redirect("/giris");
  });

  // ---------- Davetle üyelik ----------
  app.get("/davet/:jeton", acik, async (req, reply) => {
    const d = await sistem((q) => davetBul(q, req.params.jeton));
    if (!d) return reply.code(410).sayfa(bilgiSayfasi(req, "Davet geçersiz", "Bu davet bağlantısının süresi dolmuş ya da daha önce kullanılmış. Yöneticinizden yeni bir davet isteyin."));
    return reply.sayfa(sayfa(req, { baslik: "Üyelik", dar: true, icerik: html`<div class="kart"><h1>Satal'a hoş geldiniz</h1>
      <p>Üyeliğiniz yönetici onayından sonra açılır.</p>
      <form class="form" method="post" enctype="multipart/form-data">${csrfAlani(req)}
        ${alan({ ad: "ad", etiket: "Adınız soyadınız", zorunlu: true, ek: 'maxlength="100" autocomplete="name"' })}
        ${alan({ ad: "telefon", etiket: "Cep telefonunuz", tip: "tel", zorunlu: true, yer: "05xx xxx xx xx" })}
        <label class="alan"><span class="etiket">Fotoğrafınız</span><input type="file" name="foto" accept="image/jpeg,image/png,image/webp" data-kucult="480"><small>Yönetici ekranlarında adınızın yanında görünür.</small></label>
        ${ayar.google.istemciId ? html`<button class="dugme google-dugme genis" name="yol" value="google">Google ile devam et</button><div class="ayrac">ya da</div>` : ""}
        <p class="soluk">E-postayla üyelik: <b>${d.eposta}</b> adresine şifre belirleme bağlantısı gönderilir.</p>
        <button class="dugme ${ayar.google.istemciId ? "ikincil" : ""} genis" name="yol" value="eposta">E-postama bağlantı gönder</button>
      </form></div>` }));
  });
  app.post("/davet/:jeton", acik, async (req, reply) => {
    const f = req.form;
    const ad = String(f.ad || "").trim().slice(0, 100), telefon = telefonNorm(f.telefon);
    if (ad.length < 3) throw new KullaniciHatasi("Adınızı ve soyadınızı yazın.");
    if (!telefon) throw new KullaniciHatasi("Telefon numarası geçersiz.");
    const d = await sistem((q) => davetBul(q, req.params.jeton));
    if (!d) throw new KullaniciHatasi("Bu davet bağlantısı geçersiz.", 410);
    const foto = await fotoKaydet(Array.isArray(f.foto) ? f.foto[0] : f.foto);
    if (f.yol === "google" && ayar.google.istemciId) return googleaGit(reply, { davetId: d.id, uyelik: { ad, telefon, foto } });
    const jeton = jetonUret();
    await sistem(async (q) => {
      if (await q.bir("select 1 from kullanicilar where eposta = $1", [d.eposta])) throw new KullaniciHatasi("Bu e-posta adresiyle zaten bir üyelik var. Giriş yapmayı ya da “Şifremi unuttum”u deneyin.");
      const k = await q.bir("insert into kullanicilar (eposta, ad, telefon, foto_yol, durum) values ($1, $2, $3, $4, 'eposta_bekliyor') returning id", [d.eposta, ad, telefon, foto]);
      await q("update davetler set kullanildi_at = now() where id = $1", [d.id]);
      await q("insert into eposta_jetonlari (kullanici_id, tur, jeton_hash, bitis_at) values ($1, 'sifre_belirle', $2, now() + interval '24 hours')", [k.id, jetonHash(jeton)]);
      await kaydet(q, { ip: req.ip, kullanici: { id: k.id } }, "uyelik_basvurusu", "kullanici", k.id, { yol: "eposta" });
    });
    await epostaGonder({ kime: d.eposta, ...sablonlar.sifreBelirle(`${ayar.adres}/sifre/${jeton}`) });
    return reply.sayfa(bilgiSayfasi(req, "E-postanızı kontrol edin", `${d.eposta} adresine şifre belirleme bağlantısı gönderdik. Bağlantı 24 saat geçerlidir. Gelen kutunuzda yoksa gereksiz (spam) klasörüne de bakın.`));
  });

  // ---------- Google ile giriş ----------
  function googleaGit(reply, veri) {
    const nonce = jetonUret(), dogrulayici = jetonUret();
    const durum = bekleyenEkle({ ...veri, nonce, dogrulayici });
    const u = new URL(ayar.google.yetkiAdresi);
    u.search = new URLSearchParams({
      client_id: ayar.google.istemciId, redirect_uri: ayar.adres + "/giris/google/donus", response_type: "code", scope: "openid email profile",
      state: durum, nonce, code_challenge: crypto.createHash("sha256").update(dogrulayici).digest("base64url"), code_challenge_method: "S256", prompt: "select_account",
    }).toString();
    return reply.redirect(u.toString());
  }
  app.get("/giris/google", acik, async (req, reply) => {
    if (!ayar.google.istemciId) throw new KullaniciHatasi("Google ile giriş henüz ayarlanmadı.", 503);
    return googleaGit(reply, { sonra: guvenliSonra(req.query.sonra) });
  });
  app.get("/giris/google/donus", acik, async (req, reply) => {
    const b = bekleyenler.get(String(req.query.state || ""));
    bekleyenler.delete(String(req.query.state || ""));
    if (!b || b.bitis < Date.now() || !req.query.code) return reply.bildir("Google ile giriş tamamlanamadı. Tekrar deneyin.", "hata").redirect("/giris");
    let kimlik;
    try {
      const r = await fetch(ayar.google.jetonAdresi, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: String(req.query.code), client_id: ayar.google.istemciId, client_secret: ayar.google.istemciSifresi, redirect_uri: ayar.adres + "/giris/google/donus", grant_type: "authorization_code", code_verifier: b.dogrulayici }),
      });
      const j = await r.json();
      if (!r.ok || !j.id_token) throw new Error("jeton alınamadı");
      const { payload } = await jwtVerify(j.id_token, googleAnahtarlari(), { issuer: ayar.google.yayinci, audience: ayar.google.istemciId });
      if (payload.nonce !== b.nonce) throw new Error("nonce tutmuyor");
      if (!payload.email || payload.email_verified !== true) throw new Error("e-posta doğrulanmamış");
      kimlik = { sub: String(payload.sub), eposta: String(payload.email).toLowerCase(), ad: String(payload.name || "").slice(0, 100) };
    } catch (e) {
      req.log?.warn?.({ hata: e.message }, "google girişi başarısız");
      return reply.bildir("Google ile giriş doğrulanamadı. Tekrar deneyin.", "hata").redirect("/giris");
    }
    const sonuc = await sistem(async (q) => {
      let k = await q.bir("select * from kullanicilar where google_sub = $1", [kimlik.sub]) || await q.bir("select * from kullanicilar where eposta = $1", [kimlik.eposta]);
      if (k && k.google_sub && k.google_sub !== kimlik.sub) return { hata: "Bu e-posta başka bir Google hesabına bağlı." };
      // İlk yöneticiler: sunucu ayarında adresi yazılı olan kişi Google ile girdiğinde yetkilendirilir.
      const beklenenRol = kimlik.eposta === ayar.sahipEposta ? "sahip" : ayar.yoneticiEpostalari.includes(kimlik.eposta) ? "yonetici" : null;
      if (!k && beklenenRol) {
        k = await q.bir("insert into kullanicilar (eposta, ad, rol, durum, google_sub, onay_at, moduller) values ($1, $2, $3, 'aktif', $4, now(), $5) returning *",
          [kimlik.eposta, kimlik.ad || kimlik.eposta, beklenenRol, kimlik.sub, JSON.stringify({ crm: true, claude_mesaj: beklenenRol === "sahip" })]);
        await kaydet(q, { ip: req.ip, kullanici: k }, "ilk_yonetici_girisi", "kullanici", k.id, { rol: beklenenRol });
      }
      if (!k) {
        if (!b.davetId) return { hata: "Bu Google hesabıyla kayıtlı bir üyelik yok. Üyelik yalnızca yöneticinin gönderdiği davet bağlantısıyla açılır." };
        const d = await q.bir("select * from davetler where id = $1 and kullanildi_at is null and bitis_at > now()", [b.davetId]);
        if (!d) return { hata: "Davet bağlantısı geçersiz." };
        if (String(d.eposta).toLowerCase() !== kimlik.eposta) return { hata: `Bu davet ${d.eposta} adresi için gönderildi. O adresin Google hesabıyla devam edin.` };
        k = await q.bir("insert into kullanicilar (eposta, ad, telefon, foto_yol, durum, google_sub) values ($1, $2, $3, $4, 'onay_bekliyor', $5) returning *",
          [kimlik.eposta, b.uyelik.ad, b.uyelik.telefon, b.uyelik.foto, kimlik.sub]);
        await q("update davetler set kullanildi_at = now() where id = $1", [d.id]);
        await kaydet(q, { ip: req.ip, kullanici: k }, "uyelik_basvurusu", "kullanici", k.id, { yol: "google" });
        return { bekliyor: true, yeni: true, ad: k.ad, eposta: k.eposta };
      }
      if (!k.google_sub) await q("update kullanicilar set google_sub = $2, durum = case when durum = 'eposta_bekliyor' then 'onay_bekliyor' else durum end where id = $1", [k.id, kimlik.sub]);
      if (k.durum === "onay_bekliyor" || k.durum === "eposta_bekliyor") return { bekliyor: true };
      if (k.durum !== "aktif") return { hata: "Bu hesap kapalı. Yöneticinize danışın." };
      await oturumAc(q, k.id, req, reply);
      await kaydet(q, { ip: req.ip, kullanici: k }, "giris", "kullanici", k.id, { yol: "google" });
      return { tamam: true };
    });
    if (sonuc.hata) return reply.bildir(sonuc.hata, "hata").redirect("/giris");
    if (sonuc.yeni) await yoneticilereBildir(sonuc.ad, sonuc.eposta);
    if (sonuc.bekliyor) return reply.sayfa(bilgiSayfasi(req, "Onay bekleniyor", "Üyeliğiniz yönetici onayı bekliyor. Onaylanınca e-posta alacaksınız."));
    return reply.redirect(b.sonra || "/");
  });

  // ---------- Gizlilik beyanı (ilk girişte onaylanır, menüden her zaman okunur) ----------
  const beyanMetni = async () => (await ayarlarAl()).gizlilik_metni || VARSAYILAN_GIZLILIK;
  app.get("/gizlilik-onay", { config: { gizlilikOncesi: true } }, async (req, reply) => {
    if (req.kullanici.gizlilik_onay_at) return reply.redirect("/");
    return reply.sayfa(sayfa(req, { baslik: "Gizlilik beyanı", dar: true, govdeSinifi: "girissiz", icerik: html`<div class="kart"><h1>Gizlilik beyanı</h1>
      <p>${satirli(await beyanMetni())}</p>
      <form method="post" class="form">${csrfAlani(req)}<label class="secenek"><input type="checkbox" name="onay" value="1" required> Okudum, anladım</label><button class="dugme genis">Devam et</button></form>
      </div><form method="post" action="/cikis">${csrfAlani(req)}<button class="baglanti-dugme">Çıkış yap</button></form>` }));
  });
  app.post("/gizlilik-onay", { config: { gizlilikOncesi: true } }, async (req, reply) => {
    if (req.form.onay !== "1") throw new KullaniciHatasi("Devam etmek için beyanı onaylamanız gerekir.");
    await islem(req.kullanici, (q) => q.sistem(async () => {
      await q("update kullanicilar set gizlilik_onay_at = now() where id = $1 and gizlilik_onay_at is null", [req.kullanici.id]);
      await kaydet(q, req, "gizlilik_onayi", "kullanici", req.kullanici.id);
    }));
    return reply.redirect("/");
  });
  app.get("/gizlilik", async (req, reply) => reply.sayfa(sayfa(req, { baslik: "Gizlilik beyanı", dar: true, geri: { yol: "/profil", ad: "Profil" }, icerik: html`<div class="kart"><h1>Gizlilik beyanı</h1><p>${satirli(await beyanMetni())}</p>
    <p class="soluk">Onay tarihiniz: ${new Date(req.kullanici.gizlilik_onay_at).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</p></div>` })));
}
