// Veritabanını kurar ve günceller: şema dosyaları (migrations/), uygulama kullanıcısı, konum verisi ve başlangıç ayarları.
// Yönetim bağlantısıyla (MIGRATE_DATABASE_URL) çalışır; uygulama ise kısıtlı "satal_app" kullanıcısıyla bağlanır.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ayar } from "../src/ayar.js";
import { VARSAYILAN_YARDIM } from "../src/alan/yardim.js";

const kok = path.join(import.meta.dirname, "..");

export async function gocEt({ baglanti = ayar.veritabaniYonetim, sessiz = false } = {}) {
  const c = new pg.Client({ connectionString: baglanti });
  await c.connect();
  const yaz = (...a) => { if (!sessiz) console.log(...a); };
  try {
    await c.query("create table if not exists _gocler (ad text primary key, at timestamptz not null default now())");
    const yapilan = new Set((await c.query("select ad from _gocler")).rows.map((r) => r.ad));
    for (const f of fs.readdirSync(path.join(kok, "migrations")).filter((x) => x.endsWith(".sql")).sort()) {
      if (yapilan.has(f)) continue;
      await c.query("begin");
      try {
        await c.query(fs.readFileSync(path.join(kok, "migrations", f), "utf8"));
        await c.query("insert into _gocler (ad) values ($1)", [f]);
        await c.query("commit");
        yaz("uygulandı:", f);
      } catch (e) { await c.query("rollback"); throw new Error(f + ": " + e.message); }
    }
    // Uygulamanın bağlandığı kısıtlı kullanıcı: tablo sahibi değildir, bu yüzden gizlilik kuralları ona uygulanır.
    const rolVar = (await c.query("select 1 from pg_roles where rolname = 'satal_app'")).rowCount;
    if (!rolVar) await c.query("create role satal_app login");
    if (ayar.uygulamaDbSifresi) await c.query(`alter role satal_app password ${pg.escapeLiteral(ayar.uygulamaDbSifresi)}`);
    await c.query("grant usage on schema public to satal_app");
    await c.query("grant select, insert, update, delete on all tables in schema public to satal_app");
    await c.query("grant usage, select on all sequences in schema public to satal_app");
    await c.query("revoke all on _gocler from satal_app");

    // Konum verisi (bir kez yüklenir)
    if (!(await c.query("select 1 from iller limit 1")).rowCount) {
      const oku = (f) => JSON.parse(fs.readFileSync(path.join(kok, "data", "konum", f), "utf8"));
      const sutun = (dizi, i) => dizi.map((r) => r[i]);
      const iller = oku("iller.json"), ilceler = oku("ilceler.json"), mah = oku("mahalleler.json");
      await c.query("insert into iller (id, ad) select * from unnest($1::int[], $2::text[])", [sutun(iller, 0), sutun(iller, 1)]);
      await c.query("insert into ilceler (id, il_id, ad) select * from unnest($1::int[], $2::int[], $3::text[])", [sutun(ilceler, 0), sutun(ilceler, 1), sutun(ilceler, 2)]);
      await c.query("insert into mahalleler (id, ilce_id, ad, sinir_var) select a, b, c, d = 1 from unnest($1::int[], $2::int[], $3::text[], $4::int[]) as t(a, b, c, d)", [sutun(mah, 0), sutun(mah, 1), sutun(mah, 2), sutun(mah, 3)]);
      const ik = oku("ilce_komsu.json"), mk = oku("mahalle_komsu.json");
      await c.query("insert into ilce_komsu (a, b) select * from unnest($1::int[], $2::int[])", [sutun(ik, 0), sutun(ik, 1)]);
      await c.query("insert into mahalle_komsu (a, b) select * from unnest($1::int[], $2::int[])", [sutun(mk, 0), sutun(mk, 1)]);
      yaz(`konum verisi yüklendi: ${iller.length} il, ${ilceler.length} ilçe, ${mah.length} mahalle`);
    }
    for (const [anahtar, y] of Object.entries(VARSAYILAN_YARDIM)) {
      await c.query("insert into yardim_metinleri (anahtar, baslik, metin) values ($1, $2, $3) on conflict (anahtar) do nothing", [anahtar, y.baslik, y.metin]);
    }
  } finally {
    await c.end();
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  gocEt().then(() => console.log("veritabanı hazır")).catch((e) => { console.error(e.message); process.exit(1); });
}
