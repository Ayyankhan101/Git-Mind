from agents.health import _code_quality_score, _flatten_code_audit_findings, compute_health


class TestComputeHealth:
    def test_perfect_score_with_no_findings(self):
        result = compute_health(
            file_contents={"README.md": "# Hello\n"},
            security_findings=[],
            cve_findings=[],
            api_docs=[{"route": "/health", "description": "Health check"}],
            code_audit=[],
        )
        assert result["score"] >= 80
        assert result["breakdown"]["code_quality"] == 100

    def test_code_audit_penalizes_findings(self):
        without = compute_health({}, [], [], [], code_audit=[])
        with_findings = compute_health(
            {},
            [],
            [],
            [],
            code_audit=[
                {
                    "language": "python",
                    "findings": [{"severity": "critical"}, {"severity": "high"}],
                }
            ],
        )
        assert with_findings["breakdown"]["code_quality"] < without["breakdown"]["code_quality"]
        assert with_findings["score"] <= without["score"]

    def test_flatten_code_audit_findings(self):
        findings = _flatten_code_audit_findings(
            [
                {"findings": [{"id": "a"}]},
                {"findings": [{"id": "b"}, {"id": "c"}]},
            ]
        )
        assert len(findings) == 3

    def test_code_quality_score_empty_is_perfect(self):
        assert _code_quality_score(None) == 100.0
        assert _code_quality_score([]) == 100.0
