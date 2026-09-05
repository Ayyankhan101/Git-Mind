const CACHE_NAME = "gitmind-v3";

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

// The HTML document (navigations + "/") must never be served stale — it's
// the only thing that references which hashed JS/CSS bundle is current.
// Cache-first on it is what pinned users to old deploys indefinitely
// (gitmind-v2 regression). Static, content-hashed assets stay cache-first
// since a given hash's content never changes.
function isDocumentRequest(request, url) {
  return request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html";
}

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

  if (isDocumentRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
    );
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
