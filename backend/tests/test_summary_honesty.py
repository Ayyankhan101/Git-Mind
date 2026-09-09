"""POST /summary must never let the LLM invent specifics about a repo it
never actually read.

Regression: with no retrievable code context (scan failed, RAG/embedding
still indexing, or a genuinely empty repo), the old prompt still instructed
the LLM to "be specific about tech stack / purpose" — observed live
producing a confident, plausible, completely fabricated description (a
Python/FastAPI repo summarized as "a full-stack JavaScript SaaS platform,
Node.js/Express backend, PostgreSQL, React SPA"). The prompt must now
explicitly forbid guessing whenever no code chunks were retrieved.
"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)
AUTH = {"Authorization": "Bearer ghp_test_placeholder"}


async def test_no_chunks_uses_honest_prompt_not_invent_instruction():
    from services.session import put_session

    session_id = "00000000-0000-0000-0000-0000000000a1"
    await put_session(
        session_id,
        {
            "repo_name": "test-repo",
            "chroma_collection_name": None,
            "security_findings": [],
            "chat_history": [],
        },
    )

    captured = {}

    def _fake_invoke(_lm, prompt):
        captured["prompt"] = prompt
        return MagicMock(content="Purpose could not be determined — no source content available.")

    with patch("routes.analysis.invoke_with_retry", side_effect=_fake_invoke):
        resp = client.post("/summary", json={"session_id": session_id}, headers=AUTH)

    assert resp.status_code == 200
    assert "do not invent or guess" in captured["prompt"].lower()
    assert "be specific about tech stack" not in captured["prompt"].lower()


async def test_with_chunks_uses_normal_prompt_grounded_in_context():
    from services.session import put_session

    session_id = "00000000-0000-0000-0000-0000000000a2"
    await put_session(
        session_id,
        {
            "repo_name": "test-repo",
            "chroma_collection_name": "repo_test_abc123",
            "security_findings": [],
            "chat_history": [],
        },
    )

    captured = {}

    def _fake_invoke(_lm, prompt):
        captured["prompt"] = prompt
        return MagicMock(content="A FastAPI backend serving repo analysis over WebSockets.")

    fake_chunks = [{"filepath": "main.py", "content": "from fastapi import FastAPI\napp = FastAPI()"}]

    with (
        patch("routes.analysis.search_codebase", return_value=fake_chunks),
        patch("routes.analysis.invoke_with_retry", side_effect=_fake_invoke),
    ):
        resp = client.post("/summary", json={"session_id": session_id}, headers=AUTH)

    assert resp.status_code == 200
    assert "never invent details not shown there" in captured["prompt"].lower()
    assert "main.py" in captured["prompt"]
