from pydantic import BaseModel, Field


class Finding(BaseModel):
    id: str | None = None
    rule: str | None = None
    file: str | None = None
    title: str | None = None
    description: str | None = None
    severity: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    exploit_story: str | None = None
    check: str | None = None


class ChatRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    question: str = Field(..., max_length=2000)


class SummaryRequest(BaseModel):
    session_id: str = Field(..., max_length=36)


class PRReviewRequest(BaseModel):
    pr_url: str = Field(..., max_length=500)


class FixRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    finding: Finding


class AutoPRRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    finding: Finding


class PRImpactRequest(BaseModel):
    pr_url: str = Field(..., max_length=500)
    session_id: str = Field(..., max_length=36)


class OrgAuditRequest(BaseModel):
    repos: list[str] = Field(..., max_length=20)


class IncidentReportRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    finding: Finding
    crisis_messages: list[dict] = Field(default=[], max_length=100)
    outcome: str = Field(default="unknown", max_length=50)


class AnalyzeRequest(BaseModel):
    repo_url: str = Field(..., max_length=500)
    gh_token: str | None = Field(None, max_length=200)


class WebhookNotifyRequest(BaseModel):
    slack_webhook_url: str = Field(..., max_length=500)
    channel: str | None = Field(None, max_length=100)
    message: str = Field(..., max_length=4000)
    blocks: list[dict] | None = Field(None, max_length=50)


class MonitorSubscribeRequest(BaseModel):
    repo_url: str = Field(..., max_length=500)
    gh_token: str | None = Field(None, max_length=200)
    slack_webhook_url: str | None = Field(None, max_length=500)
    schedule_cron: str = Field(default="0 8 * * 1", max_length=100)
    score_delta_threshold: int = Field(default=-5, ge=-50, le=0)
    alert_on_new_findings: bool = Field(default=True)
