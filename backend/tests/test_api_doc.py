"""agents.api_doc: distinguishing "no API in this repo" from "route files
exist but every extraction attempt crashed".

Regression: scan_route_files already filters to files that look like route
handlers, so a non-empty api_files means there IS API-shaped code. If the
LLM extraction call then fails for every one of those files (LLM outage),
the old code still returned [] — identical to "no API endpoints detected"
for a repo that genuinely has none.
"""

from unittest.mock import patch

import pytest

from agents.api_doc import run_api_doc_agent


class TestNoRouteFiles:
    def test_no_route_patterns_returns_empty_honestly(self):
        with patch("agents.api_doc.scan_route_files", return_value=[]):
            assert run_api_doc_agent({"main.py": "print('hi')"}) == []


class TestExtractionFailure:
    def test_all_files_fail_raises_not_silently_empty(self):
        with (
            patch("agents.api_doc.scan_route_files", return_value=["routes.py"]),
            patch("agents.api_doc.run_dspy_cached", side_effect=RuntimeError("LLM timeout")),
            pytest.raises(RuntimeError, match="failed on all"),
        ):
            run_api_doc_agent({"routes.py": "@app.get('/x')\ndef x(): ..."})

    def test_partial_failure_keeps_successful_extractions(self):
        """One file fails, one succeeds — the successful result must not be
        discarded just because a sibling file's extraction crashed."""
        calls = {"n": 0}

        def _side_effect(*_a, **_k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("LLM timeout")
            return [{"method": "GET", "route": "/ok", "description": "ok", "parameters": "none"}]

        with (
            patch(
                "agents.api_doc.scan_route_files",
                return_value=["broken.py", "good.py"],
            ),
            patch("agents.api_doc.run_dspy_cached", side_effect=_side_effect),
        ):
            results = run_api_doc_agent({"broken.py": "@app.get('/x')", "good.py": "@app.get('/ok')"})

        assert len(results) == 1
        assert results[0]["route"] == "/ok"


class TestExtractionSuccess:
    def test_genuinely_empty_endpoints_returns_empty(self):
        with (
            patch("agents.api_doc.scan_route_files", return_value=["routes.py"]),
            patch("agents.api_doc.run_dspy_cached", return_value=[]),
        ):
            assert run_api_doc_agent({"routes.py": "# no real routes here"}) == []
