// Satal CRM sunucusu.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import statik from "@fastify/static";
import { ayar } from "./ayar.js";
import { sistem, kapat } from "./db.js";
import { CEREZ, oturumKullanicisi, jetonUret, sabitKarsilastir } from "./kimlik.js";
import { html } from "./lib/html.js";
import { sayfa } from "./gorunum/duzen.js";
import { KullaniciHatasi } from "./servis/ortak.js";
import girisRotalari from "./rotalar/giris.js";
import anaRotalar from "./rotalar/ana.js";
import kisiRotalari from "./rotalar/kisiler.js";
import mulkRotalari from "./rotalar/mulkler.js";
import talepRotalari from "./rotalar/talepler.js";
import mesajRotalari from "./rotalar/mesaj.js";
import yonetimRotalari from "./rotalar/yonetim.js";
import araRotalari from "./rotalar/ara.js";
import { zamanlayiciBaslat } from "./servis/zamanli.js";

const SURUM = crypto.createHash("sha1").update(fs.readFileSync(new URL("./statik/stil.css", import.meta.url))).update(fs.readFileSync(new URL("./statik/uygulama.js", import.meta.url))).digest("hex").slice(0, 8);
const CSRF_CEREZ = "satal_csrf";
const BILDIRIM_CEREZ = "satal_bildirim";

