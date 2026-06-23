from routes.analysis import _build_summary_audit_context


def test_build_summary_audit_context_includes_all_audit_domains():
    session = {
        "security_findings": [{"severity": "critical", "rule": "sql-injection"}],
        "git_audit": {"stats": {"secrets_found": 2, "sensitive_files": 1, "bad_messages": 3}},
        "solidity_audit": {"findings": [{"severity": "high", "title": "Reentrancy"}]},
        "code_audit": [{"language": "python", "findings": [{"severity": "medium", "title": "Unused import"}]}],
        "health": {"grade": "B", "score": 82, "breakdown": {"code_quality": 70}},
    }

    context, stats = _build_summary_audit_context(session)

    assert "Security: 1 findings" in context
    assert "sql-injection" in context
    assert "Git audit: 2 secret(s)" in context
    assert "Solidity: 1 finding(s)" in context
    assert "Code audit: 1 finding(s)" in context
    assert "Health score: B (82/100)" in context
    assert stats["git_secrets"] == 2
    assert stats["solidity_findings"] == 1
    assert stats["code_audit_findings"] == 1
    assert stats["health_grade"] == "B"
