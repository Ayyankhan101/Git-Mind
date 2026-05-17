// Derive backend base URL.
//   1. REACT_APP_API_BASE env var wins (set at build time).
//   2. Cloud Shell preview: hostnames are like "3000-cs-xxxx.cloudshell.dev" —
//      swap the leading port with 8001 so frontend and backend share host.
//   3. Default to localhost:8001 for dev.
function deriveHttpBase() {
  if (process.env.REACT_APP_API_BASE) return process.env.REACT_APP_API_BASE;
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    if (/^\d+-/.test(host)) return `${protocol}//${host.replace(/^\d+-/, '8001-')}`;
  }
  return 'http://localhost:8001';
}

export const BASE    = deriveHttpBase();
export const WS_BASE = BASE.replace(/^http/, 'ws');

/**
 * POST /chat — send a question, get an answer.
 * Returns { answer: string } or throws with a user-readable message.
 */
export async function postChat(sessionId, question) {
  let res;
  try {
    res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, question }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error('Request timed out — the backend took too long to respond.');
    }
    throw new Error('Cannot reach the backend. Make sure it is running on port 8001.');
  }

  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.detail || msg; } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  if (typeof data.answer !== 'string') throw new Error('Unexpected response format from backend.');
  return data.answer;
}

/**
 * GET /repos/{username} — fetch public repos for a GitHub user.
 * Returns array of repo objects or throws with a user-readable message.
 */
export async function fetchRepos(username) {
  let res;
  try {
    res = await fetch(`${BASE}/repos/${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('GitHub API request timed out.');
    throw new Error('Cannot reach the backend. Make sure it is running on port 8001.');
  }

  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.detail || msg; } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.repos;
}

/**
 * POST /summary — generate executive summary for a completed analysis session.
 */
export async function fetchSummary(sessionId) {
  let res;
  try {
    res = await fetch(`${BASE}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('Summary request timed out.');
    throw new Error('Cannot reach the backend.');
  }
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * POST /chat/stream — streaming chat via SSE. Calls onToken(token) for each chunk.
 */
export async function postChatStream(sessionId, question, onToken) {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question }),
    signal: AbortSignal.timeout(90_000),
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
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6));
      if (data.error) throw new Error(data.error);
      if (data.token) onToken(data.token);
    }
  }
}

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}
