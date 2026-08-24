# ADR-0001: Extract orchestrator node boilerplate

Nine node functions in `orchestrator.py` repeat identical boilerplate: scanner-fail guard, circuit-breaker guard, try/catch, circuit-failure recording, error-event emission. The interface (function signature + return shape) is nearly as complex as the implementation — a shallow module.

Extract `run_agent_node(name: str, fn: Callable, state: RepoState) -> dict` higher-order function. Each node becomes a one-liner passing its agent function. Circuit breaker and error isolation concentrate in one tested module.

**Consequences:** Every future agent addition benefits from one-line node definition. Circuit breaker tested once, not 9×. Interface shrinks from ~15 lines per node to 1.
