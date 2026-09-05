# GitHub OAuth Sign-In — Reference

Complete technical description of `backend/routes/oauth.py` — the "Sign in
with GitHub" flow. For setup instructions, see the
[tutorial](./tutorial.md) or [how-to guide](./how-to.md). For the reasoning
behind the design, see the [explanation](./explanation.md).

## What it is

A second way to obtain the same kind of GitHub access token the manual
"paste your PAT" flow already produces — the authorization-code OAuth
flow, so a user can sign in instead of generating a personal access token
by hand. There are no accounts and no server-side session: the token is
handed to the frontend exactly once, then the backend forgets it.

Not to be confused with the separate `GITHUB_APP_*` credentials in
`backend/services/github_app.py`. A GitHub **OAuth App** (this module,
user-to-server token via the authorization-code flow) and a GitHub **App**
(JWT + installation tokens, used for webhook flows) are different
credential types, registered on different GitHub settings pages, and are
not interchangeable.

## Endpoints

### `GET /auth/github/login`

Entry point. Redirects the browser to GitHub's consent screen.

| | |
|---|---|
| Method | `GET` |
| Auth | None |
| Rate limit | `oauth_login` — 20 requests / 60s per client IP |
| Success | `302` to `https://github.com/login/oauth/authorize?...` |
| `503` | `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET` not set, **or** Redis is unreachable |

Checks configuration and Redis availability up front, before redirecting —
a misconfigured deployment fails immediately here rather than after the
user has already gone through GitHub's consent screen.

Query parameters sent to GitHub:

