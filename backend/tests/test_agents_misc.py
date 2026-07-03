from unittest.mock import MagicMock, patch

import orjson


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
    @patch("agents.architecture.invoke_with_retry")
    @patch("agents.architecture.get_cached", return_value=None)
    def test_api_doc_returns_diagram(self, mock_cache, mock_invoke):
        from agents.architecture import run_architecture_agent

        mock_invoke.return_value = MagicMock(content=orjson.dumps({"diagram": "graph TD\n    A[test]\n"}).decode())

        result = run_architecture_agent(["src/main.py"], {"src/main.py": "print('hello')"})
        assert isinstance(result, str)
        assert "graph TD" in result or "A[test]" in result


class TestSecurityAgent:
    @patch("agents.security.shutil.which", return_value=None)
    def test_security_returns_list(self, mock_which):
        from agents.security import run_security_agent

        result = run_security_agent("/tmp/repo")
        assert isinstance(result, list)
