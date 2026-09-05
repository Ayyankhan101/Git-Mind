"""agents.cve_scanner: OSV.dev query and failure handling.

Regression: an OSV.dev outage/timeout used to be swallowed and reported as
[] — identical to "checked every dependency, found nothing vulnerable".
run_cve_scanner must now raise on a failed OSV query so run_agent_node
surfaces a real "cve_scanner agent failed" warning instead of a silently
fabricated clean dependency audit.
"""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from agents.cve_scanner import run_cve_scanner


class TestNoDependencies:
    def test_no_lockfiles_returns_empty_honestly(self):
        with patch("agents.cve_scanner.parse_dependencies", return_value=[]):
            assert run_cve_scanner({}) == []


class TestOsvFailure:
    def test_osv_unreachable_raises_not_silently_clean(self):
        deps = [{"name": "requests", "version": "2.0.0", "ecosystem": "PyPI"}]
        with (
            patch("agents.cve_scanner.parse_dependencies", return_value=deps),
            patch("httpx.post", side_effect=httpx.ConnectError("connection refused")),
            pytest.raises(RuntimeError, match="OSV.dev unreachable"),
        ):
            run_cve_scanner({"requirements.txt": "requests==2.0.0"})

    def test_osv_non_2xx_raises(self):
        deps = [{"name": "requests", "version": "2.0.0", "ecosystem": "PyPI"}]
        resp = MagicMock()
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock(status_code=500)
        )
        with (
            patch("agents.cve_scanner.parse_dependencies", return_value=deps),
            patch("httpx.post", return_value=resp),
            pytest.raises(RuntimeError, match="OSV.dev unreachable"),
        ):
            run_cve_scanner({"requirements.txt": "requests==2.0.0"})


class TestOsvSuccess:
    def test_genuinely_clean_dependency_returns_empty(self):
        deps = [{"name": "requests", "version": "2.0.0", "ecosystem": "PyPI"}]
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.json.return_value = {"results": [{"vulns": []}]}
        with (
            patch("agents.cve_scanner.parse_dependencies", return_value=deps),
            patch("httpx.post", return_value=resp),
        ):
            assert run_cve_scanner({"requirements.txt": "requests==2.0.0"}) == []

    def test_vulnerable_dependency_reported(self):
        deps = [{"name": "requests", "version": "2.0.0", "ecosystem": "PyPI"}]
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.json.return_value = {
            "results": [
                {
                    "vulns": [
                        {
                            "id": "GHSA-1234",
                            "summary": "Vulnerable to X",
                            "severity": [{"score": "9.5"}],
                            "affected": [],
                        }
                    ]
                }
            ]
        }
        with (
            patch("agents.cve_scanner.parse_dependencies", return_value=deps),
            patch("httpx.post", return_value=resp),
        ):
            results = run_cve_scanner({"requirements.txt": "requests==2.0.0"})

        assert len(results) == 1
        assert results[0]["worst_severity"] == "critical"
