"""Unit tests for agents.scanner.clone_and_scan.

Covers the clone retry logic, deterministic-failure classification, stderr
surfacing in the final error, and askpass/token behavior across retries.

git.Repo.clone_from is mocked throughout — no network or real clones.
"""

import os
from types import SimpleNamespace
from unittest.mock import patch

import git
import pytest

from agents.scanner import _active_temp_dirs, _cleanup_temp_dir, clone_and_scan

URL = "https://github.com/acme/example"


def _fake_repo(hexsha: str = "abc123"):
    """A stand-in for a cloned Repo object (head commit + close)."""
    repo = SimpleNamespace()
    repo.close = lambda: None
    repo.head = SimpleNamespace(commit=SimpleNamespace(hexsha=hexsha))
    return repo


def _clone_error(stderr: str) -> git.exc.GitCommandError:
    return git.exc.GitCommandError("git clone", 128, stderr)


@pytest.fixture(autouse=True)
def _cleanup_temp_dirs():
    """Remove only the temp dirs this test created — never another test's."""
    before = set(_active_temp_dirs)
    yield
    for path in list(_active_temp_dirs):
        if path not in before:
            _cleanup_temp_dir(path)


class TestCloneSuccess:
    def test_happy_path_returns_inventory(self):
        with patch("agents.scanner.git.Repo.clone_from", return_value=_fake_repo()):
            result = clone_and_scan(URL)

        assert result["repo_name"] == "example"
        assert result["head_sha"] == "abc123"
        assert isinstance(result["file_tree"], list)
        assert isinstance(result["file_contents"], dict)
        assert result["local_path"]

    def test_clone_passes_shallow_kwargs(self):
        captured = {}

        def fake_clone(*args, **kwargs):
            captured.update(kwargs)
            return _fake_repo()

        with patch("agents.scanner.git.Repo.clone_from", side_effect=fake_clone):
            clone_and_scan(URL)

        assert captured["depth"] == 1
        assert captured["no_single_branch"] is True
        assert "branch" not in captured

    def test_clone_passes_branch_when_requested(self):
        captured = {}

        def fake_clone(*args, **kwargs):
            captured.update(kwargs)
            return _fake_repo()

        with patch("agents.scanner.git.Repo.clone_from", side_effect=fake_clone):
            clone_and_scan(URL, branch="fix/qa")

        assert captured["branch"] == "fix/qa"
        assert "no_single_branch" not in captured

    def test_invalid_url_raises_value_error(self):
        with pytest.raises(ValueError):
            clone_and_scan("https://gitlab.com/acme/example")


