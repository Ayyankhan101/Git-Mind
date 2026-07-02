from models.requests import (
    AutoPRRequest,
    ChatRequest,
    FixRequest,
    IncidentReportRequest,
    OrgAuditRequest,
    PRImpactRequest,
    PRReviewRequest,
    SummaryRequest,
)


class TestChatRequest:
    def test_valid(self):
        r = ChatRequest(session_id="00000000-0000-0000-0000-000000000001", question="Hello")
        assert r.session_id == "00000000-0000-0000-0000-000000000001"
        assert r.question == "Hello"


class TestSummaryRequest:
    def test_valid(self):
        r = SummaryRequest(session_id="00000000-0000-0000-0000-000000000001")
        assert r.session_id is not None


class TestPRReviewRequest:
    def test_valid(self):
        r = PRReviewRequest(pr_url="https://github.com/owner/repo/pull/1")
        assert r.pr_url == "https://github.com/owner/repo/pull/1"


class TestFixRequest:
    def test_valid(self):
        r = FixRequest(session_id="00000000-0000-0000-0000-000000000001", finding={"rule": "test"})
        assert r.finding.rule == "test"


class TestAutoPRRequest:
    def test_valid(self):
        r = AutoPRRequest(session_id="00000000-0000-0000-0000-000000000001", finding={"id": "f1"})
        assert r.finding.id == "f1"


class TestPRImpactRequest:
    def test_valid(self):
        r = PRImpactRequest(
            pr_url="https://github.com/owner/repo/pull/1",
            session_id="00000000-0000-0000-0000-000000000001",
        )
        assert r.pr_url is not None


class TestOrgAuditRequest:
    def test_valid(self):
        r = OrgAuditRequest(repos=["https://github.com/owner/repo"])
        assert len(r.repos) == 1


class TestIncidentReportRequest:
    def test_valid(self):
        r = IncidentReportRequest(
            session_id="00000000-0000-0000-0000-000000000001",
            finding={"title": "XSS"},
        )
        assert r.finding.title == "XSS"
        assert r.crisis_messages == []
        assert r.outcome == "unknown"
