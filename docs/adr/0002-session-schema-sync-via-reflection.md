# ADR-0002: Session schema sync via reflection

Three files maintain independent representations of session state: `state.py` (RepoState TypedDict), `session.py` (initial_state dict), `analysis.py` (_PUBLIC_ANALYSIS_KEYS tuple). Adding a field requires editing three files; the whitelist silently strips new fields.

Derive `initial_state()` and public-key filtering from `RepoState.__annotations__`. Use an exclude list (`gh_token`, `local_path`, `file_contents`, etc.) to compute public keys at import time. Single source of truth, zero runtime cost.

**Consequences:** Add field once in RepoState, propagates to session init and API exposure automatically. No test maintenance for sync.
