/* Callboard offline support for crew call sheets (/c/...). */
const VERSION = "v1";
const PAGES = "callboard-pages-" + VERSION;
const ASSETS = "callboard-assets-" + VERSION;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("callboard-") && !key.endsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetchWithTimeout(request, 6000);
    if (res.ok && !res.redirected) cache.put(request.url, res.clone());
    return res;
  } catch (_err) {
    const hit =
      (await cache.match(request.url, { ignoreVary: true })) ||
      (await cache.match(request.url, { ignoreVary: true, ignoreSearch: true }));
    if (hit) return hit;
    return new Response("You're offline and this call sheet hasn't been saved on this device yet. Open it once while online.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" && url.pathname.startsWith("/c/")) {
    event.respondWith(networkFirst(req));
  }
});
