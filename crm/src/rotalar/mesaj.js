// WhatsApp mesajı: Satal metni hazırlar, danışman kendi telefonundan gönderir ve "gönderdim" diye işaretler.
import { islem } from "../db.js";
import { html } from "../lib/html.js";
import { sayfa, csrfAlani } from "../gorunum/duzen.js";
import { mulkTarifi, fiyatYaz } from "../gorunum/parcalar.js";
import { aliciMesaji, saticiMesaji } from "../alan/mesaj.js";
import { claudeMesaji, claudeHazir } from "../servis/claude.js";
import { konumYukle, ayarlarAl, kaydet, KullaniciHatasi } from "../servis/ortak.js";
import { metin, dizi, uuidMi, secim } from "../lib/form.js";
import { telefonYaz, yabanciNumara, neKadarOnce } from "../lib/metin.js";

const BUGUN_SQL = "(date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')";
const bugunGonderilen = async (q, ben) => (await q.bir(`select count(distinct kisi_id) as n from mesajlar where sahip_id = $1 and gonderildi_at >= ${BUGUN_SQL}`, [ben])).n;
const siraOku = (s) => String(s || "").split(",").filter(uuidMi).slice(0, 60);

async function baglam(q, req, p) {
  const ben = req.kullanici.id;
  const sira = siraOku(p.sira);
  const kisiId = sira[0] || (uuidMi(p.kisi) ? p.kisi : null);
  if (!kisiId || !uuidMi(p.mulk)) throw new KullaniciHatasi("Mesaj için kişi ve mülk gerekli.", 404);
  const kisi = await q.bir("select * from kisiler where id = $1 and sahip_id = $2 and silindi_at is null", [kisiId, ben]);
  const mulk = await q.bir("select * from mulkler where id = $1 and sahip_id = $2 and silindi_at is null", [p.mulk, ben]);
  if (!kisi || !mulk) throw new KullaniciHatasi("Kayıt bulunamadı. Mesajı yalnızca kendi kişileriniz ve mülkleriniz için hazırlayabilirsiniz.", 404);
  const yon = p.yon === "saticiya" ? "saticiya" : "aliciya";
  if (yon === "saticiya" && mulk.malik_kisi_id !== kisi.id) throw new KullaniciHatasi("Bu kişi mülkün sahibi değil.");
  if (yon === "aliciya" && mulk.malik_kisi_id === kisi.id) throw new KullaniciHatasi("Mülk, sahibine alıcı mesajıyla gönderilemez.");
  const telefon = (await q.bir("select numara from kisi_telefonlari where kisi_id = $1 and aktif order by ana desc limit 1", [kisi.id]))?.numara || "";
  const es = yon === "aliciya" ? await q.bir(`select e.talep_id, e.fiyat_dustu from eslesmeler e join talepler t on t.id = e.talep_id where e.mulk_id = $1 and t.kisi_id = $2 and e.gecerli and e.talep_sahip_id = $3 and e.mulk_sahip_id = $3 order by e.puan desc nulls last limit 1`, [mulk.id, kisi.id, ben]) : null;
  const son = await q.bir("select max(gonderildi_at) as at from mesajlar where kisi_id = $1 and mulk_id = $2 and yon = $3", [kisi.id, mulk.id, yon]);
  return { kisi, mulk, yon, telefon, sira, talepId: es?.talep_id || (uuidMi(p.talep) ? p.talep : null), fiyatDustu: !!es?.fiyat_dustu, sonAt: son?.at, bugun: await bugunGonderilen(q, ben) };
}

