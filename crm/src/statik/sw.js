// Satal servis çalışanı: uygulamanın ana ekrana eklenebilmesi ve bağlantı koptuğunda anlaşılır bir sayfa göstermesi için.
// Kişisel veri içeren sayfalar önbelleğe alınmaz; yalnızca stil, betik ve simgeler saklanır.
const ONBELLEK = "satal-statik-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const ad of await caches.keys()) if (ad !== ONBELLEK) await caches.delete(ad);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/statik/")) {
    e.respondWith((async () => {
      const c = await caches.open(ONBELLEK);
      const eski = await c.match(e.request);
      if (eski) return eski;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    })());
  } else if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => new Response(
      '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Satal</title><body><h1>Bağlantı yok</h1><p>İnternet bağlantınızı kontrol edip sayfayı yenileyin.</p></body></html>',
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } })));
  }
});
