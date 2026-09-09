from unittest.mock import patch

from app.orchestrator import (
    _record_circuit_failure,
    _record_circuit_success,
    build_graph,
    code_audit_node,
    scanner_node,
)


class TestCircuitBreaker:
    def setup_method(self):
        from app import orchestrator as o

        o._circuit_failures = 0
        o._circuit_open_until = 0.0

    def test_failure_threshold_trips_breaker(self):
        with patch("time.time", return_value=1000.0):
            for _ in range(3):
                _record_circuit_failure()
        from app import orchestrator as o

        assert o._circuit_open_until > 1000.0

    def test_success_resets_failures(self):
        _record_circuit_failure()
        _record_circuit_failure()
        _record_circuit_success()
        from app import orchestrator as o

        assert o._circuit_failures == 0


class TestScannerNode:
    @patch("app.orchestrator.clone_and_scan")
    def test_normal(self, mock_clone):
        mock_clone.return_value = {
            "local_path": "/tmp/repo",
            "file_tree": ["src/main.py"],
            "file_contents": {},
            "repo_name": "test-repo",
        }
        result = scanner_node({"repo_url": "https://github.com/user/repo"})
        assert result["repo_name"] == "test-repo"
        assert any(ev["status"] == "done" for ev in result.get("events", []))

    @patch("app.orchestrator.clone_and_scan", side_effect=RuntimeError("clone failed"))
    def test_exception_returns_safe_defaults(self, _mock):
        result = scanner_node({"repo_url": "https://github.com/user/repo"})
        assert result["_scanner_failed"] is True
        assert result["file_tree"] == []
        assert result["local_path"] is None
        assert any(ev["status"] == "error" for ev in result.get("events", []))


class TestCodeAuditNode:
    @patch("app.orchestrator.run_code_audit")
    def test_normal(self, mock_audit):
        mock_audit.return_value = [{"language": "python", "findings": []}]
        result = code_audit_node(
            {
                "file_tree": ["src/main.py"],
                "file_contents": {},
            }
        )
        assert result["code_audit"] == [{"language": "python", "findings": []}]
        assert any(ev["status"] == "done" for ev in result.get("events", []))

    def test_scanner_failed(self):
        result = code_audit_node({"_scanner_failed": True, "file_tree": [], "file_contents": {}})
        assert result["code_audit"] is None
        assert any(ev["status"] == "skipped" for ev in result.get("events", []))

    @patch("app.orchestrator._is_circuit_open", return_value=True)
    def test_circuit_breaker_open(self, _mock):
        result = code_audit_node({"file_tree": [], "file_contents": {}})
        assert result["code_audit"] is None
        assert any(ev["status"] == "skipped" for ev in result.get("events", []))

    @patch("app.orchestrator.run_code_audit", side_effect=RuntimeError("oops"))
    def test_exception_returns_safe_defaults(self, _mock):
        result = code_audit_node({"file_tree": [], "file_contents": {}})
        assert result["code_audit"] is None
        assert any(ev["status"] == "error" for ev in result.get("events", []))


class TestBuildGraph:
    def test_has_all_nodes(self):
        g = build_graph()
        node_names = set(g.nodes.keys())
        expected = {
            "scanner",
            "architecture",
            "api_docs",
            "security",
            "rag_setup",
            "cve_scanner",
            "git_audit",
            "solidity",
            "code_audit",
        }
        assert expected.issubset(node_names)
