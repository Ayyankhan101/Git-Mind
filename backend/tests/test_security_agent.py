"""Security agent: semgrep invocation, timeout/failure handling, LLM triage.

Regression suite for a real bug found in a full /cso audit: a scan that
timed out or errored was silently reported as "0 findings" (indistinguishable
from a genuinely clean repo), and every failure path returned the exact same
fabricated "app.js has hardcoded credentials" finding regardless of what the
analyzed repository actually contains. Neither behavior had any test
coverage before this file.
"""

import subprocess
from unittest.mock import MagicMock, patch

from agents import security


class TestSemgrepMissing:
    def test_returns_degraded_finding_not_fake_vulnerability(self):
        with patch.object(security, "_SEMGREP", None):
            result = security.run_security_agent("/tmp/repo")
        assert result[0]["id"] == "scan-incomplete"
        assert result[0]["file"] != "app.js"


class TestEmptyLocalPath:
    def test_returns_degraded_finding(self):
        with patch.object(security, "_SEMGREP", "/usr/bin/semgrep"):
            result = security.run_security_agent("")
        assert result[0]["id"] == "scan-incomplete"


class TestRunSemgrep:
    """_run_semgrep must distinguish a clean scan ([]) from a failed one (None)."""

    def test_timeout_returns_none_not_empty_list(self):
        with patch(
            "agents.security.subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="semgrep", timeout=150),
        ):
            assert security._run_semgrep("/tmp/repo") is None

    def test_nonzero_exit_returns_none(self):
        proc = MagicMock(returncode=2, stderr="fatal error", stdout="")
        with patch("agents.security.subprocess.run", return_value=proc):
            assert security._run_semgrep("/tmp/repo") is None

    def test_os_error_returns_none(self):
        with patch("agents.security.subprocess.run", side_effect=OSError("no such file")):
            assert security._run_semgrep("/tmp/repo") is None

    def test_malformed_json_returns_none(self):
        proc = MagicMock(returncode=0, stderr="", stdout="not json")
        with patch("agents.security.subprocess.run", return_value=proc):
            assert security._run_semgrep("/tmp/repo") is None

    def test_clean_scan_returns_empty_list(self):
        proc = MagicMock(returncode=0, stderr="", stdout='{"results": []}')
        with patch("agents.security.subprocess.run", return_value=proc):
            assert security._run_semgrep("/tmp/repo") == []

    def test_findings_returns_raw_results(self):
        proc = MagicMock(
            returncode=1,
            stderr="",
            stdout='{"results": [{"check_id": "x", "path": "a.py"}]}',
        )
        with patch("agents.security.subprocess.run", return_value=proc):
            results = security._run_semgrep("/tmp/repo")
        assert results == [{"check_id": "x", "path": "a.py"}]


class TestRunSecurityAgentFailureIsHonest:
    """A failed/timed-out scan must never be reported the same as a clean repo."""

    def test_scan_failure_yields_degraded_finding_not_empty_list(self):
        with (
            patch.object(security, "_SEMGREP", "/usr/bin/semgrep"),
            patch.object(security, "_run_semgrep", return_value=None),
        ):
            result = security.run_security_agent("/tmp/repo")
        assert result != []
        assert result[0]["id"] == "scan-incomplete"

    def test_genuinely_clean_repo_yields_real_empty_list(self):
        with (
            patch.object(security, "_SEMGREP", "/usr/bin/semgrep"),
            patch.object(security, "_run_semgrep", return_value=[]),
        ):
            result = security.run_security_agent("/tmp/repo")
        assert result == []


class TestTriageWithLlm:
    RAW = [
        {
            "check_id": "python.lang.security.sql-injection",
            "path": "app.py",
            "start": {"line": 10},
            "end": {"line": 10},
            "extra": {"severity": "ERROR", "message": "SQL injection"},
        }
    ]

    @patch("agents.security.run_dspy_cached")
    def test_triage_llm_exception_yields_degraded_finding_with_real_count(self, mock_run):
        mock_run.side_effect = RuntimeError("LLM unavailable")
        result = security._triage_with_llm(self.RAW)
        assert result[0]["id"] == "scan-incomplete"
        assert "1 raw finding" in result[0]["exploit_story"]

    @patch("agents.security.run_dspy_cached", return_value=[])
    def test_triage_llm_returning_empty_is_a_real_empty_result(self, mock_run):
        """LLM ran fine and legitimately triaged everything as non-issues —
        this is NOT a failure and must not show the old fake finding."""
        result = security._triage_with_llm(self.RAW)
        assert result == []

    @patch(
        "agents.security.run_dspy_cached",
        return_value=[
            {
                "file": "app.py",
                "line_start": 10,
                "line_end": 10,
                "severity": "bogus-severity",
                "title": "SQL injection",
                "exploit_story": "x",
                "remediation": "y",
            }
        ],
    )
    def test_triage_normalizes_invalid_severity_and_assigns_id(self, mock_run):
        result = security._triage_with_llm(self.RAW)
        assert result[0]["severity"] == "medium"
        assert result[0]["id"]
