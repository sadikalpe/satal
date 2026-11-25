// Toplu aktarım: aktarım çalışma kitabını (Excel) Satal'a yükler. Kurulum günü bir kez çalıştırılır.
//
// Kullanım (sunucuda, crm klasöründe):
//   node scripts/aktar.js <dosya.xlsx> --danisman <e-posta>          → yalnızca dener, hiçbir şey yazmaz; özet ve sorunları gösterir
//   node scripts/aktar.js <dosya.xlsx> --danisman <e-posta> --yaz    → yazar
// Seçenekler: --il <ad> (ilçe birden çok ilde varsa varsayılan il; İzmir), --rapor <dosya.csv> (alınmayan ve eksik giren satırların listesi)
//
// Kitaptan okunan sayfalar ve Satal'daki karşılıkları:
//   Kişiler → kişiler (tipi, çalıştığı bölge ve tür, alım gücü, kim tanıştırdı dahil)   Talepler → talepler
//   Mülkler → mülkler (Satışta: aktif, Arşiv: pasif, Satıldı: satıldı; kimden geldiği dahil)
//   Geçmiş ilgiler → kişinin görüşme geçmişi   Aranacaklar → geri arama hatırlatmaları
//   "Kontrol" sütunu (Kişiler, Mülkler, Geçmiş ilgiler) → kaydın teyit notu; danışmanın kontrol listesinde bekler.
//   "Tanıştıran durumu" / "Getiren durumu" sütunu (Rehberde yok, Bilinmiyor) → adıyla yazılmış kişi için verilmiş yanıt.
//   Öbür sayfalar (Okuyun, Ofis grubu, Keep notları, WhatsApp…) okunmaz. Sütun düzeni: src/lib/aktarim-hazirla.js
//
// Kurallar:
// - Danışmanın Satal'da hesabı olmalı (önce bir kez giriş yapsın). Satırdaki "Danışman e-postası" boşsa --danisman kullanılır.
// - Danışmanın rehberinde zaten olan numaralar yeniden eklenmez (kişi iki kez yazılmaz); kayıtlı kişinin yalnızca boş alanları doldurulur.
//   Dosya iki kez yüklenirse yalnızca yeniler girer.
// - "Aktar" sütununda "Hayır" yazan satırlar alınmaz. Talep, kitapta yazan tarihte söylenmiş sayılır; "hâlâ arıyor mu?" o tarihe göre sorulur.
// - Yazma tek işlemdir: bir hata çıkarsa hiçbir şey yazılmaz.
import fs from "node:fs";
import { sistem, kapat } from "../src/db.js";
import { xlsxOku } from "../src/lib/xlsx-oku.js";
import { aktarimHazirla } from "../src/lib/aktarim-hazirla.js";
import { aktarimYaz } from "../src/servis/aktarim.js";

const argv = process.argv.slice(2);
const secenek = (ad) => { const i = argv.indexOf(ad); return i >= 0 ? argv[i + 1] : undefined; };
const dosya = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const yaz = argv.includes("--yaz");
if (!dosya || !fs.existsSync(dosya)) {
  console.error("Kullanım: node scripts/aktar.js <dosya.xlsx> --danisman <e-posta> [--yaz] [--il İzmir] [--rapor sorunlar.csv]");
  process.exit(1);
}

class Vazgec extends Error {}

try {
  const sonuc = await sistem(async (q) => {
    const konum = {
      iller: await q("select id, ad from iller"),
      ilceler: await q("select id, il_id, ad from ilceler"),
      mahalleler: await q("select id, ilce_id, ad from mahalleler"),
    };
    const plan = aktarimHazirla(xlsxOku(fs.readFileSync(dosya)), { konum, varsayilanDanisman: secenek("--danisman"), varsayilanIl: secenek("--il") || "İzmir" });
    const ozet = await aktarimYaz(q, plan, { dosyaAdi: dosya.split(/[\\/]/).pop(), deneme: !yaz });
    if (!yaz) throw Object.assign(new Vazgec(), { ozet });
    return ozet;
  });
  rapor(sonuc, true);
} catch (e) {
  if (e instanceof Vazgec) rapor(e.ozet, false);
  else { console.error("Aktarım yapılmadı:", e.message); process.exitCode = 1; }
} finally {
  await kapat();
}

function rapor(o, yazildi) {
  console.log(yazildi ? "\nAktarım tamamlandı." : "\nDENEME: hiçbir şey yazılmadı. Yazmak için komutun sonuna --yaz ekleyin.");
  console.log(`  Yeni kişi: ${o.kisi} (telefon: ${o.telefon})`);
  console.log(`  Rehberde zaten olan: ${o.mevcut}${o.guncellenen ? ` (boş alanı doldurulan: ${o.guncellenen})` : ""}`);
  console.log(`  Kim tanıştırdı bağlantısı: ${o.referans}`);
  console.log(`  Talep: ${o.talep}   Mülk: ${o.mulk}   Eşleşme: ${o.eslesme}`);
  console.log(`  Geçmiş ilgi: ${o.ilgi}   Aranacak (hatırlatma): ${o.hatirlatma}`);
  console.log(`  Kontrol listesine giren: ${o.kim} “bu kim?” sorusu (getireni ya da tanıştıranı yalnızca adla yazılı), ${o.teyit} teyit bekleyen bilgi`);
  if (o.ayni) console.log(`  Daha önce aktarılmış olduğu için atlanan kayıt: ${o.ayni}`);
  const dok = (baslik, liste) => {
    if (!liste.length) return;
    const neden = new Map();
    for (const a of liste) { const k = a.sayfa + ": " + a.neden.replace(/“[^”]*”/g, "…"); neden.set(k, (neden.get(k) || 0) + 1); }
    console.log(`  ${baslik}: ${liste.length}`);
    for (const [n, s] of [...neden].sort((a, b) => b[1] - a[1])) console.log(`    ${s} × ${n}`);
  };
  dok("Alınmayan satır", o.alinmayan);
  dok("Girdi ama bir bilgisi eksik kalan satır", o.uyarilar);
  const yol = secenek("--rapor");
  if (yol) {
    const satir = (durum) => (a) => [durum, a.sayfa, a.satir, a.ad, a.neden].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";");
    const csv = ["durum;sayfa;satir;ad;neden", ...o.alinmayan.map(satir("alınmadı")), ...o.uyarilar.map(satir("eksik girdi"))].join("\n");
    fs.writeFileSync(yol, "\uFEFF" + csv);
    console.log(`  Sorunların listesi: ${yol}`);
  }
}
