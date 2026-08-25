# ADR-0004: Agent output TypedDict validation

Agent functions return untyped dicts. The orchestrator merges them into RepoState without validation. A typo in a key name silently drops data; the `_PUBLIC_ANALYSIS_KEYS` whitelist is the only safety net.

Define `AgentOutput` TypedDict per agent. Validate at the orchestrator → state merge seam with `isinstance` checks. Validation runs always (production + tests) — cheap dict check, expensive silent data loss.

**Consequences:** Output shape defined with the agent. Type mismatches caught at the seam, not in production. One TypedDict, validated at one boundary.
