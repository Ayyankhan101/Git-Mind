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

export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}
