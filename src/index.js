const BACKEND_ORIGIN = "https://ak001z-gitmind-backend.hf.space";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": url.origin,
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-GH-Token, X-Request-ID, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Proxy API requests to HuggingFace backend
    if (url.pathname.startsWith("/api/")) {
      const backendUrl = new URL(request.url);
      backendUrl.hostname = new URL(BACKEND_ORIGIN).hostname;
      backendUrl.protocol = new URL(BACKEND_ORIGIN).protocol;
      // Strip /api/ prefix — backend routes don't have it
      backendUrl.pathname = url.pathname.slice(4) + url.search;

      const proxyRequest = new Request(backendUrl.toString(), request);
      proxyRequest.headers.set("Origin", BACKEND_ORIGIN);

      // Explicitly forward auth headers (CF Workers strips them on cross-origin new Request)
      const authHeader = request.headers.get("Authorization");
      if (authHeader) proxyRequest.headers.set("Authorization", authHeader);
      const ghToken = request.headers.get("X-GH-Token");
      if (ghToken) proxyRequest.headers.set("X-GH-Token", ghToken);

      try {
        const response = await fetch(proxyRequest);
        const newResponse = new Response(response.body, response);

        // CORS headers for API responses
        newResponse.headers.set("Access-Control-Allow-Origin", url.origin);
        newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, X-GH-Token, X-Request-ID, Authorization");

        // Security headers
        newResponse.headers.set("X-Frame-Options", "DENY");
        newResponse.headers.set("X-Content-Type-Options", "nosniff");

        return newResponse;
      } catch (error) {
        return new Response(JSON.stringify({ error: "Backend unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Serve static assets
    const response = await env.ASSETS.fetch(request);
    const newResponse = new Response(response.body, response);

    // Security headers
    newResponse.headers.set("X-Frame-Options", "DENY");
    newResponse.headers.set("X-Content-Type-Options", "nosniff");
    newResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    newResponse.headers.set("X-XSS-Protection", "1; mode=block");

    // Cache static assets aggressively
    if (url.pathname.includes("/static/")) {
      newResponse.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }

    return newResponse;
  },
};
