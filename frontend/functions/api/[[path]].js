const BACKEND_ORIGIN = "https://ak001z-gitmind-backend.hf.space";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": url.origin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-GH-Token, X-Request-ID, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Build backend URL — strip /api/ prefix
  const backendUrl = new URL(request.url);
  backendUrl.hostname = new URL(BACKEND_ORIGIN).hostname;
  backendUrl.protocol = new URL(BACKEND_ORIGIN).protocol;
  backendUrl.pathname = url.pathname.slice(4) + url.search;

  const proxyRequest = new Request(backendUrl.toString(), request);
  proxyRequest.headers.set("Origin", BACKEND_ORIGIN);

  // Forward auth headers
  const authHeader = request.headers.get("Authorization");
  if (authHeader) proxyRequest.headers.set("Authorization", authHeader);
  const ghToken = request.headers.get("X-GH-Token");
  if (ghToken) proxyRequest.headers.set("X-GH-Token", ghToken);

  try {
    // "manual" — a proxy should hand a redirect (e.g. GET /auth/github/login's
    // 302 to GitHub) back to the browser, not silently follow it itself and
    // return GitHub's login page as if it were this API's response.
    const response = await fetch(proxyRequest, { redirect: "manual" });
    const newResponse = new Response(response.body, response);

    // CORS headers
    newResponse.headers.set("Access-Control-Allow-Origin", url.origin);
    newResponse.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, DELETE, OPTIONS",
    );
    newResponse.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-GH-Token, X-Request-ID, Authorization",
    );

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
