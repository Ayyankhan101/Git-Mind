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

    // DEBUG: Test if Worker runs for root
    if (url.pathname === "/") {
      return new Response("Worker is running!", {
        headers: { "X-Worker-Test": "active" },
      });
    }

    // Serve static assets via ASSETS binding
    const assetResponse = await env.ASSETS.fetch(request);

    // Security headers (always applied)
    const securityHeaders = {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-XSS-Protection": "1; mode=block",
      "X-Worker-Ran": "true",
    };

    // Return response with security headers injected
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers: {
        "Content-Type": assetResponse.headers.get("Content-Type") || "text/html",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        ...securityHeaders,
      },
    });
  },
};
