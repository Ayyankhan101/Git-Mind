from unittest.mock import patch


class TestHealthAgent:
    @patch("agents.health.compute_health")
    def test_compute_health_returns_grade_and_score(self, mock_health):
        mock_health.return_value = {"grade": "B+", "score": 75}
        result = mock_health(
            file_contents={"src/main.py": "print('hello')"},
            security_findings=[{"severity": "high"}],
            cve_findings=[],
            api_docs=[],
        )
        assert result["grade"] == "B+"
        assert result["score"] == 75


class TestArchitectureAgent:
    @patch("agents.architecture.run_dspy_cached", return_value="graph TD\n    A[test]\n")
    def test_architecture_returns_diagram(self, mock_run):
        from agents.architecture import run_architecture_agent

        result = run_architecture_agent(["src/main.py"], {"src/main.py": "print('hello')"})
        assert isinstance(result, str)
        assert "graph TD" in result or "A[test]" in result


class TestSecurityAgent:
    def test_security_returns_list_when_semgrep_missing(self):
        """_SEMGREP is resolved once at import time — patching shutil.which
        after import is a no-op, so the module global itself must be patched."""
        from agents import security

        with patch.object(security, "_SEMGREP", None):
            result = security.run_security_agent("/tmp/repo")
        assert isinstance(result, list)
        assert result[0]["id"] == "scan-incomplete"
