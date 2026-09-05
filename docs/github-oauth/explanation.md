# GitHub OAuth Sign-In — Why It's Built This Way

Git-Mind has no user accounts. No signup, no login database, no sessions
that persist who you are across visits. A GitHub personal access token,
pasted into a text field, has always been enough to unlock private-repo
analysis. "Sign in with GitHub" exists purely to make *getting* that token
less annoying — it is not a new authentication system bolted onto the app,
and every design choice in `backend/routes/oauth.py` follows from taking
that constraint seriously rather than quietly building accounts in through
the side door.

## The problem: OAuth normally assumes you have sessions

The standard OAuth authorization-code flow leans on two things a typical
web app already has: a server-side session to stash the in-flight `state`
value in, and a place to persist the resulting token against a user
record. Git-Mind has neither. Bolting on a session store just to support
one login button would mean introducing the exact piece of infrastructure
(accounts, persistence, "who is this user across requests") the rest of
the app deliberately avoids. So the flow had to be redesigned around
statelessness, not just have OAuth "added" to a stateless app.

## Why a stateless state parameter

OAuth's `state` parameter exists to stop CSRF (cross-site request forgery
— tricking a victim's browser into completing an action, like a login,
that they never intended): prove that the browser
completing the callback is the same one that started the login. The
textbook implementation stores a random value in the user's session, then
compares it to what GitHub echoes back. With no session, there's nothing
to compare against.

The fix: make the state value self-verifying instead of stored. It's
signed with an HMAC derived from the OAuth app's own client secret
(`_state_key()` in `routes/oauth.py`), carries its own expiry, and gets
recomputed and checked on the way back — `_verify_state()` recomputes the
signature and compares it, then checks the timestamp. Anyone without the
client secret can't forge a valid one; anyone who intercepts the callback
URL after it's already 10 minutes old can't replay it either.

**The honest trade-off:** this proves the state wasn't forged and hasn't
expired. It does *not* prove the browser sitting at the callback is the
exact browser that initiated the login (that's what a session-bound
comparison buys you, and this app has no session to bind to). For an app
with no accounts and no data more sensitive than "which repos can I
analyze," that gap is acceptable — the worst outcome of a forged callback
without the real user's cooperation is still gated by GitHub's own consent
screen, since the attacker still needs a valid `code` from GitHub itself,
which requires either the victim's cooperation or a compromised GitHub
session. A session-bound app handling real accounts would need the
stronger guarantee; this one doesn't have real accounts to protect.

## Why the token goes through a handoff code instead of straight to the frontend

After GitHub hands back an authorization code, the backend exchanges it
for an access token server-side (this exchange requires the client
*secret*, which must never reach the browser). The natural next step —
redirect the browser straight back to the frontend with the token in the
URL — was rejected: URLs end up in browser history, server access logs,
and `Referer` headers on the very next outbound request. A real access
token sitting in a URL is a real access token leaking through all of
those.

Instead, the callback stores the token server-side under a short-lived,
single-use, opaque code (`oauth:handoff:{code}`, 90-second TTL in Redis)
and puts *that* in the URL. The frontend calls back immediately
(`POST /auth/github/exchange`) to trade the code for the real token over a
request body, not a URL. The code is deliberately worthless to anyone who
captures it more than 90 seconds later, or a second time — the pop is an
atomic Redis `GET`+`DEL`, so even a code intercepted in that narrow window
is only usable once.

## Why this needs Redis with no fallback

Every other Redis-backed feature in this app (session store, rate limiter,
LLM cache) degrades to an in-memory fallback when Redis is absent — see
[`docs/PHASE-0-DISTRIBUTED-PRIMITIVES.md`](../PHASE-0-DISTRIBUTED-PRIMITIVES.md).
This flow doesn't, on purpose. The handoff code's entire job is to be a
short-lived pointer to a value that must not persist in the request/response
cycle itself — a per-process in-memory dict would still "work" on a
single-worker deployment, but the moment there's more than one worker or
replica (which is exactly when the gated Redis-required primitives above
get switched on), the callback and the exchange could land on different
processes and the handoff would silently fail. Rather than add a fallback
that only works by accident under specific deployment shapes, `/login` and
`/exchange` fail loudly (`503`) when Redis isn't reachable, and users fall
back to pasting a token manually — a real, always-available path that
never depended on this flow at all.

## Why the `repo` scope

Classic GitHub OAuth Apps don't offer a read-only-private-repos scope —
`repo` is the narrowest option that includes private repository access at
all. That's a real trade-off (broader than strictly necessary for
*reading* a repo), but it matches what the manually-pasted PAT flow
already required for full feature parity: private-repo analysis and
auto-fix pull requests both need write access, not just read. Scoping
OAuth sign-in down to read-only would make it a strictly worse option than
pasting a token, defeating the point of offering it as an alternative.

## Why a separate module from `services/github_app.py`

Two different GitHub credential types show up in this codebase and they
are easy to confuse by name alone:

- **GitHub OAuth App** (this module) — the classic authorization-code
  flow, produces a user-to-server token scoped to whatever the user
  approves. Registered under GitHub → Settings → Developer settings →
  OAuth Apps.
- **GitHub App** (`services/github_app.py`) — JWT-based, issues
  short-lived installation tokens, used for the webhook-driven flows
  elsewhere in this app. Registered under a different GitHub settings
  page entirely, with a different credential shape (a private key, not a
  client secret).

They solve different problems and were never candidates for sharing code —
the separation isn't an artifact of how the feature grew, it reflects two
genuinely distinct GitHub API surfaces.

## Related

- [Reference: endpoints, env vars, error codes](./reference.md)
- [Tutorial: set up Sign in with GitHub](./tutorial.md)
- [How-to: register the OAuth App / troubleshoot failures](./how-to.md)
