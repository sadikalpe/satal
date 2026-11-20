import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import {
  TYPES, OUTCOMES, REGIONS, norm, parseNum, phoneNorm, phoneFmt, fmtUSD, fmtShort,
  parseVCF, parseCSV, prepareImport, matchContacts, templateMessage, waLink, fmtTRY, budgetFields,
} from "./lib.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const toast = (t) => { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2800); };
const show = (id) => { for (const x of ["boot", "auth", "app"]) $("#" + x).hidden = x !== id; };

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  $("#boot").innerHTML = `<div class="panel stack" style="max-width:480px"><h3>Kurulum tamamlanmadı</h3><p class="muted" style="margin:0">web/config.js dosyasına Supabase proje adresini ve anon anahtarını yazın. Ayrıntılar README dosyasında.</p></div>`;
  throw new Error("config missing");
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } });

// ---------------- state ----------------
const S = {
  user: null, me: null, isAdmin: false, profiles: new Map(),
  contacts: [], byId: new Map(), listings: [], fx: null, sel: null,
  teamMatches: [], lastTeamCount: null, loaded: false, aiEnabled: false,
};
const pname = (id) => S.profiles.get(id)?.full_name || S.profiles.get(id)?.email || "Danışman";

// ---------------- auth ----------------
function authMsg(t, kind = "note") { const el = $("#authMsg"); el.textContent = t || ""; el.className = kind === "info" ? "info-banner" : "note-banner"; el.hidden = !t; }
function authView(which) { show("auth"); for (const f of ["loginForm", "mfaForm", "recoverForm"]) $("#" + f).hidden = f !== which; }

{ // Google dönüşünde hata varsa göster
  const p = new URLSearchParams(location.search + "&" + location.hash.replace(/^#/, ""));
  const err = p.get("error_description") || p.get("error");
  if (err) {
    authMsg(/signup|not allowed|disabled/i.test(err)
      ? "Bu Google hesabı sistemde tanımlı değil. Yöneticinizden bu e-posta adresiyle hesap açmasını isteyin."
      : "Google ile giriş tamamlanamadı: " + err);
    history.replaceState(null, "", location.pathname);
  }
}

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; authMsg("");
  const { error } = await sb.auth.signInWithPassword({ email: $("#li-email").value.trim(), password: $("#li-pass").value });
  btn.disabled = false;
  if (error) authMsg(/invalid/i.test(error.message) ? "E-posta ya da şifre hatalı." : /banned/i.test(error.message) ? "Hesabınız kapatılmış. Yöneticinizle görüşün." : error.message);
};
// Google ile giriş Supabase'te açılmadıysa düğmeyi gösterme
$("#googleBtn").hidden = true;
fetch(SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: SUPABASE_ANON_KEY } })
  .then((r) => r.json()).then((st) => { $("#googleBtn").hidden = !st?.external?.google; }).catch(() => {});
$("#googleBtn").onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) authMsg(error.message);
};
$("#forgotBtn").onclick = async () => {
  const email = $("#li-email").value.trim();
  if (!email) return authMsg("Önce e-posta adresinizi yazın, sonra “Şifremi unuttum”a basın.");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  authMsg(error ? error.message : "Şifre sıfırlama bağlantısı e-postanıza gönderildi.", error ? "note" : "info");
};
$("#mfaForm").onsubmit = async (e) => {
  e.preventDefault();
  const { data } = await sb.auth.mfa.listFactors();
  const f = data?.totp?.[0];
  if (!f) return authMsg("Doğrulama yöntemi bulunamadı.");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: $("#mfa-code").value.trim() });
  if (error) return authMsg("Kod hatalı ya da süresi geçti. Yeniden deneyin.");
  authMsg(""); route();
};
$("#recoverForm").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $("#rc-pass").value });
  if (error) return authMsg(error.message);
  toast("Şifreniz güncellendi"); inRecovery = false; route();
};
document.addEventListener("click", async (e) => { if (e.target.closest("[data-logout]")) { await sb.auth.signOut(); location.reload(); } });

let routing = false, inRecovery = false;
sb.auth.onAuthStateChange((ev) => {
  if (ev === "PASSWORD_RECOVERY") { inRecovery = true; authMsg(""); authView("recoverForm"); return; }
  if (ev === "INITIAL_SESSION" || ev === "SIGNED_IN" || ev === "SIGNED_OUT") setTimeout(route, 0);
});

async function route() {
  if (routing || inRecovery) return;
  routing = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { authView("loginForm"); return; }
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") { authView("mfaForm"); $("#mfa-code").value = ""; $("#mfa-code").focus(); return; }
    S.user = session.user;
    const { data: me } = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
    if (!me || !me.active) { await sb.auth.signOut(); authView("loginForm"); authMsg("Hesabınız etkin değil. Yöneticinizle görüşün."); return; }
    if (S.loaded && S.me?.id === me.id) return;
    S.me = me; S.isAdmin = me.role === "admin";
    $$("[data-admin]").forEach((el) => (el.hidden = !S.isAdmin));
    show("app");
    renderAccount();
    await loadAll();
  } finally { routing = false; }
}

