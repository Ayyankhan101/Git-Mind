from unittest.mock import patch

import pytest

from routes.pr import _compute_pr_impact


@pytest.mark.asyncio
async def test_pr_impact_health_uses_code_audit():
    base_session = {
        "health": {
            "score": 90,
            "grade": "A",
            "breakdown": {
                "security": 100,
                "documentation": 100,
                "api_coverage": 100,
                "dependency_freshness": 100,
                "code_quality": 100,
            },
        },
        "security_findings": [],
        "cve_findings": [],
        "api_docs": [{"route": "/health", "description": "ok"}],
        "code_audit": [],
    }
    pr_code_audit = [
        {
            "language": "python",
            "findings": [
                {"severity": "critical", "file": "app.py", "line": 1, "title": "Bad"}
            ],
        }
    ]

    with (
        patch(
            "agents.scanner.clone_and_scan",
            return_value={
                "local_path": "/tmp/fake",
                "file_tree": ["app.py"],
                "file_contents": {"app.py": "x = 1\n"},
            },
        ),
        patch("agents.security.run_security_agent", return_value=[]),
        patch("agents.cve_scanner.run_cve_scanner", return_value=[]),
        patch("agents.language_audit.run_code_audit", return_value=pr_code_audit),
        patch(
            "agents.impact.run_merge_prediction",
            return_value={"merge_risk": "medium", "narrative": "ok"},
        ),
        patch("routes.pr.shutil.rmtree"),
    ):
        result = await _compute_pr_impact(
            repo_url="https://github.com/o/r",
            token=None,
            head_ref="feature",
            base_session=base_session,
            pr_meta={
                "title": "Test PR",
                "owner": "o",
                "repo": "r",
                "pr_num": "1",
                "head_sha": "abc123",
                "base_branch": "main",
                "additions": 1,
                "deletions": 0,
                "changed_files": 1,
                "diff_truncated": False,
            },
            pr_diff="diff",
        )

    assert result["pr_score"] < result["base_score"]
    assert result["breakdown_delta"]["code_quality"] < 0
