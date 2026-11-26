// Claude ile mesaj yazdırma (yalnızca bu bölümü açık olan kullanıcılar). Claude'a kişi adı, telefon ya da adres gönderilmez;
// hitap yerine {HITAP} yer tutucusu kullanılır ve gerçek hitap yanıt geldikten sonra burada yerine konur.
import Anthropic from "@anthropic-ai/sdk";
import { ayar } from "../ayar.js";
import { KullaniciHatasi } from "./ortak.js";
import { claudeIstegi, hitapYaz, imzaYaz } from "../alan/mesaj.js";

let istemci = null;
export const claudeHazir = () => !!ayar.anthropicAnahtari;

export async function claudeMesaji({ kisi, mulk, yer, kullanici, yon }) {
  if (!claudeHazir()) throw new KullaniciHatasi("Claude bağlantısı henüz kurulmadı. Şimdilik hazır şablonu kullanın.");
  istemci ||= new Anthropic({ apiKey: ayar.anthropicAnahtari, timeout: 60_000, maxRetries: 1 });
  const { sistem, kullaniciMetni } = claudeIstegi({ kisi, mulk, yer, kullanici, yon });
  let yanit;
  try {
    yanit = await istemci.beta.messages.create({
      model: ayar.claudeModeli,
      max_tokens: 16000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: sistem,
      messages: [{ role: "user", content: kullaniciMetni }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new KullaniciHatasi("Claude şu anda yoğun. Biraz sonra tekrar deneyin ya da hazır şablonu kullanın.", 503);
    if (e instanceof Anthropic.AuthenticationError) throw new KullaniciHatasi("Claude anahtarı geçersiz; yöneticiye haber verin.", 503);
    if (e instanceof Anthropic.APIError) throw new KullaniciHatasi("Claude mesajı yazamadı. Hazır şablonu kullanabilirsiniz.", 502);
    throw e;
  }
  if (yanit.stop_reason === "refusal") throw new KullaniciHatasi("Claude bu mesajı yazmadı. Hazır şablonu kullanabilirsiniz.", 502);
  const metin = yanit.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!metin) throw new KullaniciHatasi("Claude boş yanıt verdi. Hazır şablonu kullanabilirsiniz.", 502);
  // Seslenilecek ad yoksa ("adsız" hitap) yer tutucu, önündeki boşlukla birlikte silinir: "Merhaba {HITAP}," → "Merhaba,"
  const hitap = hitapYaz(kisi);
  return (hitap ? metin.replaceAll("{HITAP}", hitap) : metin.replace(/[ \t]*\{HITAP\}/g, "")) + "\n\n" + imzaYaz(kullanici);
}