async function mesajSayfasi(req, reply, p, hazirMetin = null) {
  const konum = await konumYukle(), ayarlar = await ayarlarAl(), k = req.kullanici;
  const b = await islem(k, (q) => baglam(q, req, p));
  const yer = { ilce: konum.ilceAdi(b.mulk.ilce_id), mahalle: konum.mahalleAdi(b.mulk.mahalle_id) };
  const sablon = b.yon === "saticiya" ? saticiMesaji({ kisi: b.kisi, mulk: b.mulk, yer, kullanici: k }) : aliciMesaji({ kisi: b.kisi, mulk: b.mulk, yer, kullanici: k, fiyatDustu: b.fiyatDustu });
  const yazi = hazirMetin || sablon;
  const sinir = ayarlar.gunluk_mesaj_siniri, sinirDoldu = b.yon === "aliciya" && b.bugun >= sinir;
  const engel = b.yon === "aliciya" && b.kisi.mesaj_istemiyor;
  const gizli = html`<input type="hidden" name="kisi" value="${b.kisi.id}"><input type="hidden" name="mulk" value="${b.mulk.id}"><input type="hidden" name="talep" value="${b.talepId || ""}"><input type="hidden" name="yon" value="${b.yon}"><input type="hidden" name="sira" value="${b.sira.join(",")}">`;
  const sonraki = b.sira.length > 1 ? `/mesaj?mulk=${b.mulk.id}&sira=${b.sira.slice(1).join(",")}` : `/mulkler/${b.mulk.id}`;
  return reply.sayfa(sayfa(req, { baslik: "Mesaj", dar: true, geri: { yol: "/mulkler/" + b.mulk.id, ad: "Mülk" }, icerik: html`
    <h1>${b.yon === "saticiya" ? "Mülk sahibine mesaj" : "Alıcıya mesaj"}${b.sira.length ? html` <small>(sırada ${b.sira.length} kişi)</small>` : ""}</h1>
    <div class="kart">
      <p><b><a href="/kisiler/${b.kisi.id}">${b.kisi.ad}</a></b> · ${telefonYaz(b.telefon) || "telefon yok"}</p>
      <p class="soluk">${mulkTarifi(b.mulk, konum)} · ${fiyatYaz(b.mulk)}</p>
      ${engel ? html`<p class="uyari-kutu">Bu kişi mülk tanıtım mesajı istemiyor. Mesaj hazırlanmadı.</p>` : ""}
      ${b.sonAt ? html`<p class="uyari-kutu">Bu mülk bu kişiye ${neKadarOnce(b.sonAt)} gönderildi. Yeniden göndermek istediğinize emin misiniz?</p>` : ""}
      ${sinirDoldu ? html`<p class="uyari-kutu">Bugün ${b.bugun} kişiye mesaj gönderdiniz; günlük sınır ${sinir}. WhatsApp'ın numaranızı kısıtlamaması için yarın devam edin.</p>` : b.yon === "aliciya" ? html`<p class="soluk">Bugün gönderilen: ${b.bugun} / ${sinir}</p>` : ""}
      ${b.telefon && yabanciNumara(b.telefon) ? html`<p class="bilgi-kutu">Yurt dışı numarası. ${b.kisi.dil === "en" ? "Mesaj İngilizce hazırlandı." : "Mesaj dili kişi kartından değiştirilebilir."}</p>` : ""}
      ${engel ? html`<a class="dugme ikincil" href="${sonraki}">${b.sira.length > 1 ? "Sonraki kişi" : "Geri dön"}</a>` : html`
      <form method="post" action="/mesaj/gonderildi" class="form">${csrfAlani(req)}${gizli}<input type="hidden" name="kaynak" value="${hazirMetin ? "claude" : "sablon"}">
        <label class="alan"><span class="etiket">Mesaj (göndermeden önce değiştirebilirsiniz)</span><textarea name="metin" id="mesaj-metni" rows="9" maxlength="3000" required>${yazi}</textarea></label>
        <div class="dugmeler">
          ${b.telefon && !sinirDoldu ? html`<a class="dugme wa" id="wa-dugme" data-numara="${b.telefon}" href="https://wa.me/${b.telefon}?text=${encodeURIComponent(yazi)}" target="_blank" rel="noopener">WhatsApp'ta aç</a>` : ""}
          <button type="button" class="dugme sade" data-kopyala="#mesaj-metni">Metni kopyala</button>
        </div>
        <p class="soluk">WhatsApp'ta gönderdikten sonra buraya dönüp işaretleyin; kişi kartına işlenir.</p>
        <div class="dugmeler">${sinirDoldu ? "" : html`<button class="dugme">Gönderdim ✓${b.sira.length > 1 ? " · sonraki" : ""}</button>`}
          ${b.sira.length ? html`<a class="dugme sade" href="${sonraki}">${b.sira.length > 1 ? "Bu kişiyi atla" : "Bitir"}</a>` : ""}</div>
      </form>
      ${(k.moduller?.claude_mesaj || k.rol === "sahip") && !hazirMetin ? html`<form method="post" action="/mesaj/claude">${csrfAlani(req)}${gizli}<button class="dugme ikincil kucuk"${claudeHazir() ? "" : " disabled"}>Claude yazsın</button> <small>${claudeHazir() ? "Claude'a yalnızca mülkün tarifi gider; kişi adı ve telefonu gitmez." : "Claude bağlantısı henüz kurulmadı."}</small></form>` : ""}`}
    </div>` }));
}

export default async function (app) {
  const crm = { config: { modul: "crm" } };
  app.get("/mesaj", crm, (req, reply) => mesajSayfasi(req, reply, req.query));

  app.post("/mesaj/claude", { config: { modul: "claude_mesaj" } }, async (req, reply) => {
    const konum = await konumYukle(), f = req.form;
    const b = await islem(req.kullanici, (q) => baglam(q, req, f));
    if (b.yon === "aliciya" && b.kisi.mesaj_istemiyor) throw new KullaniciHatasi("Bu kişi mesaj istemiyor.");
    const yazi = await claudeMesaji({ kisi: b.kisi, mulk: b.mulk, kullanici: req.kullanici, yon: b.yon, yer: { ilce: konum.ilceAdi(b.mulk.ilce_id), mahalle: konum.mahalleAdi(b.mulk.mahalle_id) } });
    await islem(req.kullanici, (q) => kaydet(q, req, "claude_mesaji", "mulk", b.mulk.id));
    return mesajSayfasi(req, reply, f, yazi);
  });

  // Sırayla gönderim: seçilen alıcılar tek tek açılır
  app.post("/mesaj/sira", crm, async (req, reply) => {
    const f = req.form, secilen = dizi(f.kisi).filter(uuidMi);
    if (!uuidMi(f.mulk)) throw new KullaniciHatasi("Mülk bulunamadı.", 404);
    if (!secilen.length) throw new KullaniciHatasi("Önce listeden alıcı seçin.");
    const ayarlar = await ayarlarAl();
    const v = await islem(req.kullanici, async (q) => ({
      uygun: await q("select id from kisiler where id = any($1::uuid[]) and sahip_id = $2 and silindi_at is null and not mesaj_istemiyor", [secilen, req.kullanici.id]),
      bugun: await bugunGonderilen(q, req.kullanici.id),
    }));
    const kalan = Math.max(0, ayarlar.gunluk_mesaj_siniri - v.bugun);
    if (!kalan) throw new KullaniciHatasi(`Bugünkü mesaj sınırına (${ayarlar.gunluk_mesaj_siniri} kişi) ulaştınız. Yarın devam edin.`);
    const uygun = new Set(v.uygun.map((k) => k.id));
    const sira = secilen.filter((id) => uygun.has(id)).slice(0, kalan);
    if (!sira.length) throw new KullaniciHatasi("Seçilen kişilere mesaj gönderilemiyor.");
    if (sira.length < secilen.length) reply.bildir(`${secilen.length} kişiden ${sira.length} tanesi sıraya alındı (günlük sınır ve “mesaj istemiyor” işareti).`, "uyari");
    return reply.redirect(`/mesaj?mulk=${f.mulk}&sira=${sira.join(",")}`);
  });

  app.post("/mesaj/gonderildi", crm, async (req, reply) => {
    const f = req.form, ben = req.kullanici.id, yazi = metin(f.metin, 3000);
    if (!yazi) throw new KullaniciHatasi("Mesaj boş olamaz.");
    const ayarlar = await ayarlarAl();
    const b = await islem(req.kullanici, async (q) => {
      const b = await baglam(q, req, f);
      if (b.yon === "aliciya" && b.kisi.mesaj_istemiyor) throw new KullaniciHatasi("Bu kişi mesaj istemiyor.");
      if (b.yon === "aliciya" && b.bugun >= ayarlar.gunluk_mesaj_siniri) throw new KullaniciHatasi(`Bugünkü mesaj sınırına (${ayarlar.gunluk_mesaj_siniri} kişi) ulaştınız.`);
      const talepId = b.talepId && (await q.bir("select id from talepler where id = $1 and kisi_id = $2", [b.talepId, b.kisi.id])) ? b.talepId : null;
      await q("insert into mesajlar (sahip_id, kisi_id, mulk_id, talep_id, yon, metin, kaynak, sirali) values ($1,$2,$3,$4,$5,$6,$7,$8)", [ben, b.kisi.id, b.mulk.id, talepId, b.yon, yazi, secim(f.kaynak, ["sablon", "claude"], "sablon"), b.sira.length > 0]);
      await q("insert into gorusmeler (kisi_id, sahip_id, tur, ilce_id, mahalle_id, kategori, alt_tur, mulk_id, notu) values ($1,$2,'mesaj',$3,$4,$5,$6,$7,$8)", [b.kisi.id, ben, b.mulk.ilce_id, b.mulk.mahalle_id, b.mulk.kategori, b.mulk.alt_tur, b.mulk.id, b.yon === "saticiya" ? "Mülk sahibine alıcı haberi verildi" : "Mülk tanıtım mesajı gönderildi"]);
      await q("update kisiler set son_temas_at = now() where id = $1", [b.kisi.id]);
      if (talepId) await q.sistem(() => q("update eslesmeler set durum = 'gonderildi' where talep_id = $1 and mulk_id = $2 and durum <> 'reddedildi'", [talepId, b.mulk.id]));
      return b;
    });
    if (b.sira.length > 1) return reply.redirect(`/mesaj?mulk=${b.mulk.id}&sira=${b.sira.slice(1).join(",")}`);
    return reply.bildir(b.sira.length ? "Sıradaki herkese gönderildi." : "Mesaj kişi kartına işlendi.").redirect("/mulkler/" + b.mulk.id);
  });
}

