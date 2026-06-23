import asyncio
import json

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from agents.chat import run_chat_agent
from models.requests import ChatRequest
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit
from services.session import _UUID_RE, get_session

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.post("/chat")
async def chat_endpoint(req: ChatRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return {"error": "Invalid session ID"}
    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("chat", client_ip))[0]:
        return await rate_limit_response("chat", client_ip)

    session = await get_session(req.session_id)
    if not session:
        return {"error": "Session not found. Run /ws/analyze first."}
    if not session.get("chroma_collection_name"):
        return {"error": "Knowledge base not ready — RAG setup may have failed."}

    answer = await asyncio.to_thread(
        run_chat_agent,
        question=req.question,
        collection_name=session["chroma_collection_name"],
        chat_history=session["chat_history"],
        repo_name=session["repo_name"],
    )

    session["chat_history"].extend(
        [
            {"role": "user", "content": req.question},
            {"role": "assistant", "content": answer},
        ]
    )
    session["chat_history"] = session["chat_history"][-50:]

    return {"answer": answer}


@router.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest, request: Request):
    from agents.chat import run_chat_agent_stream

    if not _UUID_RE.match(req.session_id):

        async def _bad():
            yield f"data: {json.dumps({'error': 'Invalid session ID'})}\n\n"

        return StreamingResponse(_bad(), media_type="text/event-stream")

    client_ip = request.client.host if request.client else "unknown"
    if not (await check_rate_limit("chat", client_ip))[0]:
        return await rate_limit_response("chat", client_ip)

    session = await get_session(req.session_id)

    async def generate():
        if not session:
            yield f"data: {json.dumps({'error': 'Session not found. Run /ws/analyze first.'})}\n\n"
            return
        if not session.get("chroma_collection_name"):
            yield f"data: {json.dumps({'error': 'Knowledge base not ready — RAG setup may have failed.'})}\n\n"
            return

        full_answer = ""
        async for token in run_chat_agent_stream(
            question=req.question,
            collection_name=session["chroma_collection_name"],
            chat_history=session["chat_history"],
            repo_name=session["repo_name"],
        ):
            full_answer += token
            yield f"data: {json.dumps({'token': token})}\n\n"

        session["chat_history"].extend(
            [
                {"role": "user", "content": req.question},
                {"role": "assistant", "content": full_answer},
            ]
        )
        session["chat_history"] = session["chat_history"][-50:]
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