class TestCloneRetry:
    @patch("agents.scanner.time.sleep")
    def test_transient_failure_retries_then_succeeds(self, mock_sleep):
        calls = []

        def fake_clone(*args, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                raise _clone_error(
                    "fatal: unable to access 'https://github.com/acme/example.git/': Could not resolve host: github.com"
                )
            return _fake_repo()

        with patch("agents.scanner.git.Repo.clone_from", side_effect=fake_clone):
            result = clone_and_scan(URL)

        assert len(calls) == 2
        assert result["head_sha"] == "abc123"
        mock_sleep.assert_called_once()

    @patch("agents.scanner.time.sleep")
    def test_retry_gets_clean_dest_dir(self, mock_sleep):
        """A failed attempt must not leave a dirty dest behind for the retry."""
        dests_seen = []

        def fake_clone(*args, **kwargs):
            dests_seen.append(args[1])
            if len(dests_seen) == 1:
                raise _clone_error(
                    "fatal: unable to access 'https://github.com/acme/example.git/': Operation timed out"
                )
            # If the code stopped cleaning dest between attempts, git would
            # refuse the retry with "already exists" — make that a failure.
            if os.path.isdir(args[1]) and os.listdir(args[1]):
                raise _clone_error(
                    "fatal: destination path already exists and is not an empty directory."
                )
            return _fake_repo()

        with patch("agents.scanner.git.Repo.clone_from", side_effect=fake_clone):
            clone_and_scan(URL)

        assert len(dests_seen) == 2
        assert not os.listdir(dests_seen[1]), "dest must be empty before the retry"


class TestDeterministicFailures:
    @pytest.mark.parametrize(
        "stderr",
        [
            "remote: Repository not found.\nfatal: repository 'https://github.com/acme/example.git/' not found",
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
            "fatal: Authentication failed for 'https://github.com/acme/example.git/'",
            "fatal: unable to access 'https://github.com/acme/example.git/': The requested URL returned error: 404",
            "fatal: unable to access 'https://github.com/acme/example.git/': The requested URL returned error: 401",
        ],
        ids=["repo-not-found", "no-username", "auth-failed", "http-404", "http-401"],
    )
    @patch("agents.scanner.time.sleep")
    def test_deterministic_failure_raises_immediately_without_retry(
        self, mock_sleep, stderr
    ):
        calls = []

        def fake_clone(*args, **kwargs):
            calls.append(kwargs)
            raise _clone_error(stderr)

        with (
            patch("agents.scanner.git.Repo.clone_from", side_effect=fake_clone),
            pytest.raises(RuntimeError) as excinfo,
        ):
            clone_and_scan(URL)

        assert len(calls) == 1, "deterministic failures must not be retried"
        assert "Git clone failed for" in str(excinfo.value)
        mock_sleep.assert_not_called()


class TestErrorSurfacing:
    @patch("agents.scanner.time.sleep")
    def test_transient_final_failure_surfaces_git_stderr(self, mock_sleep):
        stderr = "fatal: unable to access 'https://github.com/acme/example.git/': Could not resolve host: github.com"

        with (
            patch(
                "agents.scanner.git.Repo.clone_from", side_effect=_clone_error(stderr)
            ),
            pytest.raises(RuntimeError) as excinfo,
        ):
            clone_and_scan(URL)

        # Both attempts fail -> full stderr appears in the message
        assert "Could not resolve host" in str(excinfo.value)
        assert str(excinfo.value).startswith("Git clone failed for")

    @patch("agents.scanner.time.sleep")
    def test_empty_stderr_defaults_to_transient_retry(self, mock_sleep):
        calls = []

        def fake_clone(*args, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                raise git.exc.GitCommandError("git clone", 128)  # no stderr at all
            return _fake_repo()

        with patch("agents.scanner.git.Repo.clone_from", side_effect=fake_clone):
            result = clone_and_scan(URL)

        assert len(calls) == 2, "missing stderr is ambiguous -> treated as transient"
        assert result["head_sha"] == "abc123"

    @patch("agents.scanner.time.sleep")
    def test_error_message_falls_back_when_stderr_is_none(self, mock_sleep):
        with (
            patch(
                "agents.scanner.git.Repo.clone_from",
                side_effect=git.exc.GitCommandError("git clone", 128),  # stderr=None
            ),
            pytest.raises(RuntimeError) as excinfo,
        ):
            clone_and_scan(URL)

        assert str(excinfo.value).startswith("Git clone failed for")

    @patch("agents.scanner.time.sleep")
    def test_askpass_script_outlives_retry_then_is_cleaned_up(self, mock_sleep):
        state = {"attempt": 0, "askpass_path": None, "existed_on_retry": False}

        def fake_clone(*args, **kwargs):
            state["attempt"] += 1
            state["askpass_path"] = kwargs.get("env", {}).get("GIT_ASKPASS")
            if state["attempt"] == 1:
                raise _clone_error(
                    "fatal: unable to access 'https://github.com/acme/example.git/': Operation timed out"
                )
            state["existed_on_retry"] = bool(state["askpass_path"]) and os.path.exists(
                state["askpass_path"]
            )
            return _fake_repo()

        with patch("agents.scanner.git.Repo.clone_from", side_effect=fake_clone):
            result = clone_and_scan(URL, token="ghp_test_token")

        assert result["head_sha"] == "abc123"
        # The token script must still be on disk for the retried clone...
        assert state[
            "existed_on_retry"
        ], "askpass script must survive into the retry attempt"
        # ...and removed once cloning finishes.
        assert state["askpass_path"] and not os.path.exists(
            state["askpass_path"]
        ), "askpass script should be removed once cloning finishes"
