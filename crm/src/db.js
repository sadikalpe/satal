// Veritabanı erişimi. Her işlem bir kimlikle açılır; kimlik veritabanına bildirilir ve
// gizlilik kuralları (satır düzeyi güvenlik) o kimliğe göre işler.
import pg from "pg";
import { ayar } from "./ayar.js";

pg.types.setTypeParser(1700, (v) => (v == null ? null : parseFloat(v))); // numeric → sayı
pg.types.setTypeParser(1082, (v) => v); // date → "YYYY-AA-GG"
pg.types.setTypeParser(20, (v) => (v == null ? null : Number(v))); // bigint

export const havuz = new pg.Pool({ connectionString: ayar.veritabani, max: 10 });
havuz.on("error", (e) => console.error("veritabanı havuzu:", e.message));

// kimlik: { id, rol } (giriş yapmış kullanıcı) ya da "sistem" (uygulamanın kendi iç işleri)
export async function islem(kimlik, fn) {
  const uid = kimlik === "sistem" ? "" : kimlik?.id || "";
  const rol = kimlik === "sistem" ? "sistem" : kimlik?.rol || "yok";
  const c = await havuz.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('satal.uid', $1, true), set_config('satal.rol', $2, true)", [uid, rol]);
    const q = async (sql, params) => (await c.query(sql, params)).rows;
    q.bir = async (sql, params) => (await c.query(sql, params)).rows[0] ?? null;
    q.kimlik = kimlik === "sistem" ? { id: null, rol: "sistem" } : kimlik;
    // Denetimli iç işlem: yetki kontrolü uygulamada yapıldıktan sonra kısa süreli olarak sistem kimliğiyle çalışır.
    let derinlik = 0;
    q.sistem = async (ic) => {
      if (derinlik++ === 0) await c.query("select set_config('satal.rol', 'sistem', true)");
      try { return await ic(); }
      finally { if (--derinlik === 0) await c.query("select set_config('satal.rol', $1, true)", [rol]).catch(() => {}); }
    };
    const sonuc = await fn(q);
    await c.query("commit");
    return sonuc;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
export const sistem = (fn) => islem("sistem", fn);
export const kapat = () => havuz.end();
