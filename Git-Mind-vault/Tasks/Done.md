# Done Tasks

## Completed

### Phase 0: Redis Hardening
- [x] Rewrote `services/cache.py` — Redis-only, crash on failure
- [x] Rewrote `task_queue.py` — Redis Streams with registry pattern
- [x] Rewrote `session.py` — Redis session store
- [x] Rewrote `rate_limiter.py` — Redis sliding window
- [x] Rewrote `llm_cache.py` — Redis LLM cache
- [x] Updated `requirements.txt` — added orjson, opentelemetry
- [x] Fixed `submit()` call sites in routes
- [x] All 8 rate limiter tests pass

### Frontend Accessibility Fixes
- [x] SecurityTab.jsx — keyboard navigation, ARIA
- [x] CveTab.jsx — keyboard navigation, ARIA
- [x] CodeAuditTab.jsx — keyboard navigation, ARIA
- [x] SolidityTab.jsx — keyboard navigation, ARIA
- [x] App.jsx — role bindings
- [x] Sidebar.jsx — keyboard navigation
- [x] ChatTab.jsx — streaming completion
- [x] index.css — focus states

### CI Fixes
- [x] Fixed ruff E702 in knockout.py
- [x] Created `.prettierignore` — excludes vault
- [x] Updated `.gitignore` — excludes `.obsidian-vault/`
- [x] Removed vault from git tracking (399 files)
- [x] Committed as `7e7491b`

### Cyber Theme Overhaul
- [x] Primary `#22d3ee` → `#22C55E` (neon green)
- [x] 101 green references in index.css
- [x] 19 green references in LandingPage.css
- [x] 0 purple references remaining
- [x] 12 cyber utility classes added
- [x] Landing page verified via PinchTab
- [x] Dashboard verified via PinchTab
- [x] Committed as `253d0b1`, pushed to develop
