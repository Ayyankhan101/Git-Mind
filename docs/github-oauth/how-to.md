# How to Set Up "Sign in with GitHub"

Register a GitHub OAuth App and configure Git-Mind's backend so the "Sign
in with GitHub" button actually works, instead of returning a `503`.

## Prerequisites

- Admin access to a GitHub account (to register the OAuth App)
- Your backend's public URL (e.g. `https://ak001z-gitmind-backend.hf.space`,
  or whatever `OAUTH_REDIRECT_BASE_URL` will be)
- Your frontend's public URL (e.g. `https://gitmind-frontend.pages.dev`,
  or whatever `OAUTH_FRONTEND_URL` will be)
- Redis already configured for this backend (`REDIS_URL`) — this flow has
  no fallback without it; see
  [explanation: why this needs Redis with no fallback](./explanation.md#why-this-needs-redis-with-no-fallback)

## Steps

1. **Register the OAuth App on GitHub.**
   Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth
   App.

2. **Fill in the app details.**
   - **Application name**: anything recognizable, e.g. "Git-Mind (production)"
   - **Homepage URL**: your frontend URL, e.g. `https://gitmind-frontend.pages.dev`
   - **Authorization callback URL**: your backend URL plus
     `/auth/github/callback` — **must match `OAUTH_REDIRECT_BASE_URL`
     exactly**, including scheme (`https://`) and no trailing slash:
     ```
     https://ak001z-gitmind-backend.hf.space/auth/github/callback
     ```
     Get this wrong and every sign-in attempt fails at GitHub's own consent
     screen with a redirect URI mismatch, before it ever reaches this app.

3. **Register the app and copy the credentials.**
   Click **Register application**, then copy the **Client ID**. Click
   **Generate a new client secret** and copy it immediately — GitHub only
   shows it once.

4. **Set the environment variables on your backend.**

   | Variable | Value |
   |---|---|
   | `GITHUB_OAUTH_CLIENT_ID` | the Client ID from step 3 |
   | `GITHUB_OAUTH_CLIENT_SECRET` | the client secret from step 3 |
   | `OAUTH_REDIRECT_BASE_URL` | your backend's public URL (only set this if it differs from the code's default — see [reference](./reference.md#environment-variables)) |
   | `OAUTH_FRONTEND_URL` | your frontend's public URL (only set this if it differs from the default) |

   On a Hugging Face Space, this is Settings → Variables and secrets →
   add each as a **secret** (not a plain variable — these are credentials).

5. **Redeploy / restart the backend** so it picks up the new environment
   variables.

## Verification

1. Open your frontend and click **Sign in with GitHub** (in the nav rail's
   token popover, or the landing page).
2. You should land on GitHub's consent screen, not a `503` error page. If
   you see a `503` immediately, see [Troubleshooting](#troubleshooting)
   below.
3. Approve the app. You should be redirected back to your frontend with a
   "Signed in with GitHub" toast notification.
4. Confirm it actually took: the lock icon in the nav rail should now
   reflect a token is set (colored, not the default state).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `503` immediately on clicking "Sign in with GitHub" | `GITHUB_OAUTH_CLIENT_ID`/`SECRET` not set, or Redis unreachable | Confirm both env vars are actually set on the backend (not just locally) and that the backend can reach Redis — check backend logs for `Redis connected` at startup |
| GitHub shows "The redirect_uri MUST match the registered callback URL" | `OAUTH_REDIRECT_BASE_URL` doesn't exactly match what you registered in step 2 | Compare them character-for-character, including scheme and trailing slash. Update whichever one is wrong. |
| Redirected back with `?gh_oauth_error=invalid_state` | The `state` parameter failed verification — usually means more than 10 minutes passed between clicking sign-in and approving on GitHub, or the request was tampered with | Just try again — state tokens are single-attempt and time-limited by design, see [reference: state parameter](./reference.md#state-parameter) |
| Redirected back with `?gh_oauth_error=exchange_failed` | GitHub rejected the token exchange (often: `GITHUB_OAUTH_CLIENT_SECRET` is wrong or the app registration doesn't match), or a network error to GitHub | Double-check the client secret was copied correctly (regenerate it on GitHub if unsure — GitHub only shows it once, so a typo isn't recoverable, only replaceable) |
| Redirected back with `?gh_oauth_error=unavailable` | Redis was reachable at `/login` but became unreachable before the callback finished | Check Redis health/connectivity; this is an infra issue, not a config one |
| Sign-in succeeds but shows no username in the toast | Best-effort GitHub username lookup failed — the flow still succeeded | Nothing to fix — this is expected fallback behavior, not an error. The token itself is still valid. |
| "Or paste a token" still works but "Sign in with GitHub" doesn't | Confirms the manual PAT flow is unaffected by whatever's wrong with OAuth | Use the manual flow while you debug OAuth — they're independent, see [reference](./reference.md) |

## Related

- [Reference: full endpoint/env-var/error-code documentation](./reference.md)
- [Tutorial: complete walkthrough with a fresh GitHub account](./tutorial.md)
- [Explanation: why this flow is designed the way it is](./explanation.md)
