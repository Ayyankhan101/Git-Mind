# Phase 2 — Track A: Test Coverage

## Goal

Add unit + integration tests for untested backend modules and wire smoke_test into CI.

## Files to Create

### 1. `backend/tests/test_language_audit.py` (~120 lines)

Test `run_code_audit()` and helper functions:

- `test_empty_file_tree_returns_empty` — `run_code_audit([], {})` → `[]`
- `test_python_tool_and_triage` — mock `subprocess.run` returning pylint JSON, mock `invoke_with_retry`, verify `language=="python"`, `tool=="pylint"`, finding fields correct
- `test_llm_fallback_when_tool_missing` — `shutil.which` returns None, mock `invoke_with_retry`, verify `tool is None`
- `test_cache_hit_skips_llm` — mock `get_cached` returns valid JSON, verify `invoke_with_retry` not called
- `test_tool_failure_falls_back_to_llm` — `subprocess.run` raises, verify LLM fallback path
- `test_llm_returns_empty_findings` — LLM returns `{"findings": []}`, verify finding_count=0
- `test_java_uses_llm_only_no_tool` — Java has `cfg.tool=None`, verify pure LLM path
- `test_skips_language_with_no_matching_files` — no `.py` files in file_tree, verify no Python result

### 2. `backend/tests/test_orchestrator.py` (~180 lines)

Test each node function in `orchestrator.py`:

- Each node tested in 4 scenarios:
  - **Normal**: mock agent module, verify correct output keys + `"done"` event
  - **Scanner failure**: set `state["_scanner_failed"]=True`, verify `"skipped"` event + safe defaults
  - **Circuit breaker**: mock `_is_circuit_open` → True, verify `"skipped"` event
  - **Exception**: agent module raises, verify `"error"` event + safe defaults
- `test_build_graph_has_all_nodes` — `build_graph()` returns graph with 9 agent nodes
- `test_circuit_breaker_trips_after_threshold` — verify failure counting and cooldown
- `test_circuit_breaker_records_success` — verify failure count resets on success

### 3. `backend/tests/test_ws_analyze.py` (~150 lines)

Test WebSocket handler in `ws/analyze.py`:

- `test_invalid_payload` → close code 1003
- `test_oversized_payload` → error + close code 1009
- `test_missing_repo_url` → error + close
- `test_rate_limited` → error + close
- `test_cache_hit` — mock `find_cached_snapshot` returns data, verify all cached results streamed + `done` sent
- `test_cache_miss_normal_flow` — mock `graph.astream` yielding chunks, verify results forwarded
- `test_websocket_disconnect` — mock astream raises `WebSocketDisconnect`, verify clean exit
- `test_pipeline_error` — mock astream raises generic Exception, verify error sent + close

### 4. `backend/tests/test_ws_crisis.py` (~100 lines)

Test WebSocket handler in `ws/crisis.py`:

- `test_invalid_payload` → close code 1003
- `test_session_not_found` → error message + close
- `test_no_findings` → error message + close
- `test_normal_flow` — mock `get_session` returns findings, mock `crisis_graph.astream`, verify messages forwarded
- `test_disconnect` — mock astream raises `WebSocketDisconnect`, verify clean exit

### 5. `backend/tests/test_agents_misc.py` (~100 lines)

Unit tests for remaining agent modules with mocked LLM calls:

- `security.py` — mock `subprocess.run` for semgrep, verify finding structure
- `health.py` — test `compute_health` with known inputs, verify grade/score
- `api_doc.py` — mock `invoke_with_retry`, verify API doc structure
- `architecture.py` — mock `invoke_with_retry`, verify diagram string returned
- `git_audit.py` — mock subprocess for git log, verify stats keys

## Files to Modify

### 6. `backend/smoke_test.py` (line 118)

Update expected nodes from 7 to 9:

```python
expected = {"scanner", "architecture", "api_docs", "security", "cve_scanner", "rag_setup", "git_audit", "solidity", "code_audit"}
```

### 7. `.github/workflows/ci.yml`

Add smoke test step after backend tests:

```yaml
- name: Smoke test
  run: python smoke_test.py
  working-directory: backend
  env:
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
```

## Dependencies

- Uses `pytest`, `pytest-asyncio`, `unittest.mock` — all already installed
- WebSocket tests use FastAPI `TestClient` with `.websocket_connect()` — already available
- Agent mocking uses `patch` at the import level (e.g. `patch("agents.language_audit.subprocess.run")`)

## Verification

```bash
cd backend && python -m pytest -x -v 2>&1 | tail -80
```

Expected: All existing 65 tests + new tests pass. Final count depends on number of test cases added.