// ---------------- data ----------------
async function fetchAll(table, cols, order = "created_at") {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).order(order, { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
function note(t, kind = "note") { const el = $("#globalNote"); el.textContent = t || ""; el.className = kind === "info" ? "info-banner" : "note-banner"; el.hidden = !t; }

async function loadAll() {
  note("");
  try {
    const [profiles, listings, contacts, inter, fx] = await Promise.all([
      fetchAll("profiles", "id,email,full_name,role,active,created_at"),
      fetchAll("listings", "*", "updated_at"),
      fetchAll("contacts", "*"),
      fetchAll("interactions", "*", "happened_on"),
      sb.from("fx_rates").select("day,usd_try,source").order("day", { ascending: false }).limit(1).maybeSingle(),
    ]);
    S.profiles = new Map(profiles.map((p) => [p.id, p]));
    S.listings = listings.reverse();
    const hist = new Map();
    for (const i of inter) { if (!hist.has(i.contact_id)) hist.set(i.contact_id, []); hist.get(i.contact_id).push(i); }
    S.contacts = contacts.map((c) => ({ ...c, hist: hist.get(c.id) || [] })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
    S.byId = new Map(S.contacts.map((c) => [c.id, c]));
    S.fx = fx.data ? { usd_try: Number(fx.data.usd_try), day: fx.data.day, source: fx.data.source } : null;
    if (S.isAdmin) await loadTeamMatches();
    S.loaded = true;
    renderAll();
    refreshFx();
    callAI({ task: "status" }).then((r) => { S.aiEnabled = !!r?.enabled; renderMatches(); }).catch(() => { S.aiEnabled = false; });
  } catch (e) {
    console.error(e);
    note("Veriler yüklenemedi. Sayfayı yenileyin; sorun sürerse yöneticinize haber verin.");
  }
}
// ---------------- kur (TCMB) ----------------
const rateCache = new Map();
async function rateFor(day) {
  if (rateCache.has(day)) return rateCache.get(day);
  const { data, error } = await sb.functions.invoke("fx", { body: { date: day } });
  if (error || !(data?.usd_try > 0)) throw new Error("fx_unavailable");
  const r = { usd_try: Number(data.usd_try), day: data.day, source: data.source, approximate: !!data.approximate };
  if (day !== today()) rateCache.set(day, r);
  return r;
}
async function refreshFx() {
  try {
    const r = await rateFor(today());
    const changed = !S.fx || S.fx.usd_try !== r.usd_try;
    S.fx = r; renderFx();
    if (changed && S.listings.some((L) => L.price_currency === "TRY")) {
      S.listings = (await fetchAll("listings", "*", "updated_at")).reverse(); renderListings(); renderMatches();
    }
  } catch { /* TCMB'ye ulaşılamadı: son bilinen kur kullanılır */ }
}
const fxTxt = (r) => Number(r).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dayTxt = (d) => (d ? d.split("-").reverse().join(".") : "");
function priceTxt(L) {
  if (L.price_currency === "TRY") return `${fmtTRY(L.price_amount)} <span class="muted">(≈ ${fmtUSD(L.price_usd)})</span>`;
  return fmtUSD(L.price_usd);
}

async function loadTeamMatches() {
  const rows = await fetchAll("team_matches", "*", "created_at");
  S.teamMatches = rows;
  const n = new Set(rows.filter((r) => r.status === "new").map((r) => r.listing_id + ":" + (S.byId.get(r.contact_id)?.phone || r.contact_id))).size;
  $("#alertBadge").textContent = n; $("#alertBadge").hidden = !n;
}
function upsertLocalContact(c) {
  const prev = S.byId.get(c.id);
  const merged = { ...prev, ...c, hist: c.hist || prev?.hist || [] };
  S.byId.set(c.id, merged);
  const i = S.contacts.findIndex((x) => x.id === c.id);
  if (i >= 0) S.contacts[i] = merged; else S.contacts.push(merged);
}
function removeLocalContact(id) { S.byId.delete(id); S.contacts = S.contacts.filter((c) => c.id !== id); }

// ---------------- tabs ----------------
$$("nav.tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function showTab(t) {
  $$("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  for (const x of ["match", "contacts", "import", "alerts", "team", "account"]) $("#tab-" + x).hidden = x !== t;
  if (t === "contacts") renderContacts();
  if (t === "alerts") renderAlerts();
  if (t === "team") renderTeam();
  if (t === "account") renderAccount();
}
function renderAll() {
  renderFx(); renderListings(); renderMatches();
  if (!$("#tab-contacts").hidden) renderContacts();
  if (!$("#tab-alerts").hidden) renderAlerts();
  if (!$("#tab-team").hidden) renderTeam();
  const sel = $("#fOwner"); const cur = sel.value;
  sel.innerHTML = `<option value="">Herkes</option><option value="${esc(S.me.id)}">Benim rehberim</option>` +
    [...S.profiles.values()].filter((p) => p.id !== S.me.id).map((p) => `<option value="${esc(p.id)}">${esc(p.full_name || p.email)}</option>`).join("");
  sel.value = cur;
}

// ---------------- fx ----------------
function renderFx() {
  $("#fxVal").textContent = S.fx?.usd_try ? S.fx.usd_try.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
  $("#fxVal").title = S.fx ? `${dayTxt(S.fx.day)} · ${S.fx.source === "manual" ? "elle girildi" : "TCMB döviz satış"}` : "Kur alınamadı";
  updateConv();
}
$("#fxEdit").onclick = () => {
  const n = h(`${dHead("Dolar kuru", "Kur her gün TCMB’den otomatik alınır. Gerekirse bugünün kurunu elle değiştirebilirsiniz.")}
    <div class="stack"><label class="f">1 USD kaç TL?<input id="fx-in" inputmode="decimal" value="${S.fx?.usd_try ? String(S.fx.usd_try).replace(".", ",") : ""}" placeholder="42,50"></label>
    <div class="muted small-t">Şu an kullanılan: ${S.fx ? `${fxTxt(S.fx.usd_try)} ₺ · ${dayTxt(S.fx.day)} · ${S.fx.source === "manual" ? "elle girildi" : "TCMB"}` : "yok"}. Elle girilen kur, TL fiyatlı mülklerin dolar karşılığını hemen günceller.</div>
    <div><button class="btn primary" type="button" id="fx-save">Kaydet</button></div></div>`);
  $("#fx-save", n).onclick = async () => {
    const v = parseFloat($("#fx-in", n).value.replace(/\./g, "").replace(",", "."));
    if (!(v > 0)) return toast("Geçerli bir kur girin");
    const { error } = await sb.from("fx_rates").upsert({ day: today(), usd_try: v, source: "manual" });
    if (error) return toast("Kaydedilemedi");
    S.fx = { usd_try: v, day: today(), source: "manual" }; renderFx();
    S.listings = (await fetchAll("listings", "*", "updated_at")).reverse(); renderListings(); renderMatches();
    toast("Kur güncellendi"); closeDrawer();
  };
  openDrawer(n);
};

// ---------------- listing form ----------------
$("#lf-type").innerHTML = TYPES.map((t) => `<option>${esc(t)}</option>`).join("");
$("#regionList").innerHTML = REGIONS.map((r) => `<option value="${esc(r)}">`).join("");
function updateConv() {
  const v = parseNum($("#lf-price").value), cur = $("#lf-cur").value, fx = S.fx?.usd_try, el = $("#lf-conv");
  if (!v) { el.textContent = ""; return; }
  if (!fx) { el.textContent = cur === "TRY" ? "Kur henüz alınamadı; TL fiyatlı mülk kaydetmek için biraz sonra tekrar deneyin." : ""; return; }
  el.textContent = cur === "USD" ? "≈ " + fmtTRY(v * fx) + " (bugünkü kurla)" : "Bugünkü kurla ≈ " + fmtUSD(v / fx) + ". Fiyat TL olarak saklanır, dolar karşılığı kur değiştikçe güncellenir.";
}
$("#lf-price").oninput = updateConv; $("#lf-cur").onchange = updateConv;
function fillForm(L) {
  $("#lfTitle").textContent = L ? "Portföyü düzenle" : "Yeni portföy";
  $("#lf-title").value = L?.title || ""; $("#lf-type").value = L?.prop_type || TYPES[0];
  $("#lf-region").value = L?.region || ""; $("#lf-hood").value = L?.hood || ""; $("#lf-m2").value = L?.m2 || "";
  const amt = L ? (L.price_currency === "TRY" ? L.price_amount : L.price_usd) : null;
  $("#lf-price").value = amt ? Math.round(amt).toLocaleString("tr-TR") : ""; $("#lf-cur").value = L?.price_currency || "USD";
  $("#lf-desc").value = L?.description || "";
  $("#lf-new").hidden = !L; $("#lf-del").hidden = !L; $("#lf-save").textContent = L ? "Güncelle ve eşleştir" : "Kaydet ve eşleştir";
  updateConv();
}
$("#lf-new").onclick = () => { S.sel = null; S.lastTeamCount = null; fillForm(null); renderListings(); renderMatches(); };
$("#lf-del").onclick = () => {
  const L = S.listings.find((x) => x.id === S.sel); if (!L) return;
  openDrawer(confirmBox(`“${L.title}” silinsin mi?`, "Kişilerin geçmiş kayıtları silinmez.", async () => {
    const { error } = await sb.from("listings").delete().eq("id", L.id);
    if (error) throw error;
    S.listings = S.listings.filter((x) => x.id !== L.id); S.sel = null; fillForm(null); renderListings(); renderMatches(); toast("Portföy silindi");
  }));
};
$("#listingForm").onsubmit = async (e) => {
  e.preventDefault();
  let price = parseNum($("#lf-price").value);
  if (!price) return toast("Fiyatı girin");
  const isTry = $("#lf-cur").value === "TRY";
  if (isTry && !S.fx?.usd_try) return toast("Kur henüz alınamadı, biraz sonra tekrar deneyin");
  const L = {
    title: $("#lf-title").value.trim(), prop_type: $("#lf-type").value, region: $("#lf-region").value.trim(),
    hood: $("#lf-hood").value.trim(), m2: parseNum($("#lf-m2").value), description: $("#lf-desc").value.trim(),
    ...(isTry ? { price_currency: "TRY", price_amount: Math.round(price) } : { price_currency: "USD", price_usd: Math.round(price) }),
  };
  const btn = $("#lf-save"); btn.disabled = true;
  try {
    const q = S.sel ? sb.from("listings").update(L).eq("id", S.sel) : sb.from("listings").insert(L);
    const { data, error } = await q.select().single();
    if (error) throw error;
    S.listings = [data, ...S.listings.filter((x) => x.id !== data.id)]; S.sel = data.id;
    S.lastTeamCount = null; renderListings(); renderMatches(); toast("Kaydedildi");
    const { data: n, error: e2 } = await sb.rpc("refresh_team_matches", { p_listing: data.id });
    if (!e2) { S.lastTeamCount = n; renderMatches(); if (S.isAdmin) { await loadTeamMatches(); } }
  } catch (err) { console.error(err); toast("Kaydedilemedi, tekrar deneyin"); }
  finally { btn.disabled = false; }
};
function renderListings() {
  const el = $("#listingList");
  if (!S.listings.length) { el.innerHTML = `<div class="empty" style="padding:16px">Henüz portföy yok. Yukarıdaki formla ilk mülkü ekleyin.</div>`; return; }
  el.innerHTML = S.listings.map((L) => `<button class="lcard" type="button" data-id="${esc(L.id)}" aria-current="${L.id === S.sel}">
    <div class="t">${esc(L.title)}</div><div class="m"><span>${esc(L.prop_type)}</span><span>${esc(L.region)}${L.hood ? " / " + esc(L.hood) : ""}</span><span class="num">${priceTxt(L)}</span>
    ${L.m2 ? `<span class="num">${Number(L.m2).toLocaleString("tr-TR")} m²</span>` : ""}${S.isAdmin && L.created_by !== S.me.id ? `<span>· ${esc(pname(L.created_by))}</span>` : ""}</div></button>`).join("");
  $$(".lcard", el).forEach((b) => (b.onclick = () => { S.sel = b.dataset.id; S.lastTeamCount = null; fillForm(S.listings.find((x) => x.id === S.sel)); renderListings(); renderMatches(); }));
}

// ---------------- matches ----------------
function renderMatches() {
  const el = $("#matchPanel"); const L = S.listings.find((x) => x.id === S.sel);
  if (!L) {
    el.innerHTML = `<div class="empty"><h3>Mülkü girin, alıcısını bulalım</h3><p style="margin:0">Soldaki formu doldurup kaydedin ya da listeden bir portföy seçin.</p>
      <div class="steps"><div><b>Bütçe</b>Fiyatın etrafında bütçesi olan kişiler (dolar bazında).</div><div><b>Bölge</b>O ilçe ya da mahalleyle ilgilenmiş, notunda geçen kişiler.</div><div><b>Geçmiş</b>Yıllar önce o bölgede mülk konuştuğunuz, teklif veren ya da alan kişiler.</div></div></div>`;
    return;
  }
  const list = matchContacts(L, S.contacts);
  const scope = S.isAdmin ? `${S.contacts.length.toLocaleString("tr-TR")} kişi (tüm ekip) tarandı` : `${S.contacts.length.toLocaleString("tr-TR")} kişi tarandı`;
  const teamNote = !S.isAdmin && S.lastTeamCount > 0
    ? `<div class="info-banner" style="margin:8px 0">Ekipte bu portföye uyabilecek başka alıcılar da var. Yöneticinize bildirildi, sizinle iletişime geçecek.</div>` : "";
  const head = `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px"><div style="min-width:0"><h3>${esc(L.title)}</h3>
    <div class="muted small-t">${esc(L.prop_type)} · ${esc(L.region)}${L.hood ? " / " + esc(L.hood) : ""} · <span class="num">${priceTxt(L)}</span>${S.fx?.usd_try && L.price_currency !== "TRY" ? ` <span class="num">(≈ ${(L.price_usd * S.fx.usd_try / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} M ₺)</span>` : ""}</div></div>
    <span class="chip"><b class="num">${list.length}</b>&nbsp;olası alıcı · ${scope}</span></div>${teamNote}`;
  const ai = !S.aiEnabled ? "" : `<div class="sec" style="margin-top:10px"><div class="row" style="align-items:center;justify-content:space-between"><div class="muted small-t" style="max-width:52ch">Notlar serbest yazıldıysa (“Urla tarafına bakıyordu, parası var”) Claude notları okuyup kaçan kişileri bulabilir.</div><button class="btn small" id="aiScanBtn" type="button">Notları Claude ile tara</button></div><div id="aiScanOut"></div></div>`;
  el.innerHTML = head + (list.length
    ? `<div>${list.slice(0, 150).map((m) => matchRow(m)).join("")}</div>${list.length > 150 ? `<div class="muted">İlk 150 kişi gösteriliyor.</div>` : ""}`
    : `<div class="empty" style="margin-top:10px"><h3>Kurala uyan kişi çıkmadı</h3><p style="margin:0">Kişilere bütçe, bölge ve geçmiş görüşme girdikçe eşleşmeler artar. Rehber sekmesinde “Henüz not girilmemiş” filtresiyle başlayabilirsiniz.</p></div>`) + ai;
  wireMatchButtons(el, L);
  if (S.aiEnabled) $("#aiScanBtn").onclick = () => aiScan(L, new Set(list.flatMap((m) => [m.c.id, ...m.others.map((o) => o.id)])));
}
function matchRow(m) {
  const c = m.c; const cls = m.s >= 60 ? "hi" : m.s >= 40 ? "md" : "";
  const owners = S.isAdmin ? [...new Set(m.owners)].map((o) => `<span class="chip owner">${esc(o === S.me.id ? "Benim rehberim" : pname(o))}</span>`).join("") : "";
  return `<div class="match"><div class="score ${cls}" title="Uyum puanı">${esc(m.s)}</div><div style="min-width:0">
    <div class="nm">${esc(c.name || "İsimsiz")}${c.tier ? ` <span class="chip" style="font-size:11px">${esc(c.tier)}</span>` : ""}</div><div class="ph">${phoneFmt(c.phone)}</div>
    <div class="why chips">${owners}${m.why.map((w) => `<span class="chip ${esc(w.k)}">${esc(w.t)}</span>`).join("")}</div>
    ${c.note ? `<div class="muted small-t" style="margin-top:6px">${esc(c.note.slice(0, 160))}${c.note.length > 160 ? "…" : ""}</div>` : ""}</div>
    <div class="acts"><button class="btn wa small" type="button" data-msg="${esc(c.id)}">WhatsApp mesajı</button><button class="btn small" type="button" data-open="${esc(c.id)}">Kartı aç</button></div></div>`;
}
function wireMatchButtons(el, L) {
  $$("[data-msg]", el).forEach((b) => (b.onclick = () => openDrawer(messageBox(S.byId.get(b.dataset.msg), L))));
  $$("[data-open]", el).forEach((b) => (b.onclick = () => openDrawer(contactBox(S.byId.get(b.dataset.open)))));
}

// ---------------- Claude ----------------
async function callAI(body) {
  const { data, error } = await sb.functions.invoke("ai", { body });
  if (error) {
    let code = "server";
    try { code = (await error.context.json()).error || code; } catch { /* yanıt okunamadı */ }
    throw Object.assign(new Error(code), { code });
  }
  return data;
}
const aiErr = (e) => ({
  rate_limited: "Şu an çok fazla istek var, biraz sonra tekrar deneyin.", api_key: "Claude bağlantısı kurulmamış (API anahtarı eksik ya da hatalı).",
  refused: "Claude bu isteği yanıtlamadı. Metni değiştirip tekrar deneyin.", inactive: "Hesabınız etkin değil.", truncated: "Yanıt yarım kaldı, daha az veriyle deneyin.",
}[e?.code] || "Claude şu an yanıt veremedi, tekrar deneyin.");

async function aiScan(L, skip) {
  const out = $("#aiScanOut"), btn = $("#aiScanBtn"); btn.disabled = true;
  out.innerHTML = `<div class="muted" style="margin-top:10px">Claude notları okuyor… (büyük rehberde bir dakika sürebilir)</div>`;
  const seen = new Set(), lines = [];
  let bytes = 0, cut = false;
  for (const c of S.contacts) {
    if (skip.has(c.id) || seen.has(c.phone)) continue;
    if (!(c.note?.length > 3) && !c.hist.length) continue;
    seen.add(c.phone);
    const hs = c.hist.slice(-6).map((x) => `${x.happened_on?.slice(0, 7)} ${x.region} ${x.prop_type} ${x.price_usd ? fmtShort(x.price_usd) : ""} ${x.outcome} ${x.note}`).join("; ");
    const ln = `${c.id}|${c.name || ""}|${(c.note || "").slice(0, 300)}|${hs.slice(0, 300)}`;
    bytes += ln.length; if (bytes > 400000 || lines.length >= 1500) { cut = true; break; }
    lines.push(ln);
  }
  if (!lines.length) { out.innerHTML = `<div class="muted" style="margin-top:10px">Taranacak başka notlu kişi yok.</div>`; btn.disabled = false; return; }
  try {
    const r = await callAI({ task: "scan", listing: L, lines });
    const arr = (r.matches || []).filter((x) => S.byId.has(String(x.id)));
    out.innerHTML = arr.length
      ? `<div style="margin-top:8px"><div class="lbl" style="margin-top:6px">Notlardan bulunanlar</div>${arr.map((x) => { const c = S.byId.get(String(x.id)); return matchRow({ c, s: "AI", owners: [c.owner_id], others: [], why: [{ k: "region", t: String(x.reason || "").slice(0, 160) }] }); }).join("")}</div>`
      : `<div class="muted" style="margin-top:10px">Claude notlarda bu mülke uyan ek kişi bulmadı.</div>`;
    if (cut) out.insertAdjacentHTML("beforeend", `<div class="muted small-t">Not sayısı çok fazla olduğu için ilk ${lines.length} kişi tarandı.</div>`);
    wireMatchButtons(out, L);
  } catch (e) { out.innerHTML = `<div class="muted" style="margin-top:10px">${esc(aiErr(e))}</div>`; }
  finally { btn.disabled = false; }
}

// ---------------- contacts tab ----------------
let renderLimit = 150;
["q", "fRegion", "fBudget", "fOwner", "fState"].forEach((id) => $("#" + id).addEventListener("input", () => { renderLimit = 150; renderContacts(); }));
$("#addContact").onclick = () => openDrawer(contactBox(null));
$("#reload").onclick = async () => { await loadAll(); toast("Güncellendi"); };
const hasInfo = (c) => !!(c.note || c.budget_max || c.regions?.length || c.hist.length);
function filtered() {
  const q = norm($("#q").value).split(" ").filter(Boolean), reg = norm($("#fRegion").value), bud = parseNum($("#fBudget").value), own = $("#fOwner").value, st = $("#fState").value;
  return S.contacts.filter((c) => {
    if (own && c.owner_id !== own) return false;
    if (st === "noted" && !hasInfo(c)) return false;
    if (st === "empty" && hasInfo(c)) return false;
    if (bud && !((c.budget_max || 0) >= bud)) return false;
    const hay = norm([c.name, c.phone, c.note, (c.regions || []).join(" "), (c.types || []).join(" "), c.hist.map((x) => [x.region, x.prop_type, x.note, x.outcome].join(" ")).join(" ")].join(" "));
    if (reg && !hay.includes(reg)) return false;
    return q.every((t) => hay.includes(t));
  });
}
function renderContacts() {
  const el = $("#contactTable"), total = S.contacts.length;
  const noted = S.contacts.filter(hasInfo).length, rich = S.contacts.filter((c) => (c.budget_max || 0) >= 1e6).length;
  $("#kpis").innerHTML = `<span><b>${total.toLocaleString("tr-TR")}</b>kişi</span><span><b>${noted.toLocaleString("tr-TR")}</b>notlu</span><span><b>${rich.toLocaleString("tr-TR")}</b>1M$+ bütçeli</span>`;
  if (!total) {
    el.innerHTML = `<div class="empty"><h3>Rehber boş</h3><p>Telefon rehberinizi yükleyin ya da tek tek kişi ekleyin. Sonra kişilere bütçe, bölge ve geçmiş görüşmeleri yazarsınız.</p><button class="btn primary" type="button" id="goImport">Rehber yükle</button></div>`;
    $("#goImport").onclick = () => showTab("import"); return;
  }
  const rows = filtered();
  if (!rows.length) { el.innerHTML = `<div class="empty">Bu filtrelere uyan kişi yok.</div>`; return; }
  el.innerHTML = `<table><thead><tr><th>Kişi</th><th>Bütçe</th><th>Bölge / tür</th><th>Not</th>${S.isAdmin ? "<th>Danışman</th>" : ""}</tr></thead><tbody>
    ${rows.slice(0, renderLimit).map((c) => `<tr class="click" data-id="${esc(c.id)}" tabindex="0">
      <td><div style="font-weight:600">${esc(c.name || "İsimsiz")}${c.tier ? ` <span class="chip" style="font-size:11px">${esc(c.tier)}</span>` : ""}</div><div class="num muted" style="font-size:12.5px">${phoneFmt(c.phone)}</div></td>
      <td class="num" style="white-space:nowrap">${c.budget_max ? (c.budget_min ? fmtShort(c.budget_min) + "–" : "") + fmtShort(c.budget_max) + (c.budget_currency === "TRY" && c.budget_fx_day ? ` <span class="muted" title="${esc("TL girildi, " + dayTxt(c.budget_fx_day) + " kuruyla")}">₺</span>` : "") : '<span class="muted">—</span>'}</td>
      <td><div class="chips">${(c.regions || []).map((r) => `<span class="chip region">${esc(r)}</span>`).join("")}${(c.types || []).map((r) => `<span class="chip">${esc(r)}</span>`).join("")}</div></td>
      <td><div class="note">${esc(c.note || "")}</div></td>${S.isAdmin ? `<td class="muted" style="font-size:13px;white-space:nowrap">${esc(c.owner_id === S.me.id ? "Ben" : pname(c.owner_id))}</td>` : ""}</tr>`).join("")}</tbody></table>
    <div class="row" style="justify-content:space-between;align-items:center;margin-top:10px"><span class="muted">${rows.length.toLocaleString("tr-TR")} kişiden ${Math.min(renderLimit, rows.length).toLocaleString("tr-TR")} tanesi</span>${rows.length > renderLimit ? `<button class="btn small" type="button" id="more">Daha fazla göster</button>` : ""}</div>`;
  $$("tr.click", el).forEach((tr) => { const o = () => openDrawer(contactBox(S.byId.get(tr.dataset.id))); tr.onclick = o; tr.onkeydown = (e) => { if (e.key === "Enter") o(); }; });
  const mb = $("#more"); if (mb) mb.onclick = () => { renderLimit += 300; renderContacts(); };
}

// ---------------- drawer ----------------
function openDrawer(node) {
  closeDrawer();
  const scrim = document.createElement("div"); scrim.className = "scrim"; scrim.onclick = closeDrawer;
  const d = document.createElement("aside"); d.className = "drawer"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.appendChild(node);
  $("#drawerRoot").append(scrim, d);
  $$("[data-close]", d).forEach((b) => (b.onclick = closeDrawer));
  const f = d.querySelector("input,textarea,select"); if (f) f.focus();
  document.addEventListener("keydown", escClose);
}
function closeDrawer() { $("#drawerRoot").innerHTML = ""; document.removeEventListener("keydown", escClose); }
const escClose = (e) => { if (e.key === "Escape") closeDrawer(); };
const h = (html) => { const t = document.createElement("div"); t.innerHTML = html; return t; };
const dHead = (title, sub) => `<header><div style="min-width:0"><h2>${title}</h2>${sub ? `<div class="muted small-t">${sub}</div>` : ""}</div><button class="btn ghost" type="button" data-close>Kapat</button></header>`;
function confirmBox(title, sub, fn, yes = "Evet, sil") {
  const n = h(`${dHead(esc(title), esc(sub))}<div class="row"><button class="btn primary" type="button" id="yes">${esc(yes)}</button><button class="btn" type="button" data-close>Vazgeç</button></div>`);
  $("#yes", n).onclick = async () => { try { await fn(); closeDrawer(); } catch (e) { console.error(e); toast(e?.message || "İşlem yapılamadı"); } };
  return n;
}

const budgetIn = (c, k) => {
  const v = c.budget_currency === "TRY" ? c["budget_" + k + "_try"] : c["budget_" + k];
  return v ? Math.round(v).toLocaleString("tr-TR") : "";
};
function budgetInfo(c) {
  if (c.budget_currency !== "TRY" || !c.budget_fx) return "";
  const tl = [c.budget_min_try, c.budget_max_try].filter((x) => x != null).map(fmtTRY).join(" – ");
  const usd = [c.budget_min, c.budget_max].filter((x) => x != null).map(fmtUSD).join(" – ");
  return `${tl} girildi · ${dayTxt(c.budget_fx_day)} kuru ${fxTxt(c.budget_fx)} ile <b class="num">${usd}</b> olarak saklanıyor. Eşleştirmede bu dolar değeri kullanılır.`;
}

function contactBox(c) {
  const isNew = !c;
  c = c || { name: "", regions: [], types: [], hist: [] };
  const hist = [...c.hist].sort((a, b) => (b.happened_on || "").localeCompare(a.happened_on || ""));
  const sub = isNew ? "" : phoneFmt(c.phone) + (S.isAdmin ? " · " + esc(c.owner_id === S.me.id ? "Benim rehberim" : pname(c.owner_id) + " rehberinde") : "");
  const n = h(`${dHead(isNew ? "Yeni kişi" : esc(c.name || "İsimsiz"), sub)}
  <div class="stack">
    <div class="row"><label class="f" style="flex:2 1 200px">Ad soyad<input id="c-name" value="${esc(c.name)}"></label>
      <label class="f">Telefon<input id="c-phone" value="${isNew ? "" : esc(phoneFmt(c.phone))}" ${isNew ? "" : "disabled"} inputmode="tel" placeholder="0532 123 45 67"></label></div>
    <label class="f">Notlar (kim, ne iş yapar, ne arıyor)<textarea id="c-note" placeholder="Ör. Bornova’da iki eczanesi var. 2–3 milyon $ arası Urla/Çeşme’de villa bakıyor. 1,5 yıl önce Güzelbahçe arsasıyla ilgilendi, fiyat yüksek geldi.">${esc(c.note || "")}</textarea></label>
    <div class="row" style="align-items:center" ${S.aiEnabled ? "" : "hidden"}><button class="btn small" type="button" id="c-ai">Nottan alanları doldur (Claude)</button><span class="muted small-t" id="c-ai-st">Bütçe, bölge, tür ve geçmiş görüşmeleri notunuzdan çıkarır.</span></div>
    <div class="row"><label class="f" style="flex:0 1 110px">Bütçe birimi<select id="c-cur"><option value="USD" ${c.budget_currency === "TRY" ? "" : "selected"}>$ USD</option><option value="TRY" ${c.budget_currency === "TRY" ? "selected" : ""}>₺ TL</option></select></label>
      <label class="f">Bütçe en az<input id="c-min" inputmode="numeric" value="${budgetIn(c, "min")}" placeholder="1.500.000"></label>
      <label class="f">Bütçe en çok<input id="c-max" inputmode="numeric" value="${budgetIn(c, "max")}" placeholder="3.000.000"></label>
      <label class="f">Potansiyel<select id="c-tier"><option value="">—</option>${["A", "B", "C"].map((t) => `<option ${c.tier === t ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
    <div class="muted small-t" id="c-budget-info">${budgetInfo(c)}</div>
    <label class="f">İlgilendiği bölgeler (virgülle)<input id="c-reg" value="${esc((c.regions || []).join(", "))}" placeholder="Urla, Çeşme, Güzelbahçe"></label>
    <div><div class="lbl">Aradığı mülk türleri</div><div class="chips" id="c-types">${TYPES.map((t) => `<button type="button" class="chip toggle" aria-pressed="${(c.types || []).includes(t)}">${esc(t)}</button>`).join("")}</div></div>
    <div id="c-pending" class="muted small-t"></div>
    <div class="row"><button class="btn primary" type="button" id="c-save">${isNew ? "Kişiyi ekle" : "Kaydet"}</button>${isNew ? "" : `<button class="btn ghost" type="button" id="c-del">Kişiyi sil</button>`}</div>
    ${isNew ? "" : `<div class="sec"><h4>Geçmiş görüşmeler ve mülkler</h4><div id="c-hist">${hist.length ? hist.map((x) => `<div class="hist-item"><span class="d">${esc((x.happened_on || "").slice(0, 7))}</span><span><b>${esc(x.region)}</b> ${esc(x.prop_type)}${x.price_usd ? ` <span class="num">${fmtShort(x.price_usd)}</span>${x.price_try ? ` <span class="muted num" title="${esc("Kur: " + x.price_fx)}">(${fmtTRY(x.price_try)})</span>` : ""}` : ""} · ${esc(x.outcome)}${x.note ? `<div class="muted small-t">${esc(x.note)}</div>` : ""}</span><button class="btn ghost small" type="button" data-hdel="${esc(x.id)}">Sil</button></div>`).join("") : `<div class="muted" style="font-size:14px">Henüz kayıt yok. “1,5 yıl önce Güzelbahçe’de arsa sundum, olmadı” gibi bir kayıt, o bölgeden mülk geldiğinde bu kişiyi öne çıkarır.</div>`}</div>
      <form id="h-form" class="stack" style="margin-top:12px" autocomplete="off"><div class="row"><label class="f">Tarih<input type="month" id="h-date" value="${today().slice(0, 7)}"></label><label class="f">Bölge<input id="h-reg" list="regionList" required placeholder="Güzelbahçe"></label><label class="f">Tür<select id="h-type"><option value=""></option>${TYPES.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label></div>
      <div class="row"><label class="f" style="flex:0 1 110px">Birim<select id="h-cur"><option value="USD">$ USD</option><option value="TRY">₺ TL</option></select></label><label class="f">Tutar<input id="h-price" inputmode="numeric" placeholder="450.000"></label><label class="f" id="h-fx-wrap" hidden>O tarihteki kur<input id="h-fx" inputmode="decimal"></label></div>
      <div class="muted small-t" id="h-fx-info" hidden></div>
      <div class="row"><label class="f">Sonuç<select id="h-out">${OUTCOMES.map((o) => `<option>${esc(o)}</option>`).join("")}</select></label></div>
      <label class="f">Kısa not<input id="h-note" placeholder="Fiyatı yüksek buldu, 400 bin $ altını düşünür"></label><div><button class="btn" type="submit">Görüşme ekle</button></div></form></div>`}
  </div>`);
  $$("#c-types .chip", n).forEach((b) => (b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true")));
  let pendingHist = [];
  const collect = () => ({
    name: $("#c-name", n).value.trim(), note: $("#c-note", n).value.trim(),
    ...budgetFields({ currency: $("#c-cur", n).value, min: parseNum($("#c-min", n).value), max: parseNum($("#c-max", n).value), rate: S.fx?.usd_try, day: today(), prev: isNew ? null : c }),
    tier: $("#c-tier", n).value || null,
    regions: $("#c-reg", n).value.split(",").map((s) => s.trim()).filter(Boolean),
    types: $$("#c-types .chip[aria-pressed=true]", n).map((b) => b.textContent),
  });
  const budgetPreview = () => {
    const cur = $("#c-cur", n).value, mx = parseNum($("#c-max", n).value), mn = parseNum($("#c-min", n).value);
    if (cur !== "TRY" || (mx == null && mn == null)) { $("#c-budget-info", n).innerHTML = cur === "TRY" ? "TL girilen bütçe, kaydettiğiniz günün kuruyla dolara çevrilip sabitlenir." : ""; return; }
    try { const f = budgetFields({ currency: "TRY", min: mn, max: mx, rate: S.fx?.usd_try, day: today(), prev: isNew ? null : c }); $("#c-budget-info", n).innerHTML = budgetInfo(f); }
    catch { $("#c-budget-info", n).textContent = "Kur henüz alınamadı; TL bütçe kaydetmek için biraz sonra tekrar deneyin."; }
  };
  ["c-cur", "c-min", "c-max"].forEach((id) => $("#" + id, n).addEventListener("input", budgetPreview));
  $("#c-save", n).onclick = async () => {
    let data;
    try { data = collect(); } catch { return toast("Kur henüz alınamadı, TL bütçe kaydedilemiyor. Biraz sonra tekrar deneyin."); }
    try {
      let row;
      if (isNew) {
        const phone = phoneNorm($("#c-phone", n).value);
        if (!phone) return toast("Geçerli bir telefon numarası girin");
        if (S.contacts.some((x) => x.phone === phone && x.owner_id === S.me.id)) return toast("Bu numara rehberinizde zaten var");
        const r = await sb.from("contacts").insert({ ...data, phone, owner_id: S.me.id, source: "elle" }).select().single();
        if (r.error) throw r.error; row = r.data;
      } else {
        const r = await sb.from("contacts").update(data).eq("id", c.id).select().single();
        if (r.error) throw r.error; row = r.data;
      }
      let hist = isNew ? [] : S.byId.get(row.id)?.hist || [];
      if (pendingHist.length) {
        const r = await sb.from("interactions").insert(pendingHist.map((x) => ({ ...x, contact_id: row.id }))).select();
        if (r.error) throw r.error; hist = [...hist, ...r.data];
      }
      upsertLocalContact({ ...row, hist }); renderAll(); toast(isNew ? "Kişi eklendi" : "Kaydedildi"); closeDrawer();
    } catch (e) { console.error(e); toast("Kaydedilemedi"); }
  };
  const del = $("#c-del", n);
  if (del) del.onclick = () => openDrawer(confirmBox((c.name || "Bu kişi") + " silinsin mi?", "Kişi ve geçmiş görüşmeleri kalıcı olarak silinir.", async () => {
    const { error } = await sb.from("contacts").delete().eq("id", c.id); if (error) throw error;
    removeLocalContact(c.id); renderAll(); toast("Kişi silindi");
  }));
  const hf = $("#h-form", n);
  if (hf) hf.onsubmit = async (e) => {
    e.preventDefault();
    const amount = parseNum($("#h-price", n).value), isTry = $("#h-cur", n).value === "TRY";
    const fx = isTry ? parseFloat(String($("#h-fx", n).value).replace(/\./g, "").replace(",", ".")) : null;
    if (isTry && amount && !(fx > 0)) return toast("O tarihteki dolar kurunu girin");
    const x = { contact_id: c.id, happened_on: ($("#h-date", n).value || today().slice(0, 7)) + "-01", region: $("#h-reg", n).value.trim(), prop_type: $("#h-type", n).value,
      price_usd: amount ? (isTry ? Math.round(amount / fx) : amount) : null, price_try: isTry ? amount : null, price_fx: isTry && amount ? fx : null,
      outcome: $("#h-out", n).value, note: $("#h-note", n).value.trim() };
    const { data, error } = await sb.from("interactions").insert(x).select().single();
    if (error) return toast("Kaydedilemedi");
    const cur = S.byId.get(c.id); upsertLocalContact({ ...cur, hist: [...cur.hist, data] }); renderAll(); toast("Görüşme eklendi");
    openDrawer(contactBox(S.byId.get(c.id)));
  };
  const fillHistRate = async () => {
    if (!hf) return;
    const isTry = $("#h-cur", n).value === "TRY";
    $("#h-fx-wrap", n).hidden = !isTry; $("#h-fx-info", n).hidden = !isTry;
    if (!isTry) return;
    const month = $("#h-date", n).value || today().slice(0, 7);
    const day = month === today().slice(0, 7) ? today() : month + "-15";
    $("#h-fx-info", n).textContent = "Kur getiriliyor…";
    try {
      const r = await rateFor(day);
      $("#h-fx", n).value = fxTxt(r.usd_try);
      $("#h-fx-info", n).textContent = `${dayTxt(r.day)} TCMB kuru${r.approximate ? " (yaklaşık)" : ""}. TL tutar bu kurla dolara çevrilip saklanır; isterseniz kuru değiştirin.`;
    } catch { $("#h-fx-info", n).textContent = "Kur alınamadı. O tarihteki kuru elle girin."; }
  };
  if (hf) { $("#h-cur", n).onchange = fillHistRate; $("#h-date", n).onchange = fillHistRate; }
  $$("[data-hdel]", n).forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("interactions").delete().eq("id", b.dataset.hdel);
    if (error) return toast("Silinemedi");
    const cur = S.byId.get(c.id); upsertLocalContact({ ...cur, hist: cur.hist.filter((x) => x.id !== b.dataset.hdel) }); renderAll(); openDrawer(contactBox(S.byId.get(c.id)));
  }));
  $("#c-ai", n).onclick = async () => {
    const note = $("#c-note", n).value.trim(); const st = $("#c-ai-st", n), btn = $("#c-ai", n);
    if (note.length < 8) return toast("Önce birkaç cümle not yazın");
    btn.disabled = true; st.textContent = "Claude notu okuyor…";
    try {
      const r = await callAI({ task: "extract", note, usd_try: S.fx?.usd_try || null, types: TYPES, outcomes: OUTCOMES });
      if (r.budget_min || r.budget_max) {
        $("#c-cur", n).value = r.budget_currency === "TRY" ? "TRY" : "USD";
        $("#c-min", n).value = r.budget_min ? Math.round(r.budget_min).toLocaleString("tr-TR") : "";
        $("#c-max", n).value = r.budget_max ? Math.round(r.budget_max).toLocaleString("tr-TR") : "";
        budgetPreview();
      }
      if (r.regions?.length) { const cur = $("#c-reg", n).value.split(",").map((s) => s.trim()).filter(Boolean); $("#c-reg", n).value = [...new Set([...cur, ...r.regions.map(String)])].join(", "); }
      if (Array.isArray(r.types)) $$("#c-types .chip", n).forEach((b) => { if (r.types.includes(b.textContent)) b.setAttribute("aria-pressed", "true"); });
      if (r.tier && !$("#c-tier", n).value) $("#c-tier", n).value = r.tier;
      pendingHist = [];
      for (const x of (r.history || []).filter((x) => x && x.region)) {
        const happened_on = /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : /^\d{4}-\d{2}$/.test(x.date) ? x.date + "-01" : today();
        const amount = Number(x.price) || null;
        let price_usd = amount, price_try = null, price_fx = null;
        if (amount && x.price_currency === "TRY") {
          try { const fr = await rateFor(happened_on > today() ? today() : happened_on); price_fx = fr.usd_try; price_try = amount; price_usd = Math.round(amount / fr.usd_try); }
          catch { price_usd = null; price_try = amount; }
        }
        pendingHist.push({ happened_on, region: String(x.region).slice(0, 80), prop_type: TYPES.includes(x.type) ? x.type : "", price_usd, price_try, price_fx,
          outcome: OUTCOMES.includes(x.outcome) ? x.outcome : "İlgilendi", note: String(x.note || "").slice(0, 300) });
      }
      $("#c-pending", n).innerHTML = pendingHist.length ? "Kaydedince eklenecek geçmiş görüşmeler: " + pendingHist.map((x) => `<b>${esc(x.happened_on.slice(0, 7))} ${esc(x.region)}</b> ${esc(x.prop_type)}${x.price_usd ? " " + fmtShort(x.price_usd) : ""}${x.price_try ? ` (${fmtTRY(x.price_try)}${x.price_fx ? ", " + dayTxt(x.happened_on) + " kuru " + fxTxt(x.price_fx) : ", kur bulunamadı"})` : ""} · ${esc(x.outcome)}`).join("; ") : "";
      st.textContent = "Alanlar dolduruldu. Kontrol edip Kaydet’e basın.";
    } catch (e) { st.textContent = aiErr(e); }
    finally { btn.disabled = false; }
  };
  return n;
}

function messageBox(c, L) {
  const signer = S.me.full_name || "";
  const n = h(`${dHead("WhatsApp mesajı", esc(c.name || "") + " · " + phoneFmt(c.phone))}<div class="stack msgbox">
    <div class="muted small-t">${esc(L.title)} · <span class="num">${priceTxt(L)}</span></div>
    <div class="row"><label class="f" ${S.aiEnabled ? "" : "hidden"}>Ton<select id="m-tone"><option>Samimi ve profesyonel</option><option>Resmi</option><option>Kısa ve net</option></select></label><button class="btn" type="button" id="m-gen" ${S.aiEnabled ? "" : "hidden"}>Claude ile kişiye özel yaz</button></div>
    <textarea id="m-text">${esc(templateMessage(c, L, signer))}</textarea>
    <div class="muted small-t" id="m-st">${S.aiEnabled ? "Hazır şablon yüklendi. Claude, kişinin notlarına ve geçmiş görüşmelerine göre yeniden yazabilir." : "Hazır şablon yüklendi. Göndermeden önce kişiye göre düzenleyebilirsiniz."}</div>
    <div class="row"><a class="btn wa" id="m-wa" href="#" target="_blank" rel="noopener">WhatsApp’ta aç</a><button class="btn" type="button" id="m-copy">Metni kopyala</button><button class="btn ghost" type="button" id="m-done">Gönderildi olarak işaretle</button></div>
    <div class="muted" style="font-size:12.5px">Mesaj sizin WhatsApp’ınızdan, siz Gönder’e bastığınızda gider.</div></div>`);
  const ta = $("#m-text", n), wa = $("#m-wa", n);
  const upd = () => (wa.href = waLink(c.phone, ta.value)); ta.oninput = upd; upd();
  $("#m-copy", n).onclick = async () => { try { await navigator.clipboard.writeText(ta.value); toast("Kopyalandı"); } catch { ta.select(); toast("Metni seçtim, kopyalayabilirsiniz"); } };
  $("#m-done", n).onclick = async () => {
    const x = { contact_id: c.id, happened_on: today(), region: L.region, prop_type: L.prop_type, price_usd: L.price_usd, outcome: "Portföy sunuldu", note: L.title + " WhatsApp ile gönderildi", listing_id: L.id };
    const { data, error } = await sb.from("interactions").insert(x).select().single();
    if (error) return toast(S.isAdmin || c.owner_id === S.me.id ? "Kaydedilemedi" : "Bu kişi için kayıt yetkiniz yok");
    const cur = S.byId.get(c.id); upsertLocalContact({ ...cur, hist: [...cur.hist, data] }); renderMatches(); toast("Geçmişe işlendi"); closeDrawer();
  };
  $("#m-gen", n).onclick = async () => {
    const btn = $("#m-gen", n), st = $("#m-st", n); btn.disabled = true; st.textContent = "Claude yazıyor…";
    try {
      const r = await callAI({ task: "message", tone: $("#m-tone", n).value, signer, listing: L,
        contact: { name: c.name, note: c.note, budget_min: c.budget_min, budget_max: c.budget_max, regions: c.regions, hist: c.hist } });
      ta.value = r.text; upd(); st.textContent = "Kişiye özel mesaj hazır. İsterseniz düzenleyin.";
    } catch (e) { st.textContent = aiErr(e); }
    finally { btn.disabled = false; }
  };
  return n;
}

// ---------------- import ----------------
$("#file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const el = $("#importPreview");
  let text = await f.text();
  if (text.includes("\uFFFD")) { try { text = new TextDecoder("windows-1254").decode(await f.arrayBuffer()); } catch { /* utf-8 ile devam */ } }
  const recs = /BEGIN:VCARD/i.test(text) ? parseVCF(text) : parseCSV(text);
  const mine = new Set(S.contacts.filter((c) => c.owner_id === S.me.id).map((c) => c.phone));
  const prep = prepareImport(recs, mine);
  const nn = prep.rows.length;
  el.innerHTML = `<div class="kpis"><span><b>${prep.total.toLocaleString("tr-TR")}</b>kayıt okundu</span><span><b>${nn.toLocaleString("tr-TR")}</b>yeni kişi</span><span><b>${prep.dup.toLocaleString("tr-TR")}</b>zaten var</span><span><b>${prep.nophone.toLocaleString("tr-TR")}</b>numarasız</span></div>
    ${nn ? `<div class="tbl-wrap"><table><thead><tr><th>İsim</th><th>Telefon</th></tr></thead><tbody>${prep.rows.slice(0, 6).map((c) => `<tr><td>${esc(c.name || "İsimsiz")}</td><td class="num">${phoneFmt(c.phone)}</td></tr>`).join("")}</tbody></table></div>
    <div class="row" style="align-items:center"><button class="btn primary" type="button" id="doImport">${nn.toLocaleString("tr-TR")} kişiyi rehberime ekle</button><span id="impProg" class="muted"></span></div>` : `<div class="muted">Eklenecek yeni kişi yok.</div>`}`;
  const b = $("#doImport");
  if (b) b.onclick = async () => {
    b.disabled = true; const prog = $("#impProg"); let done = 0;
    try {
      for (let i = 0; i < prep.rows.length; i += 500) {
        const chunk = prep.rows.slice(i, i + 500).map((r) => ({ ...r, owner_id: S.me.id, source: f.name.slice(0, 80) }));
        const { error } = await sb.from("contacts").upsert(chunk, { onConflict: "owner_id,phone", ignoreDuplicates: true });
        if (error) throw error;
        done += chunk.length; prog.textContent = `Yükleniyor… %${Math.round((done / prep.rows.length) * 100)}`;
      }
      prog.textContent = "Tamamlandı."; toast(nn.toLocaleString("tr-TR") + " kişi eklendi"); e.target.value = "";
      await loadAll();
    } catch (err) {
      console.error(err);
      prog.textContent = `${done.toLocaleString("tr-TR")} kişi eklendi, kalanı yüklenemedi. Dosyayı tekrar seçip deneyin (eklenenler tekrar eklenmez).`; b.disabled = false;
    }
  };
};

// ---------------- team matches (admin) ----------------
$("#alertFilter").onchange = () => renderAlerts();
$("#rescan").onclick = async () => {
  const btn = $("#rescan"); btn.disabled = true;
  const targets = S.listings.filter((L) => L.status === "active" && S.profiles.get(L.created_by)?.role !== "admin");
  try {
    for (const L of targets) await sb.rpc("refresh_team_matches", { p_listing: L.id });
    await loadTeamMatches(); renderAlerts(); toast(targets.length + " portföy tarandı");
  } finally { btn.disabled = false; }
};
function renderAlerts() {
  const el = $("#alertList"), status = $("#alertFilter").value;
  const rows = S.teamMatches.filter((r) => r.status === status && S.byId.has(r.contact_id) && S.listings.some((L) => L.id === r.listing_id));
  if (!rows.length) {
    el.innerHTML = `<div class="empty"><h3>${status === "new" ? "Yeni ekip eşleşmesi yok" : "Kayıt yok"}</h3><p style="margin:0">Danışmanlar portföy girdikçe, başka bir danışmanın rehberinde uyan alıcı varsa burada görünür. “Yeniden tara” yeni eklenen kişileri de hesaba katar.</p></div>`;
    return;
  }
  const byListing = new Map();
  for (const r of rows) { if (!byListing.has(r.listing_id)) byListing.set(r.listing_id, []); byListing.get(r.listing_id).push(r); }
  el.innerHTML = [...byListing.entries()].map(([lid, rs]) => {
    const L = S.listings.find((x) => x.id === lid);
    rs.sort((a, b) => b.score - a.score);
    return `<div class="panel stack"><div><h3>${esc(L.title)}</h3><div class="muted small-t">${esc(pname(L.created_by))} girdi · ${esc(L.prop_type)} · ${esc(L.region)} · <span class="num">${priceTxt(L)}</span></div></div>
      ${rs.map((r) => { const c = S.byId.get(r.contact_id); return `<div class="match"><div class="score ${r.score >= 60 ? "hi" : r.score >= 40 ? "md" : ""}">${esc(r.score)}</div><div style="min-width:0">
        <div class="nm">${esc(c.name || "İsimsiz")}</div><div class="ph">${phoneFmt(c.phone)}</div>
        <div class="why chips"><span class="chip owner">${esc(c.owner_id === S.me.id ? "Benim rehberim" : pname(c.owner_id) + " rehberinde")}</span>${(r.reasons || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div></div>
        <div class="acts">${status === "new" ? `<button class="btn primary small" type="button" data-st="shared" data-l="${esc(lid)}" data-c="${esc(c.id)}">Paylaştım</button><button class="btn small" type="button" data-st="dismissed" data-l="${esc(lid)}" data-c="${esc(c.id)}">İlgisiz</button>` : `<button class="btn small" type="button" data-st="new" data-l="${esc(lid)}" data-c="${esc(c.id)}">Yeniye al</button>`}
        <button class="btn ghost small" type="button" data-open="${esc(c.id)}">Kartı aç</button></div></div>`; }).join("")}</div>`;
  }).join("");
  $$("[data-st]", el).forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("team_matches").update({ status: b.dataset.st }).eq("listing_id", b.dataset.l).eq("contact_id", b.dataset.c);
    if (error) return toast("Güncellenemedi");
    const r = S.teamMatches.find((x) => x.listing_id === b.dataset.l && x.contact_id === b.dataset.c); if (r) r.status = b.dataset.st;
    const n = S.teamMatches.filter((x) => x.status === "new").length; $("#alertBadge").textContent = n; $("#alertBadge").hidden = !n;
    renderAlerts();
  }));
  $$("[data-open]", el).forEach((b) => (b.onclick = () => openDrawer(contactBox(S.byId.get(b.dataset.open)))));
}

// ---------------- team (admin) ----------------
async function adminCall(body) {
  const { data, error } = await sb.functions.invoke("admin-users", { body });
  if (error) { let msg = "İşlem yapılamadı"; try { msg = (await error.context.json()).error || msg; } catch { /* boş */ } throw new Error(msg); }
  return data;
}
$("#newUser").onsubmit = async (e) => {
  e.preventDefault(); const btn = e.submitter; btn.disabled = true;
  try {
    await adminCall({ action: "create", full_name: $("#nu-name").value.trim(), email: $("#nu-email").value.trim(), password: $("#nu-pass").value });
    toast("Hesap açıldı. E-posta ve geçici şifreyi danışmana iletin."); e.target.reset(); await loadAll(); renderTeam();
  } catch (err) { toast(err.message); } finally { btn.disabled = false; }
};
function renderTeam() {
  const counts = new Map(); for (const c of S.contacts) counts.set(c.owner_id, (counts.get(c.owner_id) || 0) + 1);
  const ps = [...S.profiles.values()].sort((a, b) => (b.role === "admin") - (a.role === "admin") || (a.full_name || "").localeCompare(b.full_name || "", "tr"));
  $("#teamTable").innerHTML = `<table><thead><tr><th>Kişi</th><th>Rol</th><th>Rehber</th><th>Durum</th><th></th></tr></thead><tbody>${ps.map((p) => `<tr>
    <td><div style="font-weight:600">${esc(p.full_name || "—")}${p.id === S.me.id ? " (siz)" : ""}</div><div class="muted small-t">${esc(p.email)}</div></td>
    <td>${p.role === "admin" ? "Yönetici" : "Danışman"}</td><td class="num">${(counts.get(p.id) || 0).toLocaleString("tr-TR")}</td>
    <td>${p.active ? '<span class="chip hist">Açık</span>' : '<span class="chip warn">Kapalı</span>'}</td>
    <td>${p.id === S.me.id ? "" : `<div class="row" style="gap:6px">
      <button class="btn small" type="button" data-act="pass" data-id="${esc(p.id)}">Şifre sıfırla</button>
      <button class="btn small" type="button" data-act="${p.active ? "close" : "open"}" data-id="${esc(p.id)}">${p.active ? "Hesabı kapat" : "Hesabı aç"}</button>
      <button class="btn small" type="button" data-act="role" data-id="${esc(p.id)}">${p.role === "admin" ? "Danışman yap" : "Yönetici yap"}</button>
      ${counts.get(p.id) ? `<button class="btn ghost small" type="button" data-act="take" data-id="${esc(p.id)}">Rehberini devral</button>` : ""}</div>`}</td></tr>`).join("")}</tbody></table>`;
  $$("[data-act]", $("#teamTable")).forEach((b) => (b.onclick = () => teamAction(b.dataset.act, S.profiles.get(b.dataset.id))));
}
function teamAction(act, p) {
  const who = p.full_name || p.email;
  if (act === "pass") {
    const n = h(`${dHead("Şifre sıfırla", esc(who))}<div class="stack"><label class="f">Yeni geçici şifre (en az 8 karakter)<input id="np" minlength="8"></label><div><button class="btn primary" type="button" id="npSave">Kaydet</button></div></div>`);
    $("#npSave", n).onclick = async () => { try { await adminCall({ action: "reset_password", user_id: p.id, password: $("#np", n).value }); toast("Şifre değiştirildi"); closeDrawer(); } catch (e) { toast(e.message); } };
    return openDrawer(n);
  }
  if (act === "close" || act === "open") return openDrawer(confirmBox(act === "close" ? `${who} hesabı kapatılsın mı?` : `${who} hesabı açılsın mı?`,
    act === "close" ? "Giriş yapamaz ve hiçbir veriyi göremez. Rehberi silinmez; isterseniz devralabilirsiniz." : "Tekrar giriş yapabilir.",
    async () => { await adminCall({ action: "set_active", user_id: p.id, active: act === "open" }); await loadAll(); renderTeam(); toast("Güncellendi"); }, "Evet"));
  if (act === "role") return openDrawer(confirmBox(p.role === "admin" ? `${who} danışman yapılsın mı?` : `${who} yönetici yapılsın mı?`,
    p.role === "admin" ? "Yalnızca kendi rehberini görür." : "Bütün danışmanların rehberini görür ve hesapları yönetir.",
    async () => { await adminCall({ action: "set_role", user_id: p.id, role: p.role === "admin" ? "consultant" : "admin" }); await loadAll(); renderTeam(); toast("Güncellendi"); }, "Evet"));
  if (act === "take") return openDrawer(confirmBox(`${who} rehberi sizin rehberinize taşınsın mı?`,
    "Aynı numara sizde de varsa kayıtlar birleştirilir: notlar eklenir, görüşmeler taşınır.",
    async () => { const { data, error } = await sb.rpc("transfer_contacts", { from_user: p.id, to_user: S.me.id }); if (error) throw error; await loadAll(); renderTeam(); toast(data + " kişi taşındı"); }, "Evet, devral"));
}

// ---------------- account ----------------
function renderAccount() {
  if (!S.me) return;
  $("#acc-who").textContent = `${S.me.email} · ${S.isAdmin ? "Yönetici" : "Danışman"}`;
  $("#acc-name").value = S.me.full_name || "";
  renderMfa();
}
$("#accName").onsubmit = async (e) => {
  e.preventDefault(); const v = $("#acc-name").value.trim();
  const { error } = await sb.rpc("set_my_name", { new_name: v });
  if (error) return toast("Kaydedilemedi");
  S.me.full_name = v; S.profiles.set(S.me.id, { ...S.profiles.get(S.me.id), full_name: v }); toast("Kaydedildi");
};
$("#accPass").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $("#acc-pass").value });
  if (error) return toast(/same/i.test(error.message) ? "Yeni şifre eskisiyle aynı olamaz" : error.message);
  e.target.reset(); toast("Şifreniz değiştirildi");
};
async function renderMfa() {
  const el = $("#mfaPanel");
  const { data } = await sb.auth.mfa.listFactors();
  const active = data?.totp?.find((f) => f.status === "verified");
  if (active) {
    el.innerHTML = `<h3>İki adımlı doğrulama</h3><div><span class="chip hist">Açık</span></div><p class="muted" style="margin:0">Her girişte şifrenize ek olarak Google Authenticator kodunuz istenir.</p><div><button class="btn" type="button" id="mfaOff">Kapat</button></div>`;
    $("#mfaOff").onclick = () => openDrawer(confirmBox("İki adımlı doğrulama kapatılsın mı?", "Girişte yalnızca şifreniz istenir.", async () => {
      const { error } = await sb.auth.mfa.unenroll({ factorId: active.id }); if (error) throw error; await sb.auth.refreshSession(); renderMfa(); toast("Kapatıldı");
    }, "Evet, kapat"));
    return;
  }
  el.innerHTML = `<h3>İki adımlı doğrulama</h3><p class="muted" style="margin:0">Şifreniz ele geçse bile hesabınıza girilemez. Telefonunuza Google Authenticator (ya da Microsoft Authenticator) uygulamasını kurun, sonra aşağıdaki düğmeye basın.</p><div><button class="btn primary" type="button" id="mfaOn">Aç</button></div><div id="mfaSetup" class="stack"></div>`;
  $("#mfaOn").onclick = async () => {
    for (const f of data?.all || []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data: en, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator " + Date.now().toString(36) });
    if (error) return toast(error.message);
    const box = $("#mfaSetup");
    box.innerHTML = `<div class="muted small-t">1. Uygulamada “+” ile bu kodu okutun:</div><div class="qr"><img alt="Doğrulama QR kodu" src="${esc(en.totp.qr_code)}"></div>
      <div class="muted small-t">Okutamıyorsanız elle girin: <span class="num" style="user-select:all">${esc(en.totp.secret)}</span></div>
      <label class="f">2. Uygulamadaki 6 haneli kod<input id="mfaCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><div><button class="btn primary" type="button" id="mfaVerify">Doğrula ve aç</button></div>`;
    $("#mfaVerify").onclick = async () => {
      const { error: e2 } = await sb.auth.mfa.challengeAndVerify({ factorId: en.id, code: $("#mfaCode").value.trim() });
      if (e2) return toast("Kod hatalı, tekrar deneyin");
      toast("İki adımlı doğrulama açıldı"); renderMfa();
    };
  };
}
