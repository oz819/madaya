// App-shell service worker (spec §6.1 step 1). Hand-written: the app needs only three rules.
//   /_next/static/*    cache-first (content-hashed, immutable)
//   page navigations   network-first, falling back to the cached app shell when offline
//   other same-origin  stale-while-revalidate (icons, manifest, background image)
// Supabase requests are cross-origin and never touched; data offline comes from IndexedDB.

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"]).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Only a real, signed-in app page becomes the offline shell (not a redirect to /login).
          if (res.ok && !res.redirected && url.pathname === SHELL_URL) {
            const cache = await caches.open(SHELL);
            await cache.put(SHELL_URL, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          const shell = await cache.match(SHELL_URL);
          if (shell) return shell;
          return new Response(
            '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Tahoma,sans-serif;padding:24px;text-align:center"><h2>بدون اتصال</h2><p>افتح التطبيق مرة واحدة وأنت متصل بالإنترنت ليعمل بعدها بدون اتصال.</p></body></html>',
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
    return;
  }

  // RSC payloads for client navigations: network only (the app is a single page anyway).
  if (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") return;

  event.respondWith(
    caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
