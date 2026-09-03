const CACHE_NAME = "gitmind-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/static/js/main.af186b9e.js",
  "/static/css/main.5c88b50d.css",
  "/favicon.ico",
  "/logo192.png",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests, API, and WebSocket requests
  if (
    url.origin !== location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/ws") ||
    request.method !== "GET"
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match("/index.html"));

      return cached || fetchPromise;
    })
  );
});
