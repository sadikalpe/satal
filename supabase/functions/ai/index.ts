// Claude ile çalışan üç iş: WhatsApp mesajı yazma, serbest notu alanlara ayırma, notları portföye göre tarama.
// İstemci yalnızca veriyi gönderir; komutlar (prompt) burada kurulur ve API anahtarı sunucuda kalır.
// Gerekli gizli değişken: ANTHROPIC_API_KEY  (Supabase > Edge Functions > Secrets)
import Anthropic from "npm:@anthropic-ai/sdk@1.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const MODEL = "claude-opus-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

async function ask(prompt: string, opts: { effort: "low" | "medium"; schema?: Record<string, unknown>; maxTokens?: number }) {
  const res = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort, ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}) },
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw Object.assign(new Error("refused"), { code: "refused" });
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
  if (!text) throw Object.assign(new Error("empty"), { code: "empty" });
  if (res.stop_reason === "max_tokens" && opts.schema) throw Object.assign(new Error("truncated"), { code: "truncated" });
  return text;
}

function messagePrompt(p: Record<string, any>) {
  const c = p.contact ?? {}, L = p.listing ?? {};
  const hist = (Array.isArray(c.hist) ? c.hist : []).slice(0, 15)
    .map((h: any) => `${str(h.happened_on, 10)}: ${str(h.region, 60)} ${str(h.prop_type, 30)} ${h.price_usd ? "$" + Number(h.price_usd).toLocaleString("tr-TR") : ""} - ${str(h.outcome, 30)} ${str(h.note, 200)}`)
    .join("\n") || "yok";
  return `İzmir'de çalışan bir emlak danışmanı adına, rehberindeki bir kişiye WhatsApp'tan gönderilecek kişiye özel bir portföy tanıtım mesajı yaz.

Kurallar:
- Türkçe yaz. Ton: ${str(p.tone, 40) || "samimi ve profesyonel"}.
- 70-130 kelime. Kişiye adıyla hitap et; cinsiyet açıkça belli değilse "Bey"/"Hanım" kullanma.
- Geçmiş görüşme varsa doğal biçimde ona değin, ısrarcı olma.
- Mülkün en güçlü 2-3 özelliğini öne çıkar, fiyatı dolar olarak yaz. Bilgi uydurma.
- Abartılı satış dili ve büyük harf kullanma, en fazla 1 emoji.
- Sonunda kısa bir görüşme ya da detay paylaşma teklifiyle soru sor.
- İmza: ${str(p.signer, 80) || "(imza yok)"}
- Yalnızca mesaj metnini yaz.

KİŞİ: ${str(c.name, 120) || "(isim yok)"}
Not: ${str(c.note, 1500) || "yok"}
Bütçe: ${c.budget_max ? (c.budget_min ? "$" + Number(c.budget_min).toLocaleString("tr-TR") + " - " : "") + "$" + Number(c.budget_max).toLocaleString("tr-TR") : "bilinmiyor"}
İlgilendiği bölgeler: ${(Array.isArray(c.regions) ? c.regions : []).slice(0, 20).join(", ") || "bilinmiyor"}
Geçmiş görüşmeler:
${hist}

PORTFÖY: ${str(L.title, 200)}
Tür: ${str(L.prop_type, 40)} | Konum: ${str(L.region, 60)}${L.hood ? " / " + str(L.hood, 60) : ""} | Fiyat: $${Number(L.price_usd || 0).toLocaleString("tr-TR")}${L.m2 ? " | " + Number(L.m2) + " m²" : ""}
Açıklama: ${str(L.description, 1500) || "yok"}`;
}

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["budget_currency", "budget_min", "budget_max", "regions", "types", "tier", "history"],
  properties: {
    budget_currency: { type: "string", enum: ["USD", "TRY"] },
    budget_min: { type: ["number", "null"] },
    budget_max: { type: ["number", "null"] },
    regions: { type: "array", items: { type: "string" } },
    types: { type: "array", items: { type: "string" } },
    tier: { type: ["string", "null"], enum: ["A", "B", "C", null] },
    history: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "region", "type", "price", "price_currency", "outcome", "note"],
        properties: {
          date: { type: "string" }, region: { type: "string" }, type: { type: "string" },
          price: { type: ["number", "null"] }, price_currency: { type: "string", enum: ["USD", "TRY"] },
          outcome: { type: "string" }, note: { type: "string" },
        },
      },
    },
  },
};

