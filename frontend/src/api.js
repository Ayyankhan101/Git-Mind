// Derive backend base URL.
//   1. REACT_APP_API_BASE env var wins (set at build time).
//   2. Cloud Shell preview: hostnames like "3000-cs-xxxx.cloudshell.dev" —
//      swap the leading port with 8002 so frontend and backend share host.
//   3. Default to localhost:8002 for dev.
function deriveHttpBase() {
  if (process.env.REACT_APP_API_BASE) return process.env.REACT_APP_API_BASE;
  if (typeof window !== 'undefined') {
    const { protocol, host, port, hostname } = window.location;
    if (/^\d+-/.test(host)) return `${protocol}//${host.replace(/^\d+-/, '8002-')}`;
    if (!port || port === '80' || port === '443') return `${protocol}//${hostname}`;
  }
  return 'http://localhost:8002';
}

export const BASE    = deriveHttpBase();
export const WS_BASE = BASE.replace(/^http/, 'ws');

async function _apiFetch(url, options = {}, timeoutMs = 30_000) {
  const { timeoutError, ...fetchOpts } = options;
  fetchOpts.signal = AbortSignal.timeout(timeoutMs);
  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error(timeoutError || 'Request timed out.');
    throw new Error('Cannot reach the backend. Make sure it is running on port 8002.');
  }
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.detail || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function _post(url, body, timeoutMs, timeoutError) {
  return _apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutError,
  }, timeoutMs);
}

export async function fetchRepos(username, token = null) {
  const headers = {};
  if (token) headers['X-GH-Token'] = token;
  const data = await _apiFetch(
    `${BASE}/repos/${encodeURIComponent(username)}`,
    { headers, timeoutError: 'GitHub API request timed out — check your connection and try again.' },
    45_000,
  );
  return data.repos;
}

export function fetchSummary(sessionId) {
  return _post(`${BASE}/summary`, { session_id: sessionId }, 30_000, 'Summary request timed out.');
}

export function reviewPR(prUrl, token = null) {
  return _post(
    `${BASE}/pr-review`,
    { pr_url: prUrl, ...(token ? { token } : {}) },
    90_000,
    'PR review timed out — large diffs may take longer.',
  );
}

export function createFixPR(sessionId, finding, token) {
  return _post(`${BASE}/fix/pr`, { session_id: sessionId, finding, token }, 120_000, 'Auto-PR timed out.');
}

export function prImpact(prUrl, sessionId, token = null) {
  return _post(
    `${BASE}/pr-impact`,
    { pr_url: prUrl, session_id: sessionId, ...(token ? { token } : {}) },
    120_000,
    'Impact analysis timed out — large repos may take longer.',
  );
}

export function fetchOpenPRs(owner, repo, token = null) {
  const headers = {};
  if (token) headers['X-GH-Token'] = token;
  return _apiFetch(
    `${BASE}/pr-list/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers },
    15_000,
  );
}

export function orgAudit(repos, token = null) {
  return _post(
    `${BASE}/org-audit`,
    { repos, ...(token ? { token } : {}) },
    90_000,
    'Org audit timed out.',
  );
}

export function fetchIncidentReport(sessionId, finding, crisisMessages, outcome) {
  return _post(
    `${BASE}/incident-report`,
    { session_id: sessionId, finding, crisis_messages: crisisMessages, outcome },
    60_000,
    'Incident report timed out.',
  );
}

export function generateFix(sessionId, finding) {
  return _post(`${BASE}/fix`, { session_id: sessionId, finding }, 60_000, 'Fix generation timed out.');
}

export function loadSharedAnalysis(sessionId) {
  return _apiFetch(
    `${BASE}/analysis/${encodeURIComponent(sessionId)}`,
    { timeoutError: 'Request timed out.' },
    15_000,
  );
}

/**
 * POST /chat/stream — streaming chat via SSE. Calls onToken(token) for each chunk.
 */
export async function postChatStream(sessionId, question, onToken, signal) {
  const timeout = AbortSignal.timeout(90_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question }),
    signal: combined,
  });
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6));
      if (data.error) throw new Error(data.error);
      if (data.token) onToken(data.token);
    }
  }
}
