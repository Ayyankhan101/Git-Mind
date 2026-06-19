from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    question: str = Field(..., max_length=2000)


class SummaryRequest(BaseModel):
    session_id: str = Field(..., max_length=36)


class PRReviewRequest(BaseModel):
    pr_url: str = Field(..., max_length=500)


class FixRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    finding: dict = Field(..., max_length=50)


class AutoPRRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    finding: dict = Field(..., max_length=50)


class PRImpactRequest(BaseModel):
    pr_url: str = Field(..., max_length=500)
    session_id: str = Field(..., max_length=36)


class OrgAuditRequest(BaseModel):
    repos: list[str] = Field(..., max_length=20)


class IncidentReportRequest(BaseModel):
    session_id: str = Field(..., max_length=36)
    finding: dict = Field(..., max_length=50)
    crisis_messages: list[dict] = Field(default=[], max_length=100)
    outcome: str = Field(default="unknown", max_length=50)
