from pathlib import Path
from unittest.mock import MagicMock, patch

import orjson

from agents.language_audit import _materialize_workspace, run_code_audit


class TestRunCodeAudit:
    def test_empty_file_tree_returns_empty(self):
        assert run_code_audit([], {}) == []

    @patch("agents.language_audit.shutil.which")
    @patch("agents.language_audit.subprocess.run")
    @patch("agents.language_audit.get_cached", return_value=None)
    @patch("llm_cache.invoke_with_retry")
    def test_python_tool_and_triage(self, mock_invoke, mock_get_cached, mock_run, mock_which):
        mock_which.return_value = "/usr/bin/pylint"
        mock_run.return_value = MagicMock(
            stdout=orjson.dumps(
                [
                    {
                        "message": "Unused import os",
                        "symbol": "W0611",
                        "path": "src/main.py",
                        "line": 1,
                    }
                ]
            ).decode()
        )
        mock_invoke.return_value = MagicMock(
            content=orjson.dumps(
                {
                    "findings": [
                        {
                            "id": "f1",
                            "file": "src/main.py",
                            "line": 1,
                            "severity": "medium",
                            "title": "Unused import",
                            "description": "Unused import os",
                            "remediation": "Remove unused import",
                        }
                    ]
                }
            ).decode()
        )

        results = run_code_audit(["src/main.py"], {"src/main.py": "import os\n"})

        assert len(results) == 1
        assert results[0]["language"] == "python"
        assert results[0]["tool"] == "pylint"
        assert len(results[0]["findings"]) == 1
        assert results[0]["findings"][0]["file"] == "src/main.py"

    @patch("agents.language_audit.shutil.which", return_value=None)
    @patch("agents.language_audit.get_cached", return_value=None)
    @patch("llm_cache.invoke_with_retry")
    def test_llm_fallback_when_tool_missing(self, mock_invoke, mock_get_cached, mock_which):
        mock_invoke.return_value = MagicMock(
            content=orjson.dumps(
                {
                    "findings": [
                        {
                            "id": "f1",
                            "file": "src/main.py",
                            "line": 5,
                            "severity": "medium",
                            "title": "Missing type hints",
                            "description": "Function lacks type hints",
                            "remediation": "Add type hints",
                        }
                    ]
                }
            ).decode()
        )

        results = run_code_audit(["src/main.py"], {"src/main.py": "def foo():\n    pass\n"})

        assert len(results) == 1
        assert results[0]["language"] == "python"
        assert results[0]["tool"] is None
        assert len(results[0]["findings"]) == 1

    @patch("agents.language_audit.shutil.which")
    @patch("agents.language_audit.get_cached")
    def test_cache_hit_skips_llm(self, mock_get_cached, mock_which):
        mock_which.return_value = "/usr/bin/pylint"
        mock_get_cached.return_value = orjson.dumps(
            {
                "findings": [
                    {
                        "id": "cached1",
                        "file": "src/main.py",
                        "line": 1,
                        "severity": "low",
                        "title": "Cached finding",
                        "description": "Found from cache",
                        "remediation": "Fix it",
                    }
                ]
            }
        ).decode()

        with patch("agents.language_audit.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout=orjson.dumps(
                    [
                        {
                            "message": "test",
                            "symbol": "C0114",
                            "path": "src/main.py",
                            "line": 1,
                        }
                    ]
                ).decode()
            )
            results = run_code_audit(["src/main.py"], {"src/main.py": "x = 1\n"})

        assert len(results) == 1
        assert results[0]["findings"][0]["id"] == "cached1"

    @patch("agents.language_audit.shutil.which")
    @patch("agents.language_audit.subprocess.run")
    @patch("agents.language_audit.get_cached", return_value=None)
    @patch("llm_cache.invoke_with_retry")
    def test_tool_failure_falls_back_to_llm(self, mock_invoke, mock_get_cached, mock_run, mock_which):
        mock_which.return_value = "/usr/bin/pylint"
        mock_run.side_effect = RuntimeError("pylint crashed")
        mock_invoke.return_value = MagicMock(
            content=orjson.dumps(
                {
                    "findings": [
                        {
                            "id": "f2",
                            "file": "src/main.py",
                            "line": 1,
                            "severity": "low",
                            "title": "Fallback finding",
                            "description": "Tool failed, LLM fallback",
                            "remediation": "Fix it",
                        }
                    ]
                }
            ).decode()
        )

        results = run_code_audit(["src/main.py"], {"src/main.py": "x = 1\n"})

        assert len(results) == 1
        assert results[0]["tool"] is None
        assert results[0]["findings"][0]["id"] == "f2"

    @patch("agents.language_audit.shutil.which", return_value=None)
    @patch("agents.language_audit.get_cached", return_value=None)
    @patch("llm_cache.invoke_with_retry")
    def test_llm_returns_empty_findings(self, mock_invoke, mock_get_cached, mock_which):
        mock_invoke.return_value = MagicMock(content=orjson.dumps({"findings": []}).decode())

        results = run_code_audit(["src/main.py"], {"src/main.py": "x = 1\n"})

        assert results == []

    def test_java_uses_llm_only_no_tool(self):
        with (
            patch("agents.language_audit.shutil.which", return_value=None),
            patch("agents.language_audit.get_cached", return_value=None),
            patch(
                "llm_cache.invoke_with_retry",
                return_value=MagicMock(
                    content=orjson.dumps(
                        {
                            "findings": [
                                {
                                    "id": "j1",
                                    "file": "src/App.java",
                                    "line": 10,
                                    "severity": "high",
                                    "title": "SQL injection",
                                    "description": "String concat in SQL query",
                                    "remediation": "Use prepared statements",
                                }
                            ]
                        }
                    ).decode()
                ),
            ),
        ):
            results = run_code_audit(
                ["src/App.java"],
                {"src/App.java": 'String q = "SELECT * FROM users WHERE id=" + id;'},
            )

        assert len(results) == 1
        assert results[0]["language"] == "java"
        assert results[0]["tool"] is None

    def test_skips_language_with_no_matching_files(self):
        results = run_code_audit(["README.md"], {"README.md": "# Hello"})
        assert results == []


