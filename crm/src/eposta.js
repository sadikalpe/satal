// E-posta gönderimi. SMTP ayarı yoksa (geliştirme ve testler) gönderilmez, bellekteki kutuya yazılır.
import nodemailer from "nodemailer";
import { ayar } from "./ayar.js";

export const denemeKutusu = [];
let tasiyici = null;
function tasiyiciAl() {
  if (!ayar.eposta.sunucu) return null;
  if (!tasiyici) {
    tasiyici = nodemailer.createTransport({
      host: ayar.eposta.sunucu, port: ayar.eposta.port, secure: ayar.eposta.port === 465,
      auth: ayar.eposta.kullanici ? { user: ayar.eposta.kullanici, pass: ayar.eposta.sifre } : undefined,
    });
  }
  return tasiyici;
}
export async function epostaGonder({ kime, konu, metin }) {
  const t = tasiyiciAl();
  if (!t) {
    denemeKutusu.push({ kime, konu, metin, at: new Date() });
    if (denemeKutusu.length > 200) denemeKutusu.shift();
    if (!ayar.uretim && process.env.EPOSTA_GOSTER === "1") console.log(`[e-posta] ${kime} · ${konu}\n${metin}\n`);
    return { deneme: true };
  }
  return t.sendMail({ from: ayar.eposta.gonderen, to: kime, subject: konu, text: metin });
}
const imza = "\n\nSatal — STA Gayrimenkul";
export const sablonlar = {
  davet: (baglanti, davetEden) => ({
    konu: "Satal'a davet edildiniz",
    metin: `Merhaba,\n\n${davetEden} sizi STA Gayrimenkul'ün müşteri takip sistemi Satal'a davet etti.\n\nÜye olmak için bu bağlantıyı açın (7 gün geçerlidir):\n${baglanti}\n\nÜyeliğiniz yönetici onayından sonra açılır.${imza}`,
  }),
  sifreBelirle: (baglanti) => ({
    konu: "Satal: şifrenizi belirleyin",
    metin: `Merhaba,\n\nSatal şifrenizi belirlemek için bu bağlantıyı açın (24 saat geçerlidir):\n${baglanti}\n\nBu isteği siz yapmadıysanız bu e-postayı dikkate almayın.${imza}`,
  }),
  sifreSifirla: (baglanti) => ({
    konu: "Satal: yeni şifre belirleme",
    metin: `Merhaba,\n\nYeni şifre belirlemek için bu bağlantıyı açın (1 saat geçerlidir):\n${baglanti}\n\nBu isteği siz yapmadıysanız şifreniz değişmez; bu e-postayı dikkate almayın.${imza}`,
  }),
  onayBekliyor: (ad, eposta, baglanti) => ({
    konu: "Satal: yeni üyelik onay bekliyor",
    metin: `${ad} (${eposta}) Satal'a üye oldu ve onayınızı bekliyor.\n\nOnaylamak için: ${baglanti}${imza}`,
  }),
  onaylandi: (baglanti) => ({
    konu: "Satal üyeliğiniz onaylandı",
    metin: `Merhaba,\n\nSatal üyeliğiniz onaylandı. Giriş yapabilirsiniz:\n${baglanti}${imza}`,
  }),
};
