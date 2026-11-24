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
