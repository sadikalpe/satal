// Yönetici işlemleri: danışman hesabı açma, şifre sıfırlama, hesabı kapatma/açma.
// Servis anahtarı (SUPABASE_SERVICE_ROLE_KEY) yalnızca burada, sunucuda kullanılır.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await caller.rpc("is_admin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  if (b.action === "create") {
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const full_name = String(b.full_name ?? "").trim().slice(0, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Geçerli bir e-posta girin" }, 400);
    if (password.length < 8) return json({ error: "Şifre en az 8 karakter olmalı" }, 400);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
    if (error) return json({ error: error.message }, 400);
    if (full_name) await admin.from("profiles").update({ full_name }).eq("id", data.user.id);
    return json({ id: data.user.id });
  }

  if (b.action === "reset_password") {
    const password = String(b.password ?? "");
    if (password.length < 8) return json({ error: "Şifre en az 8 karakter olmalı" }, 400);
    const { error } = await admin.auth.admin.updateUserById(String(b.user_id), { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (b.action === "set_active") {
    const id = String(b.user_id), active = !!b.active;
    if (id === u.user.id && !active) return json({ error: "Kendi hesabınızı kapatamazsınız" }, 400);
    const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
    if (e1) return json({ error: e1.message }, 400);
    const { error: e2 } = await admin.from("profiles").update({ active }).eq("id", id);
    if (e2) return json({ error: e2.message }, 400);
    return json({ ok: true });
  }

  if (b.action === "set_role") {
    const id = String(b.user_id), role = b.role === "admin" ? "admin" : "consultant";
    if (id === u.user.id && role !== "admin") return json({ error: "Kendi yönetici yetkinizi kaldıramazsınız" }, 400);
    const { error } = await admin.from("profiles").update({ role }).eq("id", id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
