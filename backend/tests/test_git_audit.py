"""agents.git_audit: commit history fetch failure handling.

Regression: a failed/rate-limited GitHub commits API call used to be
swallowed to [] inside _fetch_commits, so run_git_audit reported
stats.total=0, bad_messages=0 — identical to "checked every commit, found
zero bad messages". Real local findings (scan_secrets/scan_sensitive_files,
which never touch the network) must still come through even when the commit
fetch fails, but the commit-quality stats must be marked unavailable, not
silently zero.
"""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from agents.git_audit import _fetch_commits, run_git_audit

URL = "https://github.com/acme/example"


class TestFetchCommitsRaisesOnFailure:
    def test_network_error_propagates(self):
        with (
            patch("httpx.Client.get", side_effect=httpx.ConnectError("refused")),
            pytest.raises(httpx.ConnectError),
        ):
            _fetch_commits("acme", "example", None)

    def test_non_2xx_raises(self):
        resp = MagicMock(is_error=True, status_code=403)
        with (
            patch("httpx.Client.get", return_value=resp),
            pytest.raises(RuntimeError, match="403"),
        ):
            _fetch_commits("acme", "example", None)


class TestRunGitAuditCommitFailure:
    def test_commit_fetch_failure_marks_unavailable_not_zero(self):
        with (
            patch("agents.git_audit._fetch_commits", side_effect=RuntimeError("rate limited")),
            patch("agents.git_audit.scan_sensitive_files", return_value=[]),
            patch("agents.git_audit.scan_secrets", return_value=[{"file": "x.env", "match": "SECRET"}]),
        ):
            result = run_git_audit(URL, ["x.env"], {"x.env": "API_KEY=abc"})

        assert result["commits_unavailable"] is True
        assert result["stats"]["total"] == 0
        # Real, locally-computed findings must survive a commits-fetch failure.
        assert result["secret_findings"] == [{"file": "x.env", "match": "SECRET"}]

    def test_successful_fetch_marks_available(self):
        commits = [{"msg_quality": "good"}, {"msg_quality": "bad"}]
        with (
            patch("agents.git_audit._fetch_commits", return_value=commits),
            patch("agents.git_audit.scan_sensitive_files", return_value=[]),
            patch("agents.git_audit.scan_secrets", return_value=[]),
        ):
            result = run_git_audit(URL, [], {})

        assert result["commits_unavailable"] is False
        assert result["stats"]["total"] == 2
        assert result["stats"]["bad_messages"] == 1
