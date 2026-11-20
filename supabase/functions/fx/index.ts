// USD/TRY kuru: TCMB döviz satış kuru. İstenen tarih için önce veritabanına bakar, yoksa TCMB'den çeker
// ve fx_rates tablosuna yazar. Hafta sonu ve tatillerde bir önceki iş gününün kuru kullanılır.
// İstek: POST {"date": "YYYY-MM-DD"} (boşsa bugün)  →  {"day": "...", "usd_try": 50.47, "source": "..."}
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const istanbulToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const pad = (n: number) => String(n).padStart(2, "0");

function parseUsd(xml: string): { rate: number; day: string } | null {
  const m = xml.match(/CurrencyCode="USD"[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);
  const t = xml.match(/Tarih="(\d{2})\.(\d{2})\.(\d{4})"/);
  if (!m) return null;
  const rate = Number(m[1]);
  if (!(rate > 0)) return null;
  return { rate, day: t ? `${t[3]}-${t[2]}-${t[1]}` : "" };
}

async function fetchTcmb(day: string, isToday: boolean): Promise<{ rate: number; day: string } | null> {
  const d = new Date(day + "T12:00:00Z");
  const url = isToday
    ? "https://www.tcmb.gov.tr/kurlar/today.xml"
    : `https://www.tcmb.gov.tr/kurlar/${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}.xml`;
  const res = await fetch(url, { headers: { "User-Agent": "sta-crm-fx" } });
  if (!res.ok) return null;
  const p = parseUsd(await res.text());
  return p ? { rate: p.rate, day: p.day || day } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: active } = await caller.rpc("is_active");
  if (!active) return json({ error: "inactive" }, 403);

  let body: { date?: string } = {};
  try { body = await req.json(); } catch { /* boş gövde: bugün */ }
  const today = istanbulToday();
  let day = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") ? body.date! : today;
  if (day > today) day = today;
  if (day < "1996-01-01") return json({ error: "too_old" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const cached = await admin.from("fx_rates").select("day,usd_try,source").eq("day", day).maybeSingle();
  if (cached.data) return json({ day: cached.data.day, usd_try: Number(cached.data.usd_try), source: cached.data.source });

  // TCMB'den çek; bulunamazsa geriye doğru en fazla 10 gün dene (hafta sonu, bayram)
  const base = new Date(day + "T12:00:00Z");
  for (let back = 0; back <= 10; back++) {
    const d = new Date(base.getTime() - back * 86400000).toISOString().slice(0, 10);
    let got: { rate: number; day: string } | null = null;
    try { got = await fetchTcmb(d, d === today); } catch { got = null; }
    if (!got) continue;
    const src = got.day === day ? "tcmb" : `tcmb (${got.day.split("-").reverse().join(".")} kuru)`;
    // TCMB'nin yayın tarihini ve istenen günü kaydet (istenen gün sonraki isteklerde hemen bulunur)
    const rows = [{ day: got.day, usd_try: got.rate, source: "tcmb" }];
    // Bugün için yayımlanmamış kur yerine öncekini kalıcı yazma: TCMB 15.30'da günün kurunu açıklar.
    if (got.day !== day && day !== today) rows.push({ day, usd_try: got.rate, source: src });
    await admin.from("fx_rates").upsert(rows, { onConflict: "day", ignoreDuplicates: true });
    return json({ day, usd_try: got.rate, source: src });
  }

  // TCMB'ye ulaşılamadı: elimizdeki en yakın eski kuru döndür
  const near = await admin.from("fx_rates").select("day,usd_try,source").lte("day", day).order("day", { ascending: false }).limit(1).maybeSingle();
  if (near.data) return json({ day: near.data.day, usd_try: Number(near.data.usd_try), source: "yaklaşık: " + near.data.source, approximate: true });
  return json({ error: "unavailable" }, 503);
});