class TestMaterializeWorkspace:
    def test_go_workspace_writes_go_files_and_mod(self):
        contents = {
            "go.mod": "module example.com/app\n\ngo 1.22\n",
            "cmd/main.go": "package main\n\nfunc main() {}\n",
        }
        dest = _materialize_workspace("go", ["cmd/main.go"], contents)
        try:
            assert (Path(dest) / "go.mod").exists()
            assert (Path(dest) / "cmd/main.go").exists()
        finally:
            import shutil

            shutil.rmtree(dest, ignore_errors=True)

    @patch("agents.language_audit.shutil.which")
    @patch("agents.language_audit.subprocess.run")
    @patch("agents.language_audit.get_cached", return_value=None)
    @patch("llm_cache.invoke_with_retry")
    def test_go_tool_runs_in_materialized_workspace(self, mock_invoke, mock_get_cached, mock_run, mock_which):
        from pathlib import Path

        mock_which.return_value = "/usr/bin/go"

        def _assert_workspace(cmd, **kwargs):
            cwd = kwargs.get("cwd")
            assert cwd
            assert (Path(cwd) / "go.mod").exists()
            assert (Path(cwd) / "main.go").exists()
            return MagicMock(stdout="[]")

        mock_run.side_effect = _assert_workspace
        mock_invoke.return_value = MagicMock(content='{"findings": []}')

        run_code_audit(
            ["main.go"],
            {
                "go.mod": "module example.com/app\n\ngo 1.22\n",
                "main.go": "package main\n\nfunc main() {}\n",
            },
        )

        mock_run.assert_called_once()
