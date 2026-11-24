// Uçtan uca sınamalar: gerçek veritabanı (satal_test) ve gerçek sunucu üzerinde, tarayıcı gibi istek atarak.
// En önemli konu gizlilik: bir danışman başka danışmanın hiçbir kaydına ne ekrandan ne veritabanından ulaşabilmeli.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const YONETIM_DB = process.env.TEST_MIGRATE_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/satal_test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://satal_app:satal_app@localhost:5432/satal_test";
process.env.MIGRATE_DATABASE_URL = YONETIM_DB;
process.env.NODE_ENV = "test";
process.env.DENEME_GIRISI = "1";
process.env.KUR_OTOMATIK = "0";
process.env.SITE_ADRESI = "http://localhost:80";
process.env.SAHIP_EPOSTA = "patron@ornek.test";
process.env.YONETICI_EPOSTALARI = "mudur@ornek.test";
process.env.YUKLEME_KLASORU = "/tmp/satal-test-yuklemeler-" + process.pid;
delete process.env.SMTP_HOST;
delete process.env.ANTHROPIC_API_KEY;

// --- Sahte Google (OpenID Connect) sağlayıcısı ---
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256", use: "sig" };
let sonrakiKimlik = null;
const sahteGoogle = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/jwks") return res.end(JSON.stringify({ keys: [jwk] }));
  if (req.url === "/token") {
    const id_token = await new SignJWT(sonrakiKimlik).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer("https://accounts.google.com").setAudience("test-istemci").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    return res.end(JSON.stringify({ id_token }));
  }
  res.statusCode = 404; res.end("{}");
});
await new Promise((r) => sahteGoogle.listen(0, "127.0.0.1", r));
const gPort = sahteGoogle.address().port;
Object.assign(process.env, { GOOGLE_CLIENT_ID: "test-istemci", GOOGLE_CLIENT_SECRET: "x", GOOGLE_TOKEN_URL: `http://127.0.0.1:${gPort}/token`, GOOGLE_JWKS_URL: `http://127.0.0.1:${gPort}/jwks` });

// --- Veritabanını sıfırla ve kur ---
{
  const c = new pg.Client({ connectionString: YONETIM_DB });
  await c.connect();
  await c.query("drop schema public cascade; create schema public;");
  await c.end();
}
const { gocEt } = await import("../scripts/migrate.js");
await gocEt({ baglanti: YONETIM_DB, sessiz: true });
const { uygulamaKur } = await import("../src/sunucu.js");
const { sistem, islem, kapat } = await import("../src/db.js");
const { denemeKutusu } = await import("../src/eposta.js");
const { hizTemizle } = await import("../src/kimlik.js");
const { bugun } = await import("../src/lib/metin.js");
const app = await uygulamaKur();