function extractPrompt(p: Record<string, any>) {
  const types = (Array.isArray(p.types) ? p.types : []).map((t: unknown) => str(t, 40)).join(", ");
  const outcomes = (Array.isArray(p.outcomes) ? p.outcomes : []).map((t: unknown) => str(t, 40)).join(", ");
  return `Bir emlak danışmanının müşteri notunu yapılandır. Bugünün tarihi ${new Date().toISOString().slice(0, 10)}.
- Tutarları ÇEVİRME: notta hangi para birimiyle yazıldıysa o tutarı ve para birimini ver ("6 milyon TL" → 6000000 ve TRY, "2M$" → 2000000 ve USD). Para birimi yazılmamışsa ve tutar milyonlarca liralık bir mülk fiyatına benziyorsa TRY, aksi halde USD say. Çevirme işini uygulama doğru tarihin kuruyla yapacak.
- budget_currency: bütçe tutarlarının para birimi (bütçe yoksa USD).
- "1,5 yıl önce", "geçen yaz" gibi ifadeleri bugüne göre YYYY-MM-DD tarihine çevir (gün bilinmiyorsa 01).
- Mülk türleri yalnızca şunlardan biri olabilir: ${types}. Görüşme sonucu yalnızca şunlardan biri: ${outcomes}.
- tier: A = yüksek alım gücü, B = orta, C = düşük ya da belirsiz. Nottan anlaşılmıyorsa null.
- history: notta geçen, belli bir bölgede konuşulmuş ya da alınmış mülkler. Yoksa boş dizi.
- Notta olmayan bilgiyi uydurma.

NOT:
${str(p.note, 4000)}`;
}

const SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "reason"], properties: { id: { type: "string" }, reason: { type: "string" } } },
    },
  },
};

function scanPrompt(p: Record<string, any>) {
  const L = p.listing ?? {};
  const lines = (Array.isArray(p.lines) ? p.lines : []).slice(0, 1500).map((l: unknown) => str(l, 700)).join("\n");
  return `Sen bir İzmir emlak danışmanının asistanısın. Aşağıda bir portföy ve danışmanın rehberindeki kişilerin serbest notları var. Bu mülkü alabilecek, bütçesi uyabilecek ya da bu bölge veya mülk türüyle ilgisi notlardan anlaşılan kişileri seç. Her seçim için notta bir dayanak olsun; tahmin yürütme.

PORTFÖY: ${str(L.title, 200)} | Tür: ${str(L.prop_type, 40)} | Bölge: ${str(L.region, 60)}${L.hood ? " / " + str(L.hood, 60) : ""} | Fiyat: $${Number(L.price_usd || 0).toLocaleString("tr-TR")}${L.m2 ? " | " + Number(L.m2) + " m²" : ""} | ${str(L.description, 800)}

KİŞİLER (kimlik|isim|not|geçmiş):
${lines}

En uygundan başlayarak en fazla 25 kişi döndür. "id" alanına satırdaki kimliği aynen yaz, "reason" alanına kısa Türkçe gerekçe yaz. Uygun kimse yoksa boş dizi döndür.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Oturum ve aktif kullanıcı kontrolü
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: active } = await sb.rpc("is_active");
  if (!active) return json({ error: "inactive" }, 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  // Claude isteğe bağlıdır: ANTHROPIC_API_KEY girilmemişse arayüz bu özellikleri gizler.
  if (body.task === "status") return json({ enabled: !!Deno.env.get("ANTHROPIC_API_KEY") });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "api_key" }, 503);

  try {
    if (body.task === "message") {
      const text = await ask(messagePrompt(body), { effort: "low", maxTokens: 4000 });
      return json({ text });
    }
    if (body.task === "extract") {
      const text = await ask(extractPrompt(body), { effort: "low", schema: EXTRACT_SCHEMA });
      return json(JSON.parse(text));
    }
    if (body.task === "scan") {
      const text = await ask(scanPrompt(body), { effort: "medium", schema: SCAN_SCHEMA, maxTokens: 16000 });
      return json(JSON.parse(text));
    }
    return json({ error: "unknown_task" }, 400);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "api_key" }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: "upstream", status: e.status }, 502);
    const code = (e as { code?: string }).code;
    if (code) return json({ error: code }, 422);
    console.error(e);
    return json({ error: "server" }, 500);
  }
});
