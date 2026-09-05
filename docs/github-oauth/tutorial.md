# Tutorial: Add "Sign in with GitHub" to a Local Git-Mind Dev Setup

You'll register a throwaway GitHub OAuth App, wire it into a local
Git-Mind backend + frontend, and click "Sign in with GitHub" all the way
through to a real access token — the same flow production uses, just
pointed at `localhost` instead of your real deployment. By the end you'll
understand the three moving pieces (login redirect, callback, token
handoff) well enough to debug or extend any of them.

## What you'll need

- A GitHub account
- Git-Mind's backend and frontend running locally:
  - Backend: `cd backend && uvicorn main:app --port 8002 --reload`
  - Frontend: `cd frontend && npm start` (defaults to `http://localhost:3000`)
- A local Redis instance reachable via `REDIS_URL` — this flow has no
  in-memory fallback (see [why](./explanation.md#why-this-needs-redis-with-no-fallback)).
  If you don't already have one: `docker run -p 6379:6379 redis` and set
  `REDIS_URL=redis://localhost:6379` in the backend's environment.

## Step 1: Register a dev OAuth App

Go to GitHub → **Settings → Developer settings → OAuth Apps → New OAuth
App**. Fill in:

- **Application name**: `Git-Mind (local dev)` — anything you'll recognize
- **Homepage URL**: `http://localhost:3000`
- **Authorization callback URL**: `http://localhost:8002/auth/github/callback`

Click **Register application**. You'll land on the app's settings page —
leave this tab open, you need two values from it next.

## Step 2: Get your credentials

On the same page: copy the **Client ID** at the top. Then click **Generate
a new client secret** and copy it immediately (GitHub shows it exactly
once — if you lose it, generate a new one, there's no way to reveal the
old one again).

## Step 3: Point the backend at your OAuth App

Set these in your backend's environment (`.env`, or however you normally
configure it locally), then restart the backend so it picks them up:

```bash
GITHUB_OAUTH_CLIENT_ID=<the client ID from step 2>
GITHUB_OAUTH_CLIENT_SECRET=<the client secret from step 2>
OAUTH_REDIRECT_BASE_URL=http://localhost:8002
OAUTH_FRONTEND_URL=http://localhost:3000
```

`OAUTH_REDIRECT_BASE_URL` and `OAUTH_FRONTEND_URL` both default to this
app's production URLs (`routes/oauth.py`'s `_redirect_base()` /
`_frontend_url()`) — for local dev you have to override both, or the
backend will try to send GitHub's redirect back to production instead of
your laptop.

## Step 4: See it redirect

With both servers running, visit `http://localhost:8002/auth/github/login`
directly in your browser (skip the frontend for this first check — it's
the fastest way to confirm the backend side is wired up before involving
the UI).

You should land on GitHub's own consent screen, showing your app's name
from step 1 and asking to authorize access to your repositories. If you
instead get a `503` response, your env vars from step 3 didn't take —
check the backend logs for what it's actually reading, and confirm the
backend restarted after you set them.

## Step 5: Approve and watch the handoff happen

Click **Authorize** on GitHub's consent screen. You'll be redirected to
something like:

```
http://localhost:3000/?gh_handoff=AbCdEf123...
```

That's the backend's callback having already exchanged GitHub's
authorization code for a real access token, stored it server-side under
that one-time code, and sent your browser back to the frontend with only
the *pointer* to it — never the token itself — in the URL. See
[reference: handoff protocol](./reference.md#handoff-protocol) for exactly
what happened between the click and this redirect.

If your frontend is actually running at `localhost:3000` with the OAuth
handler wired up (`frontend/src/App.jsx`'s effect watching for
`?gh_handoff=`), it fires `exchangeGithubOAuthCode` automatically — you
should see the `gh_handoff` param disappear from the URL and a "Signed in
with GitHub" toast appear within a second or two, with your GitHub
username in the subtitle.

## Step 6: Confirm the token actually works

Open the nav rail's token popover (the lock icon). You should see the
token field populated — this is the exact same storage a manually-pasted
personal access token would use
([reference: frontend integration](./reference.md#frontend-integration)).
Paste a private repo URL into the analyzer and confirm it actually clones
(a public repo works without a token at all, so this step only proves
anything for a private one).

## What you built

A complete, working GitHub OAuth sign-in wired to a local dev environment:
a registered OAuth App, a backend that redirects to GitHub and handles the
callback, and a frontend that silently completes the handoff and stores
the resulting token exactly like a pasted PAT would. You've seen all three
network hops (`/login` → GitHub → `/callback` → frontend → `/exchange`)
happen for real, not just read about them.

From here:
- [Reference](./reference.md) documents every endpoint, error code, and
  env var in full — useful once you're extending this flow rather than
  learning it.
- [Explanation](./explanation.md) covers *why* it's built this way (no
  sessions, no accounts, a stateless signed `state` parameter) — worth
  reading before you change any of the security-relevant parts.
- [How-to](./how-to.md) is the condensed version of steps 1-4 above,
  written for someone setting this up in production rather than learning
  it for the first time.