| Param | Value |
|---|---|
| `client_id` | `GITHUB_OAUTH_CLIENT_ID` |
| `redirect_uri` | `{OAUTH_REDIRECT_BASE_URL}/auth/github/callback` |
| `scope` | `repo` (see [explanation](./explanation.md#why-the-repo-scope)) |
| `state` | HMAC-signed nonce, see [State parameter](#state-parameter) below |
| `allow_signup` | `false` |

### `GET /auth/github/callback`

GitHub redirects here after the user approves or denies consent.

| | |
|---|---|
| Method | `GET` |
| Auth | None (state parameter is the integrity check) |
| Query params | `code` (GitHub's authorization code), `state` |
| Rate limit | `oauth_callback` — 10 requests / 60s per client IP |
| Success | `302` to `{OAUTH_FRONTEND_URL}/?gh_handoff={code}` |
| Failure | `302` to `{OAUTH_FRONTEND_URL}/?gh_oauth_error={reason}` |

Failure reasons (exact strings, sent as the `gh_oauth_error` query value):

| Reason | Cause |
|---|---|
| `invalid_state` | `code` missing, or `state` failed signature/expiry verification |
| `exchange_failed` | GitHub's token endpoint returned an error, or the request itself failed (network error, timeout) |
| `unavailable` | The token exchange succeeded, but Redis became unreachable before the handoff code could be stored |

Note: fetching the GitHub username (`GET /user`) is best-effort. If it
fails, the flow still succeeds — the handoff still stores the token, just
without a `login` value.

### `POST /auth/github/exchange`

Called by the frontend immediately after the callback redirect, to
exchange the short-lived handoff code for the real access token.

| | |
|---|---|
| Method | `POST` |
| Body | `{"code": "<handoff code>"}` |
| Rate limit | `oauth_exchange` — 20 requests / 60s per client IP |
| `200` | `{"access_token": "...", "login": "..." \| null}` |
| `400` | Code is invalid, expired, or already used |
| `422` | `code` missing or empty (request validation) |
| `503` | Redis unreachable |

The handoff code is single-use: exchanging it pops it from Redis
atomically (`GET` + `DEL` in one Lua script), so a second exchange attempt
with the same code always returns `400`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Yes | — | GitHub OAuth App client ID. Unset ⇒ `/auth/github/login` returns `503`. |
| `GITHUB_OAUTH_CLIENT_SECRET` | Yes | — | GitHub OAuth App client secret. Also used to derive the HMAC key for signing the `state` parameter. |
| `OAUTH_REDIRECT_BASE_URL` | No | `https://ak001z-gitmind-backend.hf.space` | This backend's own public URL. Must exactly match the callback URL registered on the GitHub OAuth App, or GitHub rejects the request. |
| `OAUTH_FRONTEND_URL` | No | `https://gitmind-frontend.pages.dev` | Frontend origin the browser is sent back to after sign-in (success or failure). |

Also requires Redis (`REDIS_URL`, via `services/cache.py`) — unlike most of
this app's Redis-backed features, this one has no memory fallback. Without
Redis, `/auth/github/login` and `/auth/github/exchange` both return `503`.

## State parameter

A signed, stateless CSRF-style token — see
[explanation: why stateless state](./explanation.md#why-a-stateless-state-parameter)
for the reasoning. Format: `{nonce}:{expires_at}:{signature}`.

- `nonce` — `secrets.token_urlsafe(16)`, single-use only in the sense that
  it's unpredictable; not tracked server-side.
- `expires_at` — Unix timestamp, `now + 600` seconds at signing time.
- `signature` — `HMAC-SHA256(key, f"{nonce}:{expires_at}")`, hex-encoded.
  The key itself is `HMAC-SHA256(b"gitmind-oauth-state-v1", client_secret)`
  — a domain-separated sub-key derived from the client secret, not the
  client secret used directly, so this role doesn't share raw key material
  with the client secret's use as an actual OAuth credential elsewhere in
  this module.

Verification (`_verify_state`) recomputes the signature and compares with
`hmac.compare_digest` (constant-time), then checks `expires_at` is still in
the future. Any parse failure, signature mismatch, or expiry results in
`invalid_state`.

## Handoff protocol

The access token never appears directly in the browser's URL bar or
history — only a short-lived, single-use, opaque handoff code does.

1. Callback stores `{"access_token": ..., "login": ...}` as JSON in Redis,
   key `oauth:handoff:{code}`, TTL 90 seconds.
2. Browser is redirected to `{OAUTH_FRONTEND_URL}/?gh_handoff={code}`.
3. Frontend's `exchangeGithubOAuthCode(code)` (`frontend/src/api.js`) calls
   `POST /auth/github/exchange` with that code.
4. Backend pops the key (atomic `GET`+`DEL`) and returns the token.

If the frontend doesn't call `/exchange` within 90 seconds, the code
simply expires — no explicit cleanup needed, Redis TTL handles it.

## Frontend integration

| File | Role |
|---|---|
| `frontend/src/components/NavRail.jsx`, `frontend/src/components/LandingPage.jsx` | Render the "Sign in with GitHub" link, pointing directly at `{BASE}/auth/github/login` (a plain anchor tag — the browser navigates there, no JS involved until the redirect back) |
| `frontend/src/App.jsx` | `useEffect` watching `location.search` for `?gh_handoff=` or `?gh_oauth_error=`; calls `exchangeGithubOAuthCode` and dispatches `SET_GH_TOKEN` on success |
| `frontend/src/api.js` | `exchangeGithubOAuthCode(code)` — `POST /auth/github/exchange`, 15s timeout |

Once obtained, an OAuth-derived token is stored identically to a
manually-pasted PAT (`tokenManager.set`, `dispatch({ type: "SET_GH_TOKEN" })`)
— nothing downstream of the handoff distinguishes how the token was
obtained.

## Related

- [Tutorial: set up Sign in with GitHub](./tutorial.md)
- [How-to: register the OAuth App / troubleshoot sign-in failures](./how-to.md)
- [Explanation: design decisions behind this flow](./explanation.md)
- Tests: `backend/tests/test_oauth.py` — the authoritative source for every
  edge case in this reference (state tampering, expiry, Redis failures at
  each of the three points it's checked, single-use enforcement)