export async function uygulamaKur() {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    logger: ayar.uretim ? { level: "info", redact: ["req.headers.cookie", "req.headers.authorization"] } : false,
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, { attachFieldsToBody: true, limits: { fileSize: 15 * 1024 * 1024, files: 4, fields: 20000, fieldSize: 4 * 1024 * 1024 } });
  await app.register(statik, { root: path.join(import.meta.dirname, "statik"), prefix: "/statik/", maxAge: "30d", immutable: true });

  app.decorateRequest("kullanici", null);
  app.decorateRequest("csrf", "");
  app.decorateRequest("bildirim", null);
  app.decorateRequest("form", null);
  app.decorateRequest("surum", SURUM);
  // Sonraki sayfada bir kez gösterilecek kısa bildirim
  app.decorateReply("bildir", function (metin, tur = "tamam") {
    this.setCookie(BILDIRIM_CEREZ, JSON.stringify({ metin, tur }), { path: "/", httpOnly: true, sameSite: "lax", secure: ayar.uretim, maxAge: 60 });
    return this;
  });
  app.decorateReply("sayfa", function (govde) { return this.type("text/html; charset=utf-8").send(String(govde)); });

  app.addHook("onRequest", async (req, reply) => {
    reply.headers({
      "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "same-origin",
      "permissions-policy": "geolocation=(), camera=(), microphone=()",
    });
    if (ayar.uretim) reply.header("strict-transport-security", "max-age=31536000");
    if (!req.url.startsWith("/statik/")) reply.header("cache-control", "no-store");
    let csrf = req.cookies[CSRF_CEREZ];
    if (!csrf || csrf.length < 20) {
      csrf = jetonUret();
      reply.setCookie(CSRF_CEREZ, csrf, { path: "/", httpOnly: true, sameSite: "lax", secure: ayar.uretim, maxAge: 400 * 86400 });
    }
    req.csrf = csrf;
    const b = req.cookies[BILDIRIM_CEREZ];
    if (b && req.method === "GET" && !req.url.startsWith("/statik/") && req.headers.accept?.includes("text/html")) {
      try { req.bildirim = JSON.parse(b); } catch { /* bozuk çerez */ }
      reply.clearCookie(BILDIRIM_CEREZ, { path: "/" });
    }
  });

  app.addHook("preHandler", async (req, reply) => {
    const cfg = req.routeOptions.config || {};
    // Form gövdesini tek biçime getir (çok parçalı yüklemelerde alanlar nesne olarak gelir)
    if (req.body && typeof req.body === "object") {
      const f = {};
      for (const [k, v] of Object.entries(req.body)) {
        const cevir = async (x) => {
          if (x && typeof x === "object" && x.type === "file") return x.filename ? { dosyaAdi: x.filename, mime: x.mimetype, veri: await x.toBuffer() } : null;
          if (x && typeof x === "object" && x.type === "field") return String(x.value ?? "");
          return typeof x === "string" ? x : x == null ? "" : x;
        };
        f[k] = Array.isArray(v) ? (await Promise.all(v.map(cevir))).filter((x) => x !== null) : await cevir(v);
      }
      req.form = f;
    } else req.form = {};

    // Durum değiştiren her istekte: aynı siteden gelmeli ve gizli form anahtarı tutmalı
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const kaynak = req.headers.origin;
      if (kaynak && kaynak !== new URL(ayar.adres).origin && kaynak !== `${req.protocol}://${req.host}`) throw new KullaniciHatasi("İstek kabul edilmedi.", 403);
      const gelen = req.form._csrf || req.headers["x-csrf"];
      if (!sabitKarsilastir(gelen, req.csrf)) throw new KullaniciHatasi("Oturum süresi doldu ya da sayfa eskidi. Sayfayı yenileyip tekrar deneyin.", 403);
    }

    const jeton = req.cookies[CEREZ];
    if (jeton) {
      const k = await sistem(async (q) => {
        const u = await oturumKullanicisi(q, jeton);
        if (u) await q("update oturumlar set son_gorulme_at = now() where id = $1 and son_gorulme_at < now() - interval '10 minutes'", [u.oturum_id]);
        return u;
      });
      if (k) req.kullanici = k;
      else reply.clearCookie(CEREZ, { path: "/" });
    }
    if (cfg.acik || req.url.startsWith("/statik/")) return;
    if (!req.kullanici) {
      if (req.method === "GET" && req.headers.accept?.includes("text/html")) return reply.redirect("/giris" + (req.url !== "/" ? "?sonra=" + encodeURIComponent(req.url) : ""));
      throw new KullaniciHatasi("Giriş yapmanız gerekiyor.", 401);
    }
    if (!req.kullanici.gizlilik_onay_at && !cfg.gizlilikOncesi) return reply.redirect("/gizlilik-onay");
    if (cfg.rol && !cfg.rol.includes(req.kullanici.rol)) throw new KullaniciHatasi("Bu sayfayı görme yetkiniz yok.", 403);
    if (cfg.modul && !req.kullanici.moduller?.[cfg.modul] && req.kullanici.rol !== "sahip") throw new KullaniciHatasi("Bu bölüm hesabınızda açık değil.", 403);
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).sayfa(sayfa(req, { baslik: "Bulunamadı", dar: true, icerik: html`<div class="kart"><h1>Sayfa bulunamadı</h1><p>Aradığınız kayıt silinmiş ya da size ait olmayabilir.</p><p><a class="dugme" href="/">Ana ekrana dön</a></p></div>` }));
  });
  app.setErrorHandler((hata, req, reply) => {
    const kullaniciya = hata.kullaniciya || hata.statusCode === 413 || hata.code === "FST_REQ_FILE_TOO_LARGE";
    const kod = hata.kod || hata.statusCode || 500;
    let mesaj = hata.kullaniciya ? hata.message : kullaniciya ? "Dosya çok büyük (en çok 15 MB)." : "Beklenmeyen bir hata oldu. Tekrar deneyin; sürerse yöneticiye haber verin.";
    if (hata.code === "23505") mesaj = "Bu kayıt zaten var.";
    if (!kullaniciya && hata.code !== "23505") (req.log?.error ? req.log.error(hata) : console.error(hata));
    if (req.headers.accept?.includes("application/json") && !req.headers.accept.includes("text/html")) return reply.code(kod).send({ hata: mesaj });
    // Form gönderimlerinde: geldiği sayfaya dön ve hatayı orada göster
    const geri = req.headers.referer;
    if (req.method !== "GET" && geri && kod !== 401) {
      try {
        const u = new URL(geri);
        if (u.hostname === req.hostname) return reply.bildir(mesaj, "hata").redirect(u.pathname + u.search);
      } catch { /* geçersiz adres */ }
    }
    reply.code(kod >= 400 && kod < 600 ? kod : 500).sayfa(sayfa(req, { baslik: "Hata", dar: true, icerik: html`<div class="kart"><h1>Olmadı</h1><p>${mesaj}</p><p><a class="dugme" href="/">Ana ekrana dön</a></p></div>` }));
  });

  app.get("/saglik", { config: { acik: true } }, async () => {
    await sistem((q) => q("select 1"));
    return { durum: "tamam" };
  });
  app.get("/sw.js", { config: { acik: true } }, (req, reply) => reply.type("text/javascript").header("cache-control", "no-cache").sendFile("sw.js"));
  app.get("/robots.txt", { config: { acik: true } }, (req, reply) => reply.type("text/plain").send("User-agent: *\nDisallow: /\n"));

  for (const r of [girisRotalari, anaRotalar, kisiRotalari, mulkRotalari, talepRotalari, mesajRotalari, yonetimRotalari, araRotalari]) await app.register(r);
  return app;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const app = await uygulamaKur();
  await app.listen({ port: ayar.port, host: "0.0.0.0" });
  zamanlayiciBaslat();
  console.log(`Satal ${ayar.adres} adresinde çalışıyor`);
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, async () => { await app.close(); await kapat(); process.exit(0); });
}