class Tarayici {
  constructor() { this.cerez = {}; }
  async istek(method, url, { form, govde, basliklar = {} } = {}) {
    const h = { accept: "text/html", cookie: Object.entries(this.cerez).map(([k, v]) => `${k}=${v}`).join("; "), ...basliklar };
    let payload = govde;
    if (form) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries({ _csrf: this.cerez.satal_csrf || "", ...form })) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
      payload = p.toString(); h["content-type"] = "application/x-www-form-urlencoded";
    }
    const r = await app.inject({ method, url, headers: h, payload });
    for (const c of r.cookies) { if (c.value === "") delete this.cerez[c.name]; else this.cerez[c.name] = c.value; }
    return r;
  }
  al(url, s) { return this.istek("GET", url, s); }
  gonder(url, form = {}, s = {}) { return this.istek("POST", url, { form, ...s }); }
  async gir(eposta) { const r = await this.al("/deneme-giris?eposta=" + eposta); assert.equal(r.statusCode, 302, "deneme girişi: " + eposta); return this; }
  dosyaGonder(url, alanlar, dosya) {
    const sinir = "----satal" + Math.random().toString(16).slice(2);
    const parcalar = [];
    for (const [k, v] of Object.entries({ _csrf: this.cerez.satal_csrf, ...alanlar })) parcalar.push(Buffer.from(`--${sinir}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parcalar.push(Buffer.from(`--${sinir}\r\nContent-Disposition: form-data; name="${dosya.alan}"; filename="${dosya.ad}"\r\nContent-Type: ${dosya.mime}\r\n\r\n`), Buffer.from(dosya.icerik), Buffer.from(`\r\n--${sinir}--\r\n`));
    return this.istek("POST", url, { govde: Buffer.concat(parcalar), basliklar: { "content-type": `multipart/form-data; boundary=${sinir}` } });
  }
}
const idAl = (r) => { assert.equal(r.statusCode, 302, "yönlendirme bekleniyordu: " + r.statusCode + " " + r.body.slice(0, 300)); return r.headers.location.split("/").pop(); };

const K = {}; // kullanıcı id'leri
let ayse, mehmet, mudur, patron, yer;
before(async () => {
  await sistem(async (q) => {
    await q("insert into kurlar (tarih, usd_try, kaynak) values ($1, 40, 'test')", [bugun()]);
    for (const [anahtar, eposta, ad, rol] of [["ayse", "ayse@ornek.test", "Ayşe Danışman", "danisman"], ["mehmet", "mehmet@ornek.test", "Mehmet Danışman", "danisman"], ["mudur", "mudur@ornek.test", "Müdür Bey", "yonetici"], ["patron", "patron@ornek.test", "Patron", "sahip"]]) {
      K[anahtar] = (await q.bir("insert into kullanicilar (eposta, ad, rol, durum, gizlilik_onay_at) values ($1, $2, $3, 'aktif', now()) returning id", [eposta, ad, rol])).id;
    }
    const karsiyaka = (await q.bir("select id from ilceler where il_id = 35 and ad = 'Karşıyaka'")).id;
    const mah = await q("select id, ad from mahalleler where ilce_id = $1 and sinir_var order by ad limit 2", [karsiyaka]);
    yer = { ilce: karsiyaka, mahalle: mah[0].id };
  });
  ayse = await new Tarayici().gir("ayse@ornek.test");
  mehmet = await new Tarayici().gir("mehmet@ornek.test");
  mudur = await new Tarayici().gir("mudur@ornek.test");
  patron = await new Tarayici().gir("patron@ornek.test");
});
after(async () => { await app.close(); await kapat(); sahteGoogle.close(); });

const kisiFormu = (ad, telefon, ek = {}) => ({ ad, telefon1: telefon, hitap_turu: "bey", sen_siz: "siz", dil: "tr", ...ek });
const daireFormu = (ek = {}) => ({ islem: "satilik", kategori: "konut", alt_tur: "daire", il_id: "35", ilce_id: String(yer.ilce), mahalle_id: String(yer.mahalle), fiyat_tutar: "9.000.000", fiyat_para: "TRY", o_oda: "3+1", o_m2: "130", o_asansor: "evet", ...ek });
const talepFormu = (kisiId, ek = {}) => ({ kisi_id: kisiId, islem: "satilik", alici_tipi: "oturum", kategoriler: "konut", alt_turler: "konut:daire", bolge: `${yer.ilce}:${yer.mahalle}`, butce_max_tutar: "10 milyon", butce_para: "TRY", k_oda: "3+1", ...ek });

const V = {}; // sınamalar arasında taşınan kayıt id'leri

test("giriş yapmayan kişi her sayfada girişe yönlendirilir; güvenlik başlıkları vardır", async () => {
  const t = new Tarayici();
  for (const yol of ["/", "/kisiler", "/mulkler", "/yonetim", "/yonetim/disa-aktar"]) {
    const r = await t.al(yol);
    assert.equal(r.statusCode, 302, yol); assert.match(r.headers.location, /^\/giris/);
  }
  // giriş ekranının görünebilmesi için stil ve betik herkese açık olmalı
  for (const yol of ["/statik/stil.css", "/statik/uygulama.js", "/statik/manifest.webmanifest", "/sw.js"]) assert.equal((await t.al(yol)).statusCode, 200, yol);
  const r = await t.al("/giris");
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["content-security-policy"], /script-src 'self'/);
  assert.equal(r.headers["x-frame-options"], "DENY");
  assert.doesNotMatch(r.body, /style="/, "satır içi stil CSP tarafından engellenir");
  assert.equal((await t.al("/saglik")).statusCode, 200);
});

test("form anahtarı (CSRF) olmayan ya da başka siteden gelen istek reddedilir", async () => {
  const r1 = await ayse.istek("POST", "/kisiler", { govde: "ad=Sahte&telefon1=05550001122", basliklar: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(r1.statusCode, 403);
  const r2 = await ayse.gonder("/kisiler", kisiFormu("Sahte Kişi", "0555 000 11 22"), { basliklar: { origin: "https://kotu.example" } });
  assert.equal(r2.statusCode, 403);
  assert.equal((await sistem((q) => q("select 1 from kisiler where ad like 'Sahte%'"))).length, 0);
});

test("kişi ekleme: numara tek biçime gelir, aynı numara ikinci kez eklenemez", async () => {
  V.ahmet = idAl(await ayse.gonder("/kisiler", kisiFormu("Ahmet Örnek", "0555 111 22 33", { potansiyel: "A", alim_gucu_tutar: "8 milyon", alim_gucu_para: "TRY" })));
  const k = await sistem((q) => q.bir("select k.*, t.numara from kisiler k join kisi_telefonlari t on t.kisi_id = k.id where k.id = $1", [V.ahmet]));
  assert.equal(k.numara, "905551112233");
  assert.equal(k.alim_gucu_usd, 200000, "TL tutar girildiği günün kuruyla dolara sabitlenir");
  const r = await ayse.gonder("/kisiler", kisiFormu("Ahmet İkinci", "+90 555 111 22 33"), { basliklar: { referer: "http://localhost:80/kisiler/yeni" } });
  assert.equal(r.statusCode, 302); assert.equal(r.headers.location, "/kisiler/yeni");
  assert.match(decodeURIComponent(r.cookies.find((c) => c.name === "satal_bildirim").value), /zaten kayıtlı/);
  // Aynı numara başka danışmanda olabilir (çift kayıt yalnızca yöneticiye görünür)
  V.mehmetAhmet = idAl(await mehmet.gonder("/kisiler", kisiFormu("Ahmet Ö.", "05551112233")));
  V.burak = idAl(await mehmet.gonder("/kisiler", kisiFormu("Burak Alıcı", "05552223344")));
  V.malik = idAl(await ayse.gonder("/kisiler", kisiFormu("Hülya Malik", "05553334455", { hitap_turu: "hanim" })));
});

test("talep + mülk → eşleşme hesaplanır; danışman yalnızca kendi içindeki eşleşmeyi görür", async () => {
  V.talep = idAl(await ayse.gonder("/talepler", talepFormu(V.ahmet)));
  V.mulk = idAl(await ayse.gonder("/mulkler", daireFormu({ malik_kisi_id: V.malik, ada: "100", parsel: "7" })));
  V.mehmetTalep = idAl(await mehmet.gonder("/talepler", talepFormu(V.burak)));
  V.mehmetMulk = idAl(await mehmet.gonder("/mulkler", daireFormu({ ofis_mulku: "1", fiyat_tutar: "9.500.000", ada: "100", parsel: "7" })));
  const hepsi = await sistem((q) => q("select talep_sahip_id, mulk_sahip_id, puan, sinif from eslesmeler where gecerli"));
  assert.equal(hepsi.length, 4, "2 talep × 2 mülk");
  assert.ok(hepsi.every((e) => e.puan === 100 && e.sinif === "A"));
  const sayfa = await ayse.al("/mulkler/" + V.mulk);
  assert.match(sayfa.body, /Ahmet Örnek/); assert.doesNotMatch(sayfa.body, /Burak/); assert.doesNotMatch(sayfa.body, /Ekip eşleşmeleri/);
  const gorunen = await islem({ id: K.ayse, rol: "danisman" }, (q) => q("select * from eslesmeler"));
  assert.equal(gorunen.length, 1, "veritabanı Ayşe'ye yalnızca kendi eşleşmesini verir");
  assert.match((await ayse.al("/")).body, /Yeni eşleşmeler|Bugün kimi aramalıyım/);
});

test("GİZLİLİK: danışman başka danışmanın kişisini, mülkünü, talebini, belgesini açamaz", async () => {
  for (const yol of [`/kisiler/${V.burak}`, `/kisiler/${V.burak}/duzenle`, `/mulkler/${V.mehmetMulk}`, `/mulkler/${V.mehmetMulk}/duzenle`, `/talepler/${V.mehmetTalep}`, `/talepler/${V.mehmetTalep}/duzenle`,
    `/mesaj?kisi=${V.burak}&mulk=${V.mulk}`, `/mesaj?kisi=${V.ahmet}&mulk=${V.mehmetMulk}`, `/talepler/yeni?kisi=${V.burak}`]) {
    const r = await ayse.al(yol);
    assert.ok(r.statusCode === 404 || (r.statusCode === 200 && !/Burak/.test(r.body)), `${yol} → ${r.statusCode}`);
    assert.doesNotMatch(r.body, /Burak|05552223344|9\.500\.000/, yol);
  }
  for (const [yol, form] of [[`/kisiler/${V.burak}`, kisiFormu("Ele Geçti", "05559998877")], [`/kisiler/${V.burak}/sil`, {}], [`/kisiler/${V.burak}/gorusme`, { tarih: bugun() }], [`/kisiler/${V.burak}/arandi`, {}],
    [`/mulkler/${V.mehmetMulk}`, daireFormu({ ofis_mulku: "1" })], [`/mulkler/${V.mehmetMulk}/sil`, {}], [`/mulkler/${V.mehmetMulk}/durum`, { durum: "pasif" }], [`/talepler/${V.mehmetTalep}/sil`, {}], [`/talepler/${V.mehmetTalep}/teyit`, { yanit: "hayir" }],
    ["/talepler", talepFormu(V.burak)], ["/mulkler", daireFormu({ malik_kisi_id: V.burak })], ["/mesaj/gonderildi", { kisi: V.burak, mulk: V.mehmetMulk, metin: "x" }], ["/mesaj/sira", { mulk: V.mehmetMulk, kisi: V.burak }]]) {
    const r = await ayse.gonder(yol, form);
    assert.ok([400, 403, 404].includes(r.statusCode), `${yol} → ${r.statusCode}`);
  }
  const burak = await sistem((q) => q.bir("select ad, silindi_at from kisiler where id = $1", [V.burak]));
  assert.equal(burak.ad, "Burak Alıcı"); assert.equal(burak.silindi_at, null);
  assert.equal((await sistem((q) => q("select 1 from talepler where kisi_id = $1 and sahip_id = $2", [V.burak, K.ayse]))).length, 0);
  assert.equal((await sistem((q) => q("select 1 from mulkler where malik_kisi_id = $1 and sahip_id = $2", [V.burak, K.ayse]))).length, 0);
  // Listeler ve arama
  assert.doesNotMatch((await ayse.al("/kisiler?q=Burak")).body, /Burak Alıcı/);
  assert.doesNotMatch((await ayse.al("/kisiler?kimin=hepsi")).body, /Burak Alıcı/, "kimin=hepsi danışmanda işe yaramaz");
  assert.doesNotMatch((await ayse.al(`/mulkler?kimin=${K.mehmet}`)).body, /9,5 milyon/);
  assert.equal((await ayse.al("/kisiler/ara?q=Burak", { basliklar: { accept: "application/json" } })).body, "[]");
  // Yönetim ekranları
  for (const yol of ["/yonetim", "/yonetim/ekip", "/yonetim/ekip-eslesmeleri", "/yonetim/cift-kayitlar", "/yonetim/kayit", "/yonetim/ayarlar", "/yonetim/cop", "/yonetim/disa-aktar", "/yonetim/kur", `/foto/${K.mehmet}`]) {
    const r = await ayse.al(yol);
    assert.ok(r.statusCode === 403 || r.statusCode === 404, `${yol} → ${r.statusCode}`);
  }
  assert.equal((await ayse.gonder("/yonetim/disa-aktar/kisiler")).statusCode, 403);
  assert.equal((await ayse.gonder("/yonetim/davet", { eposta: "arkadas@ornek.test" })).statusCode, 403);
});

test("GİZLİLİK (veritabanı düzeyi): uygulamada hata olsa bile kurallar veriyi korur", async () => {
  const a = { id: K.ayse, rol: "danisman" };
  await islem(a, async (q) => {
    assert.ok((await q("select sahip_id from kisiler")).every((k) => k.sahip_id === K.ayse));
    assert.ok((await q("select sahip_id from mulkler")).every((k) => k.sahip_id === K.ayse));
    assert.ok((await q("select sahip_id from talepler")).every((k) => k.sahip_id === K.ayse));
    assert.equal((await q("select * from kisi_telefonlari where kisi_id = $1", [V.burak])).length, 0);
    assert.equal((await q("update kisiler set ad = 'x' where id = $1 returning id", [V.burak])).length, 0);
    assert.equal((await q("delete from kisiler where id = $1 returning id", [V.ahmet])).length, 0, "danışman kalıcı silemez");
    assert.equal((await q("select id from kullanicilar")).length, 1, "danışman yalnızca kendi kullanıcı satırını görür");
    assert.equal((await q("select 1 from islem_kaydi")).length, 0);
    assert.equal((await q("select 1 from oturumlar")).length, 0);
    assert.equal((await q("update kullanicilar set rol = 'sahip' where id = $1 returning id", [K.ayse])).length, 0, "kendi rolünü yükseltemez");
  });
  for (const sql of [
    ["insert into talepler (sahip_id, kisi_id, kategoriler) values ($1, $2, '{konut}')", [K.ayse, V.burak]],
    ["insert into kisiler (sahip_id, ad) values ($1, 'Başkasına kayıt')", [K.mehmet]],
    ["insert into mulkler (sahip_id, malik_kisi_id, kategori, alt_tur) values ($1, $2, 'konut', 'daire')", [K.ayse, V.burak]],
    ["insert into gorusmeler (kisi_id, sahip_id) values ($1, $2)", [V.burak, K.ayse]],
    ["insert into eslesmeler (talep_id, mulk_id, talep_sahip_id, mulk_sahip_id) values ($1, $2, $3, $3)", [V.mehmetTalep, V.mulk, K.ayse]],
    ["update eslesmeler set durum = 'goruldu'", []],
  ]) await assert.rejects(islem(a, async (q) => { const r = await q(sql[0] + (sql[0].startsWith("update") ? " returning 1" : ""), sql[1]); if (sql[0].startsWith("update") && !r.length) throw Object.assign(new Error("0 satır"), { code: "42501" }); }), (e) => e.code === "42501", sql[0]);
  // Kimliksiz bağlantı hiçbir şey göremez
  await islem(null, async (q) => { assert.equal((await q("select 1 from kisiler")).length, 0); assert.equal((await q("select 1 from kullanicilar")).length, 0); });
});

test("yönetici herkesi görür ama başkasının kaydını değiştiremez; ekip eşleşmeleri ve çift kayıtlar yalnızca ona açık", async () => {
  assert.match((await mudur.al("/kisiler?kimin=hepsi")).body, /Burak Alıcı/);
  assert.equal((await mudur.al(`/kisiler/${V.burak}`)).statusCode, 200);
  assert.equal((await mudur.gonder(`/kisiler/${V.burak}`, kisiFormu("Değişti", "05552223344"))).statusCode, 403);
  assert.equal((await mudur.gonder(`/kisiler/${V.burak}/sil`)).statusCode, 403);
  const ekip = await mudur.al("/yonetim/ekip-eslesmeleri");
  assert.match(ekip.body, /Ayşe Danışman/); assert.match(ekip.body, /Burak Alıcı/);
  assert.match((await mudur.al("/mulkler/" + V.mulk)).body, /Ekip eşleşmeleri \(1\)/);
  const cift = await mudur.al("/yonetim/cift-kayitlar");
  assert.match(cift.body, /\+90 555 111 22 33/); assert.match(cift.body, /ada 100 \/ parsel 7/);
  const r = await mudur.gonder("/yonetim/ekip-eslesmeleri/isaret", { talep: V.mehmetTalep, mulk: V.mulk, durum: "paylasildi" });
  assert.equal(r.statusCode, 302);
  assert.doesNotMatch((await mudur.al("/yonetim/ekip-eslesmeleri")).body, new RegExp(`value="${V.mehmetTalep}"><input type="hidden" name="mulk" value="${V.mulk}"`));
  // Yalnızca sistem sahibine açık bölümler
  for (const yol of ["/yonetim/ayarlar", "/yonetim/cop", "/yonetim/disa-aktar", "/yonetim/gizlilik"]) assert.equal((await mudur.al(yol)).statusCode, 403, yol);
  assert.equal((await mudur.gonder("/yonetim/disa-aktar/kisiler")).statusCode, 403);
  assert.equal((await mudur.gonder(`/yonetim/kullanici/${K.ayse}/moduller`, { crm: "1", claude_mesaj: "1" })).statusCode, 403);
  assert.equal((await mudur.gonder(`/yonetim/kullanici/${K.patron}/kapat`)).statusCode, 403, "yönetici sistem sahibini kapatamaz");
});

test("mesaj: şablon hazırlanır, tam adres ve karşı taraf bilgisi içermez; gönderim kişi kartına işlenir", async () => {
  const s = await ayse.al(`/mesaj?kisi=${V.ahmet}&mulk=${V.mulk}&talep=${V.talep}`);
  assert.equal(s.statusCode, 200);
  const metin = /<textarea[^>]*id="mesaj-metni"[^>]*>([\s\S]*?)<\/textarea>/.exec(s.body)[1];
  assert.match(metin, /Merhaba Ahmet Bey,/); assert.match(metin, /130 m² 3\+1 daire/); assert.match(metin, /9 milyon TL/); assert.match(metin, /Ayşe Danışman\nSTA Gayrimenkul/);
  assert.doesNotMatch(metin, /Hülya|parsel|ada 100/);
  assert.match(s.body, /wa\.me\/905551112233\?text=/);
  const satici = await ayse.al(`/mesaj?kisi=${V.malik}&mulk=${V.mulk}&yon=saticiya`);
  const sm = /<textarea[^>]*id="mesaj-metni"[^>]*>([\s\S]*?)<\/textarea>/.exec(satici.body)[1];
  assert.match(sm, /Hülya Hanım/); assert.match(sm, /uygun bir alıcımız var/); assert.doesNotMatch(sm, /Ahmet/);
  assert.equal((await ayse.gonder("/mesaj/gonderildi", { kisi: V.ahmet, mulk: V.mulk, talep: V.talep, yon: "aliciya", metin })).statusCode, 302);
  const e = await sistem((q) => q.bir("select durum from eslesmeler where talep_id = $1 and mulk_id = $2", [V.talep, V.mulk]));
  assert.equal(e.durum, "gonderildi");
  assert.match((await ayse.al(`/mesaj?kisi=${V.ahmet}&mulk=${V.mulk}`)).body, /bugün gönderildi/, "yeniden gönderim uyarısı");
  assert.match((await ayse.al(`/kisiler/${V.ahmet}`)).body, /Mülk tanıtım mesajı gönderildi/);
  // "Mesaj istemiyor" işaretli kişiye mesaj hazırlanmaz
  await sistem((q) => q("update kisiler set mesaj_istemiyor = true where id = $1", [V.ahmet]));
  assert.match((await ayse.al(`/mesaj?kisi=${V.ahmet}&mulk=${V.mulk}`)).body, /mesajı istemiyor/);
  assert.equal((await ayse.gonder("/mesaj/gonderildi", { kisi: V.ahmet, mulk: V.mulk, yon: "aliciya", metin: "x" })).statusCode, 400);
  await sistem((q) => q("update kisiler set mesaj_istemiyor = false where id = $1", [V.ahmet]));
  // Claude bölümü kapalı olan kullanıcı kullanamaz
  assert.equal((await ayse.gonder("/mesaj/claude", { kisi: V.ahmet, mulk: V.mulk })).statusCode, 403);
});

test("günlük mesaj sınırı aşılınca gönderim kaydı reddedilir", async () => {
  await sistem((q) => q("insert into ayarlar (anahtar, deger) values ('gunluk_mesaj_siniri', '1') on conflict (anahtar) do update set deger = '1'"));
  const { onbellekTemizle } = await import("../src/servis/ortak.js"); onbellekTemizle();
  const r = await ayse.gonder("/mesaj/sira", { mulk: V.mulk, kisi: V.ahmet });
  assert.equal(r.statusCode, 400);
  await sistem((q) => q("delete from ayarlar where anahtar = 'gunluk_mesaj_siniri'")); onbellekTemizle();
});

test("fiyat düşünce yeni alıcılar çıkar; mülk satılınca eşleşmeler kalkar", async () => {
  const kisi = idAl(await ayse.gonder("/kisiler", kisiFormu("Zeynep Dar Bütçe", "05554445566")));
  const t = idAl(await ayse.gonder("/talepler", talepFormu(kisi, { butce_max_tutar: "7.000.000" })));
  assert.equal((await sistem((q) => q("select 1 from eslesmeler where talep_id = $1 and gecerli", [t]))).length, 0, "9 milyonluk mülk 7 milyon bütçeye girmez");
  await ayse.gonder("/mulkler/" + V.mulk, daireFormu({ malik_kisi_id: V.malik, fiyat_tutar: "7.500.000", ada: "100", parsel: "7" }));
  const e = await sistem((q) => q.bir("select puan, sinif, fiyat_dustu, ayrinti from eslesmeler where talep_id = $1 and mulk_id = $2 and gecerli", [t, V.mulk]));
  assert.ok(e, "bütçenin %7 üstü: gösterilir"); assert.equal(e.fiyat_dustu, true); assert.equal(e.sinif, "B", "bütçeyi aşan en fazla B olur");
  await ayse.gonder(`/mulkler/${V.mulk}/durum`, { durum: "satildi" });
  assert.equal((await sistem((q) => q("select 1 from eslesmeler where mulk_id = $1 and gecerli", [V.mulk]))).length, 0);
  await ayse.gonder(`/mulkler/${V.mulk}/durum`, { durum: "aktif" });
  assert.ok((await sistem((q) => q("select 1 from eslesmeler where mulk_id = $1 and gecerli", [V.mulk]))).length >= 2);
});

test("silme: danışman için silinir, yönetici de göremez, yalnızca sistem sahibinde kalır; yeniden eklenince yeni kayıt açılır", async () => {
  assert.equal((await ayse.gonder(`/kisiler/${V.ahmet}/sil`)).statusCode, 302);
  assert.equal((await ayse.al(`/kisiler/${V.ahmet}`)).statusCode, 404);
  assert.equal((await ayse.al(`/talepler/${V.talep}`)).statusCode, 404, "kişinin talebi de silinir");
  assert.equal((await mudur.al(`/kisiler/${V.ahmet}`)).statusCode, 404, "yönetici silineni göremez");
  const p = await patron.al(`/kisiler/${V.ahmet}`);
  assert.equal(p.statusCode, 200); assert.match(p.body, /silindi/);
  assert.match((await patron.al("/yonetim/cop")).body, /Ahmet Örnek/);
  assert.equal((await sistem((q) => q("select 1 from eslesmeler where talep_id = $1 and gecerli", [V.talep]))).length, 0);
  const yeni = idAl(await ayse.gonder("/kisiler", kisiFormu("Ahmet Örnek", "05551112233")));
  assert.notEqual(yeni, V.ahmet);
  assert.doesNotMatch((await ayse.al(`/kisiler/${yeni}`)).body, /Mülk tanıtım mesajı gönderildi/, "eski notlar geri gelmez");
  V.ahmetYeni = yeni;
});

test("rehber yükleme: ön izleme, hepsi eklenir; aynı dosya yeniden yüklenince kimse iki kez yazılmaz", async () => {
  const vcf = ["BEGIN:VCARD", "VERSION:3.0", "FN:Deniz Tanıdık", "TEL;TYPE=CELL:0 (532) 111 22 33", "ORG:Deniz İnşaat", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "N:Komşu;Emre;;;", "TEL:+905331112233", "TEL:02324445566", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "FN:Numarasız Kişi", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "FN:Ahmet Rehberde", "TEL:0555 111 22 33", "END:VCARD",
    "BEGIN:VCARD", "VERSION:3.0", "FN:Deniz Tekrar", "TEL:05321112233", "END:VCARD"].join("\r\n");
  const r = await ayse.dosyaGonder("/kisiler/yukle", {}, { alan: "dosya", ad: "rehber.vcf", mime: "text/vcard", icerik: vcf });
  assert.equal(r.statusCode, 302, r.body.slice(0, 300));
  const onizleme = await ayse.al(r.headers.location);
  assert.match(onizleme.body, /<b>2<\/b> yeni kişi/); assert.match(onizleme.body, /<b>1<\/b> kayıtlı kişi/); assert.match(onizleme.body, /1 kişide telefon numarası olmadığı/);
  assert.equal((await mehmet.al(r.headers.location)).statusCode, 404, "ön izleme yalnızca yükleyene açık");
  const once = (await sistem((q) => q.bir("select count(*) as n from kisiler where sahip_id = $1 and silindi_at is null", [K.ayse]))).n;
  assert.equal((await ayse.gonder(r.headers.location)).statusCode, 302);
  const sonra = (await sistem((q) => q.bir("select count(*) as n from kisiler where sahip_id = $1 and silindi_at is null", [K.ayse]))).n;
  assert.equal(sonra - once, 2);
  const emre = await sistem((q) => q("select t.numara from kisiler k join kisi_telefonlari t on t.kisi_id = k.id where k.sahip_id = $1 and k.ad = 'Emre Komşu' order by t.ana desc", [K.ayse]));
  assert.deepEqual(emre.map((t) => t.numara), ["905331112233", "902324445566"]);
  const r2 = await ayse.dosyaGonder("/kisiler/yukle", {}, { alan: "dosya", ad: "rehber.vcf", mime: "text/vcard", icerik: vcf });
  await ayse.gonder(r2.headers.location);
  assert.equal((await sistem((q) => q.bir("select count(*) as n from kisiler where sahip_id = $1 and silindi_at is null", [K.ayse]))).n, sonra, "yeniden yüklemede yeni kayıt açılmaz");
});

test("belge: yalnızca PDF ve fotoğraf kabul edilir; başka danışman indiremez", async () => {
  const pdf = Buffer.from("%PDF-1.4\n%test\n");
  const r = await ayse.dosyaGonder("/belgeler", { mulk_id: V.mulk, tur: "tapu" }, { alan: "dosya", ad: "tapu.pdf", mime: "application/pdf", icerik: pdf });
  assert.equal(r.statusCode, 302, r.body.slice(0, 200));
  const b = await sistem((q) => q.bir("select id from belgeler where mulk_id = $1", [V.mulk]));
  assert.equal((await ayse.al("/belgeler/" + b.id)).statusCode, 200);
  assert.equal((await mehmet.al("/belgeler/" + b.id)).statusCode, 404);
  assert.equal((await mudur.al("/belgeler/" + b.id)).statusCode, 200);
  const kotu = await ayse.dosyaGonder("/belgeler", { mulk_id: V.mulk }, { alan: "dosya", ad: "x.pdf", mime: "application/pdf", icerik: "<html><script>alert(1)</script>" });
  assert.equal(kotu.statusCode, 400);
  const baskasi = await ayse.dosyaGonder("/belgeler", { mulk_id: V.mehmetMulk }, { alan: "dosya", ad: "tapu.pdf", mime: "application/pdf", icerik: pdf });
  assert.equal(baskasi.statusCode, 403);
});

test("kim tanıştırdı / kimden geldi: kendi rehberinden bağlanır ve iki yönde görünür; başka danışmanın kişisi bağlanamaz, adı hiçbir yoldan sızmaz", async () => {
  V.feride = idAl(await ayse.gonder("/kisiler", kisiFormu("Feride Emlakçı", "0555 666 00 01", { meslek: "Emlakçı" })));
  V.nurten = idAl(await ayse.gonder("/kisiler", kisiFormu("Nurten Olursa", "0555 666 00 02", { yatirimci_tipi: "olursa_alir", calisma_bolge: `${yer.ilce}:`, calisma_kategorileri: "konut", referans_kisi_id: V.feride, referans_notu: "Feride Hanım'ın eski müşterisi" })));
  const k = await sistem((q) => q.bir("select yatirimci_tipi, calisma_bolgeleri, calisma_kategorileri, referans_kisi_id, referans_notu from kisiler where id = $1", [V.nurten]));
  assert.deepEqual(k, { yatirimci_tipi: "olursa_alir", calisma_bolgeleri: [{ ilce: yer.ilce, mahalle: null }], calisma_kategorileri: ["konut"], referans_kisi_id: V.feride, referans_notu: "Feride Hanım'ın eski müşterisi" });
  const nurtenKart = await ayse.al(`/kisiler/${V.nurten}`);
  assert.match(nurtenKart.body, new RegExp(`<dt>Kim tanıştırdı</dt><dd><a href="/kisiler/${V.feride}">Feride Emlakçı</a> · Feride Hanım&#39;ın eski müşterisi</dd>`));
  assert.match(nurtenKart.body, /<dt>Tipi<\/dt><dd>olursa alır · Karşıyaka · konut<\/dd>/);
  assert.doesNotMatch(nurtenKart.body, /style="/);
  // Mülkü getiren kişi; mülkün sahibi belli değilse ofis mülkü olarak girer
  V.ferideMulk = idAl(await ayse.gonder("/mulkler", daireFormu({ ofis_mulku: "1", kaynak_kisi_id: V.feride, kaynak_notu: "komşusunun dairesi", baslik: "Feride'nin getirdiği daire", fiyat_tutar: "6.000.000", notlar: "anahtar kapıcıda" })));
  const ferideKart = await ayse.al(`/kisiler/${V.feride}`);
  assert.match(ferideKart.body, /Tanıştırdığı kişiler \(1\)/); assert.match(ferideKart.body, new RegExp(`href="/kisiler/${V.nurten}">Nurten Olursa</a><small>Feride Hanım&#39;ın eski müşterisi`));
  assert.match(ferideKart.body, /Getirdiği yerler \(1\)/); assert.match(ferideKart.body, new RegExp(`href="/mulkler/${V.ferideMulk}">Feride&#39;nin getirdiği daire`));
  const mulkKart = await ayse.al(`/mulkler/${V.ferideMulk}`);
  assert.match(mulkKart.body, new RegExp(`<dt>Kimden geldi</dt><dd><a href="/kisiler/${V.feride}">Feride Emlakçı</a> · komşusunun dairesi</dd>`));
  assert.match(mulkKart.body, /Talebi yok ama alabilir/); assert.match(mulkKart.body, /olursa alır, çalışma alanı uyuyor/, "“olursa alır” kişisi çalıştığı bölgede çıkan yerde aday gösterilir");
  assert.match((await ayse.al("/mulkler")).body, /getiren: Feride Emlakçı/);
  // Kişi kartındaki düğmeler formu hazır açar
  assert.match((await ayse.al(`/kisiler/yeni?referans=${V.feride}`)).body, new RegExp(`name="referans_kisi_id" value="${V.feride}"`));
  const hazir = await ayse.al(`/mulkler/yeni?kaynak=${V.feride}`);
  assert.match(hazir.body, new RegExp(`name="kaynak_kisi_id" value="${V.feride}"`)); assert.match(hazir.body, /name="ofis_mulku" value="1" checked/);
  assert.match((await ayse.al(`/kisiler/${V.nurten}/duzenle`)).body, new RegExp(`name="referans_kisi_id" value="${V.feride}"`));
  assert.match((await ayse.al(`/mulkler/${V.ferideMulk}/duzenle`)).body, new RegExp(`name="kaynak_kisi_id" value="${V.feride}"`));

  // Başka danışmanın kişisi tanıştıran ya da getiren olarak seçilemez; kişi kendi tanıştıranı olamaz
  for (const [yol, form] of [["/kisiler", kisiFormu("Sızma Denemesi", "0555 666 00 03", { referans_kisi_id: V.burak })], [`/kisiler/${V.nurten}`, kisiFormu("Nurten Olursa", "0555 666 00 02", { referans_kisi_id: V.burak })],
    [`/kisiler/${V.nurten}`, kisiFormu("Nurten Olursa", "0555 666 00 02", { referans_kisi_id: V.nurten })], ["/mulkler", daireFormu({ ofis_mulku: "1", baslik: "Sızma Denemesi", kaynak_kisi_id: V.burak })],
    [`/mulkler/${V.ferideMulk}`, daireFormu({ ofis_mulku: "1", kaynak_kisi_id: V.burak })]]) {
    assert.equal((await ayse.gonder(yol, form)).statusCode, 400, yol);
  }
  assert.equal((await sistem((q) => q("select 1 from kisiler where ad = 'Sızma Denemesi' union all select 1 from mulkler where baslik = 'Sızma Denemesi'"))).length, 0);
  assert.equal((await sistem((q) => q.bir("select referans_kisi_id from kisiler where id = $1", [V.nurten]))).referans_kisi_id, V.feride, "reddedilen istek bağlantıyı değiştirmez");
  assert.doesNotMatch((await ayse.al(`/kisiler/yeni?referans=${V.burak}`)).body, /Burak/);
  assert.doesNotMatch((await ayse.al(`/mulkler/yeni?kaynak=${V.burak}&kisi=${V.burak}`)).body, /Burak/);
  // Bağlantı veritabanında bir biçimde başkasının kişisini gösterse bile (hata, devir…) ad hiçbir ekrana gelmez: okuma kuralı korur
  await sistem(async (q) => {
    await q("update kisiler set referans_kisi_id = $2 where id = $1", [V.nurten, V.burak]);
    await q("update mulkler set kaynak_kisi_id = $2 where id = $1", [V.ferideMulk, V.burak]);
  });
  for (const yol of [`/kisiler/${V.nurten}`, `/kisiler/${V.nurten}/duzenle`, `/mulkler/${V.ferideMulk}`, `/mulkler/${V.ferideMulk}/duzenle`, "/mulkler", "/ara?q=burak", "/ara?q=daire"]) assert.doesNotMatch((await ayse.al(yol)).body, /Burak/, yol);
  const burakKart = await mehmet.al(`/kisiler/${V.burak}`);
  assert.equal(burakKart.statusCode, 200); assert.doesNotMatch(burakKart.body, /Nurten Olursa|getirdiği daire/, "karşı taraf da öbür danışmanın kişisini ve mülkünü göremez");
  assert.match(burakKart.body, /tanıştırdığı biri ya da getirdiği bir yer kayıtlı değil/);
  await sistem(async (q) => {
    await q("update kisiler set referans_kisi_id = $2 where id = $1", [V.nurten, V.feride]);
    await q("update mulkler set kaynak_kisi_id = $2 where id = $1", [V.ferideMulk, V.feride]);
  });
  // Tanıştıran silinince bağlantı danışmanın ekranından kalkar, yazdığı not kalır; mülkün durumu yine değiştirilebilir
  const araci = idAl(await ayse.gonder("/kisiler", kisiFormu("Silinecek Aracı", "0555 666 00 04")));
  const tanisan = idAl(await ayse.gonder("/kisiler", kisiFormu("Aracıyla Gelen", "0555 666 00 05", { referans_kisi_id: araci, referans_notu: "aracının yeğeni" })));
  const araciMulk = idAl(await ayse.gonder("/mulkler", daireFormu({ ofis_mulku: "1", kaynak_kisi_id: araci, kaynak_notu: "aracı getirdi", fiyat_tutar: "30.000.000" })));
  assert.equal((await ayse.gonder(`/kisiler/${araci}/sil`)).statusCode, 302);
  const tanisanKart = await ayse.al(`/kisiler/${tanisan}`);
  assert.match(tanisanKart.body, /<dt>Kim tanıştırdı<\/dt><dd>aracının yeğeni<\/dd>/); assert.doesNotMatch(tanisanKart.body, /Silinecek Aracı/);
  const araciMulkKart = await ayse.al(`/mulkler/${araciMulk}`);
  assert.match(araciMulkKart.body, /<dt>Kimden geldi<\/dt><dd>aracı getirdi<\/dd>/); assert.doesNotMatch(araciMulkKart.body, /Silinecek Aracı/);
  assert.equal((await ayse.gonder(`/mulkler/${araciMulk}/durum`, { durum: "pasif" })).statusCode, 302);
  assert.equal((await sistem((q) => q.bir("select durum from mulkler where id = $1", [araciMulk]))).durum, "pasif");
  assert.match((await patron.al(`/kisiler/${tanisan}`)).body, /Silinecek Aracı/, "kayıt sistem sahibinde durur");
  // Dışa aktarmada (yalnızca sistem sahibi) iki bağlantı da yer alır
  const csv = await patron.gonder("/yonetim/disa-aktar/kisiler");
  assert.match(csv.body.split("\r\n")[0], /tanistiran;referans_notu/); assert.match(csv.body, /Nurten Olursa.*Feride Emlakçı.*Feride Hanım'ın eski müşterisi/);
  assert.match((await patron.gonder("/yonetim/disa-aktar/mulkler")).body, /Feride Emlakçı;"?komşusunun dairesi/);
});

test("talebi yok ama alabilir: geçmiş ilgi yalnızca aynı tür ve aynı işlem (satılık / kiralık) için sayılır", async () => {
  // Üç kişi aynı ilçede daha önce bir şey sormuş: biri kiralık daire, biri satılık arsa, biri satılık daire
  const kisi = async (ad, tel, gorusme) => { const id = idAl(await ayse.gonder("/kisiler", kisiFormu(ad, tel))); assert.equal((await ayse.gonder(`/kisiler/${id}/gorusme`, { tarih: bugun(), ilce_id: String(yer.ilce), ...gorusme })).statusCode, 302); return id; };
  await kisi("Kiralık Soran", "0555 666 00 11", { kategori: "konut", islem: "kiralik", notu: "kiralık daire sordu" });
  await kisi("Arsa Soran", "0555 666 00 12", { kategori: "arsa", islem: "satilik", notu: "arsa sordu" });
  await kisi("Daire Soran", "0555 666 00 13", { kategori: "konut", islem: "satilik", notu: "satılık daire sordu" });
  await kisi("Türü Yazılmamış", "0555 666 00 14", { notu: "eski not, türü belli değil" });
  const kart = (await ayse.al(`/mulkler/${V.ferideMulk}`)).body;
  const adaylar = /Talebi yok ama alabilir[\s\S]*?<\/ul>/.exec(kart)[0];
  assert.match(adaylar, /Daire Soran/); assert.match(adaylar, /bu ilçede daha önce görüşüldü/);
  assert.match(adaylar, /Türü Yazılmamış/, "türü ve işlemi yazılmamış eski görüşme her mülk için sayılır");
  assert.doesNotMatch(adaylar, /Kiralık Soran/, "kiralık soran, satılık yer için aday gösterilmez");
  assert.doesNotMatch(adaylar, /Arsa Soran/, "arsa soran, daire için aday gösterilmez");
  const g = await sistem((q) => q.bir("select islem, kategori from gorusmeler where notu = 'kiralık daire sordu'"));
  assert.deepEqual(g, { islem: "kiralik", kategori: "konut" });
  assert.match((await ayse.al(`/kisiler/${V.nurten}`)).body, /Tanıştırdıkları ve getirdiği yerler/);
});

test("her şeyde arama: notta geçen söz bulunur; danışman yalnızca kendi kayıtlarında arar, mülk notunu yalnızca sahibi arar", async () => {
  assert.equal((await ayse.gonder(`/kisiler/${V.feride}/gorusme`, { tarih: bugun(), notu: "Ilıca'daki depo için tekrar arayacak", kategori: "is_yeri", islem: "kiralik" })).statusCode, 302);
  assert.equal((await ayse.gonder(`/kisiler/${V.nurten}/hatirlatma`, { tarih: bugun(), notu: "Tapu fotokopisi istenecek" })).statusCode, 302);
  V.gizli = idAl(await mehmet.gonder("/kisiler", kisiFormu("Gizli Müşteri", "0555 777 00 01", { notlar: "Ilıca'da depo arıyor; zeytinlik de olur", sirket: "Gizli İnşaat" })));
  assert.equal((await mehmet.gonder(`/kisiler/${V.gizli}/gorusme`, { tarih: bugun(), notu: "Ilıca depo kirası konuşuldu" })).statusCode, 302);
  await sistem((q) => q("update mulkler set notlar = 'Mehmet''in gizli notu: anahtar kapıcıda', baslik = 'Mehmet''in dairesi' where id = $1", [V.mehmetMulk]));

  const ara = (t, q, kimin = "") => t.al("/ara?q=" + encodeURIComponent(q) + (kimin ? "&kimin=" + kimin : ""));
  // Türkçe harf ve büyük-küçük harf fark etmez; sözcüklerin hepsi geçmeli; bulunan söz işaretlenir
  const r = await ara(ayse, "ILICA depo");
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Görüşme notları \(1\)/); assert.match(r.body, new RegExp(`href="/kisiler/${V.feride}">Feride Emlakçı</a>`));
  assert.match(r.body, /<mark>Ilıca<\/mark>&#39;daki <mark>depo<\/mark> için tekrar arayacak/);
  assert.doesNotMatch(r.body, /Gizli|zeytinlik|kirası/, "başka danışmanın kişisi ve notu çıkmaz");
  assert.doesNotMatch(r.body, /style="/);
  for (const kimin of ["hepsi", K.mehmet]) assert.doesNotMatch((await ara(ayse, "gizli", kimin)).body, /Gizli Müşteri|Gizli İnşaat/, "danışmanda kimin=" + kimin + " işe yaramaz");
  assert.match((await ara(ayse, "ılıca zeytinlik")).body, /kayıt bulunamadı/);
  // Kişi: ad, meslek, tanıştırma notu, telefon
  assert.match((await ara(ayse, "emlakci")).body, /Kişiler \(1\)[\s\S]*Feride Emlakçı/);
  assert.match((await ara(ayse, "eski müşterisi")).body, /Nurten Olursa[\s\S]*Feride Hanım&#39;ın <mark>eski<\/mark> <mark>müşterisi<\/mark>/);
  for (const numara of ["0555 666 00 02", "+90 555 666 00 02", "6660002"]) assert.match((await ara(ayse, numara)).body, /Kişiler \(1\)[\s\S]*Nurten Olursa/, numara);
  assert.doesNotMatch((await ara(ayse, "0555 777 00 01")).body, /Gizli/);
  // Mülk: başlık, ada / parsel, getiren kişi, not (yalnızca kendi mülkünde)
  const m = await ara(ayse, "anahtar kapıcıda");
  assert.match(m.body, /Mülkler \(1\)/); assert.match(m.body, /Feride&#39;nin getirdiği daire/); assert.match(m.body, /<mark>anahtar<\/mark> <mark>kapıcıda<\/mark>/); assert.doesNotMatch(m.body, /Mehmet/);
  assert.match((await ara(ayse, "100/7")).body, new RegExp(`Mülkler \\(1\\)[\\s\\S]*href="/mulkler/${V.mulk}"[\\s\\S]*ada 100 / parsel 7`));
  assert.match((await ara(ayse, "feride")).body, /Kişiler \(2\)[\s\S]*Feride Emlakçı[\s\S]*Nurten Olursa[\s\S]*Mülkler \(1\)[\s\S]*getiren: Feride Emlakçı/, "aracının adı: kendisi, tanıştırdığı kişi ve getirdiği yer birlikte gelir");
  assert.match((await ara(ayse, "karşıyaka daire")).body, /Mülkler \(\d+\)/, "ilçe adı ve tür de aranır");
  // Talep ve hatırlatma
  assert.match((await ara(ayse, "zeynep")).body, /Kişiler \(1\)[\s\S]*Talepler \(1\)[\s\S]*Zeynep Dar Bütçe · Satılık/);
  assert.match((await ara(ayse, "fotokopi")).body, /Hatırlatmalar \(1\)[\s\S]*Nurten Olursa[\s\S]*Tapu <mark>fotokopi<\/mark>si istenecek/, "sözcüğün yalnızca aranan kısmı işaretlenir");
  // Yönetici bütün ekipte arayabilir; başkasının mülk notu ona da aranmaz ve gösterilmez
  const y = await ara(mudur, "ılıca depo", "hepsi");
  assert.match(y.body, /Gizli Müşteri/); assert.match(y.body, /Feride Emlakçı/); assert.match(y.body, /Mehmet Danışman/); assert.match(y.body, /Ayşe Danışman/);
  assert.match((await ara(mudur, "ılıca depo", K.mehmet)).body, /Gizli Müşteri/); assert.doesNotMatch((await ara(mudur, "ılıca depo", K.mehmet)).body, /Feride Emlakçı/);
  assert.match((await ara(mudur, "ılıca depo")).body, /kayıt bulunamadı/, "yöneticinin kendi rehberinde yok");
  assert.match((await ara(mudur, "anahtar kapıcıda", "hepsi")).body, /kayıt bulunamadı/, "mülk notunu yalnızca sahibi görür ve arar");
  const yb = await ara(mudur, "mehmet dairesi", "hepsi");
  assert.match(yb.body, /Mülkler \(1\)/); assert.doesNotMatch(yb.body, /gizli notu/);
  assert.match((await ara(mehmet, "gizli notu")).body, /Mehmet&#39;in <mark>gizli<\/mark> <mark>notu<\/mark>/);
  // Silinen kişi danışmanın aramasında çıkmaz
  assert.match((await ara(ayse, "silinecek")).body, /kayıt bulunamadı/); assert.match((await ara(patron, "silinecek", "hepsi")).body, /Silinecek Aracı/);
  // Kötü niyetli ya da özel karakterli arama
  const x = await ara(ayse, '<script>alert(1)</script>"');
  assert.equal(x.statusCode, 200); assert.doesNotMatch(x.body, /<script>alert/); assert.match(x.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  for (const q of ["__", "%%", "\\\\", "'; drop table kisiler; --"]) { const o = await ara(ayse, q); assert.equal(o.statusCode, 200, q); assert.match(o.body, /kayıt bulunamadı/, q); }
  assert.match((await ara(ayse, "a")).body, /en az iki harf/);
  assert.match((await ayse.al("/ara")).body, /aynı anda arar/);
  // Arama kutusu her sayfanın üstünde; giriş yapmayan kişi arayamaz
  assert.match((await ayse.al("/kisiler")).body, /<form class="ust-ara" action="\/ara" method="get" role="search">/);
  assert.match(r.body, /name="q" value="ILICA depo"/);
  assert.equal((await new Tarayici().al("/ara?q=feride")).statusCode, 302);
});

test("toplu aktarım: Excel'deki kişi, geçmiş ilgi, talep, mülk ve aranacaklar yazılır; kayıtlı kişinin yalnızca boş alanı dolar; ikinci yüklemede hiçbir şey çift yazılmaz", async () => {
  const { aktarimHazirla } = await import("../src/lib/aktarim-hazirla.js");
  const { aktarimYaz } = await import("../src/servis/aktarim.js");
  const sayfa = (basliklar, ...satirlar) => [basliklar, ...satirlar.map((o) => { for (const b of Object.keys(o)) assert.ok(basliklar.includes(b), "başlık yok: " + b); return basliklar.map((b) => o[b] ?? ""); })];
  const sayfalar = {
    "Okuyun": [["Bu sayfa okunmaz"]],
    "Kişiler": sayfa(["Kişi No", "Ad Soyad", "Telefon", "Diğer telefonlar", "Şirket / Unvan", "Meslek", "Yatırımcı tipi", "Çalışma bölgeleri", "Çalışma türleri", "Alım gücü", "Alım gücü para", "Kim tanıştırdı / yakınlığı", "Tanıştıran Kişi No", "Hitap", "Notlar", "Aktar"],
      { "Kişi No": "A1", "Ad Soyad": "Aktarılan Aracı", "Telefon": "0555 880 00 01", "Meslek": "Emlakçı" },
      { "Kişi No": "A2", "Ad Soyad": "Aktarılan Yatırımcı", "Telefon": "0555 880 00 02", "Yatırımcı tipi": "Yatırımcı", "Çalışma bölgeleri": "Karşıyaka", "Çalışma türleri": "Konut", "Alım gücü": "12 milyon", "Alım gücü para": "TL",
        "Kim tanıştırdı / yakınlığı": "Aracı'nın müşterisi", "Tanıştıran Kişi No": "A1", "Notlar": "Mavişehir'de daire bakıyordu" },
      { "Kişi No": "A3", "Ad Soyad": "Feride (Excel'deki adı)", "Telefon": "0555 666 00 01", "Diğer telefonlar": "0555 880 00 03", "Meslek": "Müteahhit", "Yatırımcı tipi": "Al-satçı", "Çalışma türleri": "Arsa", "Hitap": "Abi", "Notlar": "Excel'deki not" },
      { "Kişi No": "A4", "Ad Soyad": "Alınmayacak Kurum", "Telefon": "0555 880 00 04", "Aktar": "Hayır" }),
    "Geçmiş ilgiler": sayfa(["Kişi No", "Ad Soyad", "Tarih", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Oda", "Sonuç", "Not", "Aktar"],
      { "Kişi No": "A2", "Tarih": "07.09.2023", "Satılık / Kiralık": "Satılık", "Kategori": "Konut", "Alt tür": "Daire", "İlçe": "Karşıyaka", "Sonuç": "İlgilendi", "Not": "Mavişehir'de 3+1 baktı" },
      { "Kişi No": "A2", "Tarih": 2021, "Not": "Eski bir arsa işi konuşuldu" },
      { "Kişi No": "A1", "Not": "Ne zaman olduğu bilinmeyen görüşme" },
      { "Kişi No": "A4", "Not": "kişisi alınmadığı için bu da alınmaz" }),
    "Talepler": sayfa(["Kişi No", "Ad Soyad", "Tarih", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Oda", "Bütçe (en çok)", "Para", "Nottan", "Aktar"],
      { "Kişi No": "A2", "Tarih": "01.10.2026", "Satılık / Kiralık": "Satılık", "Kategori": "Konut", "Alt tür": "Daire", "İlçe": "Karşıyaka", "Bütçe (en çok)": "10 milyon", "Para": "TL", "Nottan": "aktarılan talep" }),
    "Aranacaklar": sayfa(["Kişi No", "Ad Soyad", "Telefon", "Ne için aranacak", "Ne zaman", "Durum", "Not"],
      { "Kişi No": "A2", "Ne için aranacak": "Tapu günü sorulacak", "Durum": "Bekliyor" },
      { "Kişi No": "A1", "Ne için aranacak": "Çoktan arandı", "Durum": "Arandı" }),
    "Mülkler": sayfa(["Kişi No (sahibi)", "Ad Soyad", "Başlık", "Satılık / Kiralık", "Kategori", "Alt tür", "İl", "İlçe", "Mahalle", "Ada", "Parsel", "Alan m²", "Emsal", "Oda", "Fiyat", "Para", "Durum", "Kimden geldi", "Kaynak Kişi No", "Not tarihi", "Nottan", "Aktar"],
      { "Başlık": "Aktarılan tarla", "Satılık / Kiralık": "Satılık", "Kategori": "Arsa", "Alt tür": "Tarla", "İlçe": "Menderes", "Ada": 55, "Parsel": 3, "Alan m²": 4000, "Para": "TL", "Durum": "Arşiv", "Kimden geldi": "Aracı getirdi", "Kaynak Kişi No": "A1",
        "Not tarihi": "05.03.2024", "Nottan": "eski yer, fiyatı yazılmamış" },
      { "Kişi No (sahibi)": "A2", "Satılık / Kiralık": "Satılık", "Kategori": "Konut", "Alt tür": "Daire", "İlçe": "Karşıyaka", "Oda": "3+1", "Fiyat": 8000000, "Para": "TL", "Durum": "Satışta", "Nottan": "aktarılan daire" }),
    "Ofis grubu": [["Tarih", "Kim", "Kişi No", "Yer / Arayış / Sonuç"], ["01.01.2026", "Bir danışman", "", "Bu sayfa aktarılmaz"]],
  };
  const yaz = (q, danisman = "ayse@ornek.test", deneme = false) => q("select id, ad from iller").then(async (iller) => aktarimYaz(q, aktarimHazirla(sayfalar,
    { konum: { iller, ilceler: await q("select id, il_id, ad from ilceler"), mahalleler: await q("select id, ilce_id, ad from mahalleler") }, varsayilanDanisman: danisman }), { dosyaAdi: "deneme.xlsx", deneme }));
  const say = () => sistem((q) => q.bir(`select (select count(*) from kisiler) as kisi, (select count(*) from kisi_telefonlari) as telefon, (select count(*) from talepler) as talep, (select count(*) from mulkler) as mulk,
    (select count(*) from gorusmeler) as gorusme, (select count(*) from hatirlatmalar) as hatirlatma, (select count(*) from islem_kaydi where eylem = 'toplu_aktarim') as kayit`));
  const once = await say();

  // Hesabı olmayan danışman: hiçbir şey yazılmaz
  await assert.rejects(sistem((q) => yaz(q, "olmayan@ornek.test")), /hesabı olmayan danışman: olmayan@ornek\.test/);
  // Deneme: komut işlemi geri alır (scripts/aktar.js --yaz verilmeyince böyle çalışır)
  class Vazgec extends Error {}
  let deneme;
  await assert.rejects(sistem(async (q) => { deneme = await yaz(q, "ayse@ornek.test", true); throw new Vazgec(); }), Vazgec);
  assert.deepEqual([deneme.kisi, deneme.mevcut, deneme.talep, deneme.mulk, deneme.ilgi, deneme.hatirlatma], [2, 1, 1, 2, 3, 1]);
  assert.deepEqual(await say(), once, "deneme hiçbir şey yazmaz");

  const o = await sistem((q) => yaz(q));
  assert.deepEqual({ ...o, eslesme: null, alinmayan: null, uyarilar: null }, { kisi: 2, mevcut: 1, guncellenen: 1, telefon: 3, referans: 1, talep: 1, mulk: 2, ilgi: 3, hatirlatma: 1, ayni: 0, eslesme: null, alinmayan: null, uyarilar: null });
  assert.ok(o.eslesme > 0, "aktarımdan sonra eşleşmeler yeniden hesaplanır");
  assert.deepEqual(o.alinmayan.map((a) => `${a.sayfa}:${a.satir}:${a.neden}`), ["Kişiler:5:Aktar: Hayır", "Geçmiş ilgiler:5:“A4” numaralı kişi Kişiler sayfasında yok ya da aktarılmıyor", "Aranacaklar:3:Durum: Arandı"]);
  assert.deepEqual(o.uyarilar, []);

  const kisi = (ad) => sistem((q) => q.bir(`select k.*, to_char(k.son_temas_at, 'YYYY-MM-DD') as son_temas, (select array_agg(t.numara order by t.ana desc, t.numara) from kisi_telefonlari t where t.kisi_id = k.id and t.aktif) as numaralar,
    (select array_agg(t.ana order by t.ana desc, t.numara) from kisi_telefonlari t where t.kisi_id = k.id and t.aktif) as analar from kisiler k where k.ad = $1 and k.sahip_id = $2`, [ad, K.ayse]));
  const araci = await kisi("Aktarılan Aracı"), yatirimci = await kisi("Aktarılan Yatırımcı"), feride = await kisi("Feride Emlakçı");
  assert.equal(araci.meslek, "Emlakçı");
  assert.deepEqual([yatirimci.yatirimci_tipi, yatirimci.calisma_bolgeleri, yatirimci.calisma_kategorileri, yatirimci.alim_gucu_tutar, yatirimci.alim_gucu_para, yatirimci.alim_gucu_usd, yatirimci.referans_kisi_id, yatirimci.referans_notu],
    ["yatirimci", [{ ilce: yer.ilce, mahalle: null }], ["konut"], 12000000, "TRY", 300000, araci.id, "Aracı'nın müşterisi"]);
  assert.equal(yatirimci.son_temas, "2026-10-01", "son temas: günü belli olan en yeni ilgi ya da talep tarihi");
  // Rehberde zaten olan kişi: adı, mesleği, hitabı korunur; yalnızca boş alanlar dolar; yeni numarası eklenir
  assert.equal(feride.id, V.feride);
  assert.deepEqual([feride.meslek, feride.hitap_turu, feride.notlar, feride.yatirimci_tipi, feride.calisma_kategorileri], ["Emlakçı", "bey", "Excel'deki not", "al_satci", ["arsa"]]);
  assert.deepEqual([feride.numaralar, feride.analar], [["905556660001", "905558800003"], [true, false]]);
  assert.equal((await sistem((q) => q("select 1 from kisiler where ad like 'Feride (Excel%' or ad like 'Alınmayacak%'"))).length, 0);

  const gorusmeler = await sistem((q) => q("select g.tarih, g.tarih_yaklasik, g.tur, g.islem, g.kategori, g.alt_tur, g.ilce_id, g.sonuc, g.notu, g.sahip_id from gorusmeler g where g.kisi_id = any($1::uuid[]) order by g.notu", [[araci.id, yatirimci.id]]));
  assert.deepEqual(gorusmeler, [
    { tarih: "2021-01-01", tarih_yaklasik: true, tur: "gorusme", islem: null, kategori: null, alt_tur: null, ilce_id: null, sonuc: null, notu: "Eski bir arsa işi konuşuldu", sahip_id: K.ayse },
    { tarih: "2023-09-07", tarih_yaklasik: false, tur: "gorusme", islem: "satilik", kategori: "konut", alt_tur: "daire", ilce_id: yer.ilce, sonuc: "ilgilendi", notu: "Mavişehir'de 3+1 baktı", sahip_id: K.ayse },
    { tarih: null, tarih_yaklasik: false, tur: "gorusme", islem: null, kategori: null, alt_tur: null, ilce_id: null, sonuc: null, notu: "Ne zaman olduğu bilinmeyen görüşme", sahip_id: K.ayse }]);
  const talep = await sistem((q) => q.bir("select t.*, to_char(t.son_teyit_at, 'YYYY-MM-DD') as teyit from talepler t where t.kisi_id = $1", [yatirimci.id]));
  assert.deepEqual([talep.sahip_id, talep.islem, talep.kategoriler, talep.alt_turler, talep.bolgeler, talep.butce_max_tutar, talep.butce_max_usd, talep.notlar, talep.teyit, talep.durum],
    [K.ayse, "satilik", ["konut"], ["konut:daire"], [{ ilce: yer.ilce, mahalle: null }], 10000000, 250000, "aktarılan talep", "2026-10-01", "aktif"]);
  const tarla = await sistem((q) => q.bir("select m.*, to_char(m.olusturma_at, 'YYYY-MM-DD') as geldi, i.ad as ilce from mulkler m join ilceler i on i.id = m.ilce_id where m.baslik = 'Aktarılan tarla'"));
  assert.deepEqual([tarla.sahip_id, tarla.ofis_mulku, tarla.malik_kisi_id, tarla.durum, tarla.kategori, tarla.alt_tur, tarla.ilce, tarla.ada, tarla.parsel, tarla.fiyat_tutar, tarla.ozellikler, tarla.kaynak_kisi_id, tarla.kaynak_notu, tarla.geldi, tarla.notlar],
    [K.ayse, true, null, "pasif", "arsa", "tarla", "Menderes", "55", "3", null, { m2: 4000 }, araci.id, "Aracı getirdi", "2024-03-05", "eski yer, fiyatı yazılmamış"]);
  const daire = await sistem((q) => q.bir("select * from mulkler where notlar = 'aktarılan daire'"));
  assert.deepEqual([daire.malik_kisi_id, daire.ofis_mulku, daire.durum, daire.fiyat_tutar, daire.ozellikler], [yatirimci.id, false, "aktif", 8000000, { oda: "3+1" }]);
  assert.ok((await sistem((q) => q("select 1 from eslesmeler where talep_id = $1 and gecerli", [talep.id]))).length >= 1, "aktarılan talep eldeki dairelerle eşleşir");
  assert.equal((await sistem((q) => q("select 1 from eslesmeler where mulk_id = $1 and gecerli", [tarla.id]))).length, 0, "arşivdeki yer eşleştirmeye girmez");
  const hat = await sistem((q) => q.bir("select tarih, notu, sahip_id, tamamlandi_at from hatirlatmalar where kisi_id = $1", [yatirimci.id]));
  assert.deepEqual(hat, { tarih: bugun(), notu: "Tapu günü sorulacak", sahip_id: K.ayse, tamamlandi_at: null });
  const kayit = await sistem((q) => q.bir("select kullanici_id, ayrinti from islem_kaydi where eylem = 'toplu_aktarim'"));
  assert.equal(kayit.kullanici_id, null); assert.equal(kayit.ayrinti.dosya, "deneme.xlsx"); assert.equal(kayit.ayrinti.kisi, 2); assert.equal(kayit.ayrinti.alinmayan, 3);

  // Ekranda: tarihi bilinmeyen ve yalnızca yılı bilinen görüşme; danışmanın bugünkü listesi; arama; gizlilik
  const yKart = (await ayse.al(`/kisiler/${yatirimci.id}`)).body;
  assert.match(yKart, /7 Eylül 2023 · Görüşme · İlgilendi/); assert.match(yKart, /<span class="ad">2021 · Görüşme<\/span>/); assert.match(yKart, /Karşıyaka · Daire/);
  assert.match(yKart, new RegExp(`<dt>Kim tanıştırdı</dt><dd><a href="/kisiler/${araci.id}">Aktarılan Aracı</a>`)); assert.match(yKart, /Tapu günü sorulacak/);
  const aKart = (await ayse.al(`/kisiler/${araci.id}`)).body;
  assert.match(aKart, /tarihi bilinmiyor · Görüşme/); assert.match(aKart, /Tanıştırdığı kişiler \(1\)/); assert.match(aKart, /Getirdiği yerler \(1\)[\s\S]*Aktarılan tarla[\s\S]*Pasif/);
  assert.match((await ayse.al("/")).body, /Aktarılan Yatırımcı/, "aranacak kişi bugünkü listede");
  const bulunan = (await ayse.al("/ara?q=" + encodeURIComponent("mavişehir"))).body;
  assert.match(bulunan, /Kişiler \(1\)[\s\S]*Aktarılan Yatırımcı/); assert.doesNotMatch(bulunan, /Görüşme notları/, "kişisi zaten listelenen görüşme ayrıca yinelenmez");
  assert.match((await ayse.al("/ara?q=" + encodeURIComponent("eski arsa işi"))).body, /Görüşme notları \(1\)[\s\S]*Aktarılan Yatırımcı<\/a><small>2021<\/small>/);
  assert.match((await ayse.al("/ara?q=" + encodeURIComponent("55/3 tarla"))).body, /Mülkler \(1\)[\s\S]*Aktarılan tarla[\s\S]*ada 55 \/ parsel 3[\s\S]*Pasif/);
  assert.equal((await mehmet.al(`/kisiler/${yatirimci.id}`)).statusCode, 404);
  assert.match((await mehmet.al("/ara?q=" + encodeURIComponent("aktarılan"))).body, /kayıt bulunamadı/);

  // Aynı kitap ikinci kez yüklenirse hiçbir şey çift yazılmaz
  const ara1 = await say();
  const o2 = await sistem((q) => yaz(q));
  assert.deepEqual({ ...o2, eslesme: null, alinmayan: null, uyarilar: null }, { kisi: 0, mevcut: 3, guncellenen: 0, telefon: 0, referans: 0, talep: 0, mulk: 0, ilgi: 0, hatirlatma: 0, ayni: 7, eslesme: null, alinmayan: null, uyarilar: null });
  assert.deepEqual(await say(), { ...ara1, kayit: ara1.kayit + 1 });
  // Danışman Satal'da bir şeyi değiştirdiyse yeniden yükleme üstüne yazmaz
  await ayse.gonder(`/kisiler/${yatirimci.id}`, kisiFormu("Aktarılan Yatırımcı", "0555 880 00 02", { notlar: "Satal'da elle yazılan not", meslek: "Doktor", referans_kisi_id: araci.id, referans_notu: "Aracı'nın müşterisi" }));
  await sistem((q) => yaz(q));
  const sonra = await kisi("Aktarılan Yatırımcı");
  assert.deepEqual([sonra.notlar, sonra.meslek, sonra.hitap_turu], ["Satal'da elle yazılan not", "Doktor", "bey"]);
});

test("üyelik: davet → e-posta ile şifre belirleme → yönetici onayı → giriş; yanlış şifre ve onaysız giriş reddedilir", async () => {
  hizTemizle();
  const d = await mudur.gonder("/yonetim/davet", { eposta: "yeni@ornek.test" });
  assert.equal(d.statusCode, 200);
  const davet = /\/davet\/([\w-]+)/.exec(d.body)[1];
  const t = new Tarayici();
  assert.equal((await t.al("/davet/" + davet)).statusCode, 200);
  assert.equal((await t.al("/davet/uydurma")).statusCode, 410);
  const basvuru = await t.gonder("/davet/" + davet, { ad: "Yeni Danışman", telefon: "0555 777 88 99", yol: "eposta" });
  assert.equal(basvuru.statusCode, 200); assert.match(basvuru.body, /E-postanızı kontrol edin/);
  assert.equal((await t.al("/davet/" + davet)).statusCode, 410, "davet bir kez kullanılır");
  const posta = denemeKutusu.findLast((m) => m.kime === "yeni@ornek.test");
  const sifreYolu = /\/sifre\/[\w-]+/.exec(posta.metin)[0];
  assert.equal((await t.gonder(sifreYolu, { sifre: "kisa", sifre2: "kisa" })).statusCode, 400);
  const s = await t.gonder(sifreYolu, { sifre: "uzun-bir-parola-1", sifre2: "uzun-bir-parola-1" });
  assert.match(s.body, /yönetici onayı bekliyor/);
  assert.ok(denemeKutusu.some((m) => m.kime === "mudur@ornek.test" && /onay bekliyor/.test(m.konu)), "yöneticiye haber gider");
  const giris = (sifre) => t.gonder("/giris", { eposta: "yeni@ornek.test", sifre });
  let r = await giris("uzun-bir-parola-1");
  assert.match(decodeURIComponent(r.cookies.find((c) => c.name === "satal_bildirim").value), /onayı bekliyor/); assert.ok(!t.cerez.satal_oturum);
  const yeniId = (await sistem((q) => q.bir("select id from kullanicilar where eposta = 'yeni@ornek.test'"))).id;
  assert.equal((await mudur.gonder(`/yonetim/kullanici/${yeniId}/onay`)).statusCode, 302);
  r = await giris("yanlis-parola-123");
  assert.ok(!t.cerez.satal_oturum);
  r = await giris("uzun-bir-parola-1");
  assert.ok(t.cerez.satal_oturum, "onaydan sonra giriş yapılır");
  assert.equal((await t.al("/")).headers.location, "/gizlilik-onay", "ilk girişte gizlilik beyanı");
  assert.equal((await t.al("/kisiler")).headers.location, "/gizlilik-onay");
  await t.gonder("/gizlilik-onay", { onay: "1" });
  assert.equal((await t.al("/")).statusCode, 200);
  // Hesap kapatılınca açık oturum da düşer
  await mudur.gonder(`/yonetim/kullanici/${yeniId}/kapat`);
  assert.equal((await t.al("/")).statusCode, 302);
  r = await giris("uzun-bir-parola-1");
  assert.ok(!t.cerez.satal_oturum);
  // Yönetici şifreyle giremez (şifresi olsa bile)
  const { sifreHash } = await import("../src/kimlik.js");
  await sistem((q) => q("update kullanicilar set sifre_hash = $1 where id = $2", [sifreHash("mudur-parolasi-1"), K.mudur]));
  const y = new Tarayici(); await y.al("/giris");
  await y.gonder("/giris", { eposta: "mudur@ornek.test", sifre: "mudur-parolasi-1" });
  assert.ok(!y.cerez.satal_oturum, "yöneticiler yalnızca Google ile girer");
});

test("çok sayıda hatalı giriş denemesi engellenir", async () => {
  hizTemizle();
  const t = new Tarayici(); await t.al("/giris");
  let son;
  for (let i = 0; i < 12; i++) son = await t.gonder("/giris", { eposta: "ayse@ornek.test", sifre: "tahmin-" + i });
  assert.equal(son.statusCode, 429);
  hizTemizle();
});

test("Google ile giriş: sahte kimlik reddedilir, davetsiz hesap açılmaz, davet başka hesapla kullanılamaz", async () => {
  const googleIle = async (t, kimlik, baslangic = "/giris/google") => {
    const r = await t.al(baslangic);
    const u = new URL(r.headers.location);
    sonrakiKimlik = { nonce: u.searchParams.get("nonce"), ...kimlik };
    return t.al(`/giris/google/donus?state=${u.searchParams.get("state")}&code=abc`);
  };
  const hata = (r) => decodeURIComponent(r.cookies.find((c) => c.name === "satal_bildirim")?.value || "");
  // Kayıtlı yönetici girer
  let t = new Tarayici();
  let r = await googleIle(t, { sub: "g-mudur", email: "mudur@ornek.test", email_verified: true, name: "Müdür" });
  assert.equal(r.statusCode, 302); assert.ok(t.cerez.satal_oturum);
  // Davetsiz yabancı
  t = new Tarayici();
  r = await googleIle(t, { sub: "g-yabanci", email: "yabanci@ornek.test", email_verified: true });
  assert.ok(!t.cerez.satal_oturum); assert.match(hata(r), /kayıtlı bir üyelik yok/);
  // Doğrulanmamış e-posta
  t = new Tarayici();
  r = await googleIle(t, { sub: "g-x", email: "ayse@ornek.test", email_verified: false });
  assert.ok(!t.cerez.satal_oturum);
  // Yanlış nonce (yeniden oynatma)
  t = new Tarayici();
  const b = await t.al("/giris/google"); const u = new URL(b.headers.location);
  sonrakiKimlik = { nonce: "baska", sub: "g-mudur", email: "mudur@ornek.test", email_verified: true };
  await t.al(`/giris/google/donus?state=${u.searchParams.get("state")}&code=abc`);
  assert.ok(!t.cerez.satal_oturum);
  // Uydurma state
  r = await new Tarayici().al("/giris/google/donus?state=uydurma&code=abc");
  assert.equal(r.headers.location, "/giris");
  // Davet yalnızca gönderildiği adresin Google hesabıyla kullanılır
  const d = await mudur.gonder("/yonetim/davet", { eposta: "davetli@ornek.test" });
  const davet = /\/davet\/([\w-]+)/.exec(d.body)[1];
  const basla = async (tt) => { await tt.al("/davet/" + davet); return tt.gonder("/davet/" + davet, { ad: "Davetli Kişi", telefon: "05556667788", yol: "google" }); };
  t = new Tarayici();
  let yon = await basla(t); let uu = new URL(yon.headers.location);
  sonrakiKimlik = { nonce: uu.searchParams.get("nonce"), sub: "g-baskasi", email: "baskasi@ornek.test", email_verified: true };
  r = await t.al(`/giris/google/donus?state=${uu.searchParams.get("state")}&code=abc`);
  assert.match(hata(r), /davetli@ornek\.test adresi için/);
  assert.equal((await sistem((q) => q("select 1 from kullanicilar where eposta = 'baskasi@ornek.test'"))).length, 0);
  t = new Tarayici();
  yon = await basla(t); uu = new URL(yon.headers.location);
  sonrakiKimlik = { nonce: uu.searchParams.get("nonce"), sub: "g-davetli", email: "davetli@ornek.test", email_verified: true };
  r = await t.al(`/giris/google/donus?state=${uu.searchParams.get("state")}&code=abc`);
  assert.match(r.body, /Onay bekleniyor/); assert.ok(!t.cerez.satal_oturum);
});

test("sistem sahibi: ayarlar, dışa aktarma, kalıcı silme (KVKK); hepsi işlem kaydına yazılır", async () => {
  const csv = await patron.gonder("/yonetim/disa-aktar/kisiler");
  assert.equal(csv.statusCode, 200); assert.match(csv.headers["content-type"], /text\/csv/); assert.match(csv.body, /Burak Alıcı/); assert.match(csv.body, /Hülya Malik/);
  const a = await patron.gonder("/yonetim/ayarlar", { ag_oturum_konum: "50", ag_oturum_ozellik: "40", ag_oturum_alt_tur: "15", ag_ticari_konum: "35", ag_ticari_ozellik: "50", ag_ticari_alt_tur: "15", kb_tam: "45", kb_komsu_mahalle: "32", kb_ayni_ilce: "18", kb_komsu_ilce: "7",
    butce_payi: "10", sinir_a: "80", sinir_b: "60", sinir_c: "40", gunluk_mesaj_siniri: "20", talep_teyit_ay: "3", aranmayan_gun: "60" });
  assert.equal(a.statusCode, 400, "toplamı 100 etmeyen dağılım kabul edilmez");
  // "Beni silin": numaranın geçtiği bütün kayıtlar (iki danışmanda da) kalıcı silinir
  const r = await patron.gonder("/yonetim/kalici-sil", { telefon: "0555 111 22 33", neden: "Kişinin talebi" });
  assert.equal(r.statusCode, 302);
  assert.equal((await sistem((q) => q("select 1 from kisi_telefonlari where numara = '905551112233'"))).length, 0);
  assert.equal((await sistem((q) => q("select 1 from kisiler where id = any($1::uuid[])", [[V.ahmet, V.ahmetYeni, V.mehmetAhmet]]))).length, 0);
  assert.equal((await sistem((q) => q("select 1 from talepler where id = $1", [V.talep]))).length, 0);
  assert.equal((await sistem((q) => q("select 1 from kalici_silme_kaydi"))).length, 3);
  const kayit = await patron.al("/yonetim/kayit");
  assert.match(kayit.body, /Dışa aktardı/); assert.match(kayit.body, /Kalıcı sildi/);
});

test("ayrılan danışman: hesap kapanır, rehberi devredilir, çakışan numara çift kayıt yaratmaz", async () => {
  assert.equal((await patron.gonder(`/yonetim/kullanici/${K.mehmet}/kapat`)).statusCode, 302);
  assert.equal((await mehmet.al("/kisiler")).statusCode, 302, "kapatılan hesabın oturumu düşer");
  assert.equal((await mudur.gonder(`/yonetim/kullanici/${K.mehmet}/devret`, { hedef: K.ayse })).statusCode, 403, "devri yalnızca sistem sahibi yapar");
  assert.equal((await patron.gonder(`/yonetim/kullanici/${K.mehmet}/devret`, { hedef: K.ayse })).statusCode, 302);
  assert.equal((await ayse.al(`/kisiler/${V.burak}`)).statusCode, 200, "devralan danışman artık görür");
  assert.equal((await sistem((q) => q("select 1 from kisiler where sahip_id = $1", [K.mehmet]))).length, 0);
  assert.ok((await sistem((q) => q("select 1 from eslesmeler where gecerli and talep_sahip_id <> mulk_sahip_id"))).length === 0);
});
