# Project Context

## Branch: zari-frontend-refactor (ACTIVE)

- Uses CRA (react-scripts) + react-app-rewired
- Vercel deployment configured
- Committed: `b8ed0e9` — CI pipeline added

## Current Issue: CI Pipeline Merge Flow

User wants easy merge flow: `zari-frontend-refactor` → `develop` → `main`

### Problem Found

Current `frontend-refactor.yml` triggers on wrong branch for PRs:

```yaml
pull_request:
  branches: [zari-frontend-refactor] # WRONG - targets zari, not source
```

Should be `branches: [develop]` to catch PRs FROM zari INTO develop.

### Fix Needed

1. Update `frontend-refactor.yml` trigger to `branches: [develop]` for PRs
2. Keep push trigger on `zari-frontend-refactor` for direct pushes
3. Main `ci.yml` already covers `main` and `develop`

### Merge Flow After Fix

```
zari-frontend-refactor ──PR──▶ develop (frontend-refactor.yml runs)
                                    │
                              ──PR──▶ main (ci.yml runs + deploy)
```

## Files Created (this session)

- `.github/workflows/frontend-refactor.yml` — NEEDS TRIGGER FIX
- `frontend/.size-limit.json` — OK
- `frontend/lighthouserc.json` — OK
- `frontend/package.json` — OK (deps added)

## Pending

1. Fix `frontend-refactor.yml` PR trigger branch
2. Commit fix
3. Push to zari-frontend-refactor
