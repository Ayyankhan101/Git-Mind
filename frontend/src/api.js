// Hardcoded backend URL for all non-localhost deployments
const PROD_BACKEND = "https://ak001z-gitmind-backend.hf.space";

function deriveHttpBase() {
  // 1. CRA build-time env var (set REACT_APP_API_BASE in Vercel dashboard)
  if (process.env.REACT_APP_API_BASE) {
    console.log("[api.js] Using env REACT_APP_API_BASE:", process.env.REACT_APP_API_BASE);
    return process.env.REACT_APP_API_BASE;
  }
  // 2. Vite runtime injection
  if (typeof window !== "undefined" && window.__ENV__?.API_BASE) {
    console.log("[api.js] Using window.__ENV__.API_BASE:", window.__ENV__.API_BASE);
    return window.__ENV__.API_BASE;
  }
  // 3. Cloud Shell preview
  if (typeof window !== "undefined") {
    const { protocol, host, hostname } = window.location;
    if (/^\d+-/.test(host)) {
      const url = `${protocol}//${host.replace(/^\d+-/, "8002-")}`;
      console.log("[api.js] Cloud Shell URL:", url);
      return url;
    }
    // 4. Production deployment (Vercel/Netlify/etc)
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      console.log("[api.js] Production URL:", PROD_BACKEND, "hostname:", hostname);
      return PROD_BACKEND;
    }
  }
  console.log("[api.js] Dev URL: http://localhost:8002");
  return "http://localhost:8002";
}
  return "http://localhost:8002";
}

export const BASE = deriveHttpBase();
export const WS_BASE = BASE.replace(/^http/, "ws");

const GH_TOKEN_RE = /^(gh[pousr]_|github_pat_)[A-Za-z0-9_]+$/;

export function isValidGhToken(token) {
  if (!token) return true; // empty is valid (optional)
  return GH_TOKEN_RE.test(token);
}

// Coerce any backend error shape into a readable string. FastAPI validation
// errors arrive as `detail: [{ msg, loc, ... }]`; some endpoints return a plain
// `error` string or an object. Never let an object stringify to "[object Object]".
function _extractError(payload, fallback) {
  if (payload == null) return fallback;
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    const parts = payload.map((p) => _extractError(p, "")).filter(Boolean);
    return parts.length ? parts.join("; ") : fallback;
  }
  if (typeof payload === "object") {
    return payload.error || payload.detail || payload.msg || payload.message
      ? _extractError(
          payload.error ?? payload.detail ?? payload.msg ?? payload.message,
          fallback,
        )
      : fallback;
  }
  return String(payload);
}

async function _apiFetch(url, options = {}, timeoutMs = 30_000) {
  const { timeoutError, ...fetchOpts } = options;
  fetchOpts.signal = AbortSignal.timeout(timeoutMs);
  console.log("[api.js] Fetching:", url);
  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (err) {
    if (err.name === "TimeoutError")
      throw new Error(timeoutError || "Request timed out.");
    throw new Error(
      "Cannot reach the backend. Make sure it is running on port 8002.",
    );
  }
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try {
      const j = await res.json();
      msg = _extractError(j, msg);
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.error) throw new Error(_extractError(data.error, "Request failed"));
  return data;
}

function _post(url, body, timeoutMs, timeoutError, extraHeaders = {}) {
  return _apiFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
      timeoutError,
    },
    timeoutMs,
  );
}

export async function fetchRepos(username, token = null) {
  const headers = {};
  if (token) headers["X-GH-Token"] = token;
  const data = await _apiFetch(
    `${BASE}/repos/${encodeURIComponent(username)}`,
    {
      headers,
      timeoutError:
        "GitHub API request timed out — check your connection and try again.",
    },
    45_000,
  );
  return data.repos;
}

export function fetchSummary(sessionId) {
  return _post(
    `${BASE}/summary`,
    { session_id: sessionId },
    30_000,
    "Summary request timed out.",
  );
}

export function reviewPR(prUrl, token = null) {
  return _post(
    `${BASE}/pr-review`,
    { pr_url: prUrl },
    90_000,
    "PR review timed out — large diffs may take longer.",
    token ? { "X-GH-Token": token } : {},
  );
}

export function createFixPR(sessionId, finding, token) {
  return _post(
    `${BASE}/fix/pr`,
    { session_id: sessionId, finding },
    120_000,
    "Auto-PR timed out.",
    token ? { "X-GH-Token": token } : {},
  );
}

export function prImpact(prUrl, sessionId, token = null) {
  return _post(
    `${BASE}/pr-impact`,
    { pr_url: prUrl, session_id: sessionId },
    120_000,
    "Impact analysis timed out — large repos may take longer.",
    token ? { "X-GH-Token": token } : {},
  );
}

export function fetchOpenPRs(owner, repo, token = null) {
  const headers = {};
  if (token) headers["X-GH-Token"] = token;
  return _apiFetch(
    `${BASE}/pr-list/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers },
    15_000,
  );
}

export function subscribeMonitor(repoUrl, opts = {}, token = null) {
  return _post(
    `${BASE}/monitor/subscribe`,
    { repo_url: repoUrl, ...opts },
    15_000,
    "Subscribe timed out.",
    token ? { "X-GH-Token": token } : {},
  );
}

export function fetchMonitorStatus(token = null) {
  const headers = {};
  if (token) headers["X-GH-Token"] = token;
  return _apiFetch(`${BASE}/monitor/status`, { headers }, 15_000);
}

export function unsubscribeMonitor(monitorId, token = null) {
  const headers = {};
  if (token) headers["X-GH-Token"] = token;
  return _apiFetch(
    `${BASE}/monitor/${monitorId}`,
    {
      method: "DELETE",
      headers,
    },
    15_000,
  );
}

export function orgAudit(repos, token = null) {
  return _post(
    `${BASE}/org-audit`,
    { repos },
    90_000,
    "Org audit timed out.",
    token ? { "X-GH-Token": token } : {},
  );
}

export function fetchIncidentReport(
  sessionId,
  finding,
  crisisMessages,
  outcome,
) {
  return _post(
    `${BASE}/incident-report`,
    {
      session_id: sessionId,
      finding,
      crisis_messages: crisisMessages,
      outcome,
    },
    60_000,
    "Incident report timed out.",
  );
}

export function generateFix(sessionId, finding) {
  return _post(
    `${BASE}/fix`,
    { session_id: sessionId, finding },
    60_000,
    "Fix generation timed out.",
  );
}

export function loadSharedAnalysis(sessionId) {
  return _apiFetch(
    `${BASE}/analysis/${encodeURIComponent(sessionId)}`,
    { timeoutError: "Request timed out." },
    15_000,
  );
}

/**
 * POST /chat/stream — streaming chat via SSE. Calls onToken(token) for each chunk.
 * Calls onSources(sources) when source metadata arrives.
 */
export async function postChatStream(
  sessionId,
  question,
  onToken,
  signal,
  onSources,
) {
  const timeout = AbortSignal.timeout(90_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, question }),
    signal: combined,
  });
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.error) throw new Error(data.error);
        if (data.token) onToken(data.token);
        if (data.sources && onSources) onSources(data.sources);
      } catch (parseErr) {
        if (parseErr.message && !parseErr.message.includes("JSON"))
          throw parseErr;
        // Skip malformed SSE lines
      }
    }
  }
}
