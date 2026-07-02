/**
 * Token manager — stores GitHub PAT in memory with optional encrypted
 * localStorage backup. Token clears after 1h or tab close.
 */

const STORAGE_KEY = "gm-gh-token-enc";
const TTL_MS = 60 * 60 * 1000; // 1 hour

let _token = null;
let _expiry = 0;

// ── AES-GCM encryption helpers ────────────────────────────────────────────────

function _getKey() {
  // Per-session random key stored in sessionStorage (not the token itself)
  const raw = sessionStorage.getItem("gm-enc-key");
  if (raw) return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const key = crypto.getRandomValues(new Uint8Array(32));
  sessionStorage.setItem("gm-enc-key", btoa(String.fromCharCode(...key)));
  return key;
}

async function _encrypt(plaintext) {
  const key = await crypto.subtle.importKey(
    "raw",
    _getKey(),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(ciphertext)));
}

async function _decrypt(blob) {
  const raw = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const key = await crypto.subtle.importKey(
    "raw",
    _getKey(),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function get() {
  if (_token && Date.now() < _expiry) return _token;
  _token = null;
  return null;
}

export async function set(token) {
  _token = token || null;
  _expiry = token ? Date.now() + TTL_MS : 0;
  try {
    if (token) {
      const enc = await _encrypt(token);
      localStorage.setItem(STORAGE_KEY, enc);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

export async function restore() {
  try {
    const enc = localStorage.getItem(STORAGE_KEY);
    if (enc) {
      const token = await _decrypt(enc);
      if (token) {
        _token = token;
        _expiry = Date.now() + TTL_MS;
        return token;
      }
    }
  } catch {}
  return null;
}
