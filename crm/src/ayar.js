// Ortam ayarları. Gizli değerler (şifreler, anahtarlar) yalnızca sunucudaki .env dosyasında durur; depoya yazılmaz.
const e = process.env;
const uretim = e.NODE_ENV === "production";
const liste = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

export const ayar = {
  uretim,
  port: Number(e.PORT || 3000),
  adres: (e.SITE_ADRESI || "http://localhost:" + (e.PORT || 3000)).replace(/\/$/, ""),
  veritabani: e.DATABASE_URL || "postgres://satal_app:satal_app@localhost:5432/satal",
  veritabaniYonetim: e.MIGRATE_DATABASE_URL || e.DATABASE_URL_YONETIM || "postgres://postgres@localhost:5432/satal",
  uygulamaDbSifresi: e.APP_DB_PASSWORD || (uretim ? "" : "satal_app"),
  // İlk yönetici hesapları: bu adreslerle "Google ile giriş" yapan kişi doğrudan yetkilendirilir.
  sahipEposta: liste(e.SAHIP_EPOSTA)[0] || "",
  yoneticiEpostalari: liste(e.YONETICI_EPOSTALARI),
  google: {
    istemciId: e.GOOGLE_CLIENT_ID || "",
    istemciSifresi: e.GOOGLE_CLIENT_SECRET || "",
    yetkiAdresi: e.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
    jetonAdresi: e.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
    anahtarAdresi: e.GOOGLE_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs",
    yayinci: liste(e.GOOGLE_ISSUER || "https://accounts.google.com,accounts.google.com"),
  },
  eposta: {
    sunucu: e.SMTP_HOST || "",
    port: Number(e.SMTP_PORT || 587),
    kullanici: e.SMTP_USER || "",
    sifre: e.SMTP_PASS || "",
    gonderen: e.SMTP_FROM || "Satal <satal@localhost>",
  },
  yuklemeKlasoru: e.YUKLEME_KLASORU || new URL("../veri/yuklemeler", import.meta.url).pathname,
  anthropicAnahtari: e.ANTHROPIC_API_KEY || "",
  claudeModeli: e.CLAUDE_MODELI || "claude-opus-5-5",
  kurAdresi: e.KUR_ADRESI || "https://www.tcmb.gov.tr/kurlar/today.xml",
  kurOtomatik: e.KUR_OTOMATIK !== "0",
  // Yalnızca geliştirme ve otomatik testler için: Google olmadan seçilen kullanıcıyla giriş. Yayında her zaman kapalıdır.
  denemeGirisi: !uretim && e.DENEME_GIRISI === "1",
  oturumGun: 30,
};
