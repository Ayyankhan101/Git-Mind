const CACHE_NAME = "gitmind-v2";

self.addEventListener("install", (event) => {
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

  // Skip cross-origin, API, WebSocket, non-GET
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
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"));
    }).catch(() => new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } }))
  );
});
