import asyncio
import json

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from agents.chat import run_chat_agent
from models.requests import ChatRequest
from routes._errors import error_response
from services.rate_limit_response import rate_limit_response
from services.rate_limiter import check_rate_limit, get_client_ip
from services.session import _UUID_RE, get_session

logger = structlog.get_logger(__name__)
router = APIRouter()


def _build_graph_context(session: dict) -> str:
    """Build a summary of the architecture graph for the chat agent."""
    parts = []

    # Structured graph (primary)
    graph = session.get("architecture_graph")
    if graph and graph.get("nodes"):
        lines = ["Repository Architecture:"]
        for node in graph["nodes"]:
            label = node.get("label", "Unknown")
            node_type = node.get("type", "module")
            layer = node.get("layer", "backend")
            file_path = node.get("file_path", "")
            endpoints = node.get("endpoints", [])

            line = f"- {label} [{node_type}] ({layer})"
            if file_path:
                line += f" in {file_path}"
            if endpoints:
                methods = set(e.get("method", "") for e in endpoints)
                paths = set(e.get("path", "") for e in endpoints)
                line += f" — endpoints: {', '.join(sorted(methods))} {', '.join(sorted(paths))}"
            lines.append(line)

        # Add edges summary
        edges = graph.get("edges", [])
        if edges:
            lines.append("\nRelationships:")
            for edge in edges[:15]:  # Limit to avoid context bloat
                source = edge.get("source", "")
                target = edge.get("target", "")
                relationship = edge.get("relationship", "imports")
                lines.append(f"- {source} → {target} ({relationship})")
        parts.append("\n".join(lines))

    # Mermaid diagram (supplementary — gives LLM semantic understanding)
    diagram = session.get("architecture_diagram")
    if diagram and isinstance(diagram, str) and diagram.startswith("graph"):
        parts.append(f"\nArchitecture Diagram (Mermaid):\n{diagram}")

    return "\n\n".join(parts)


@router.post("/chat")
async def chat_endpoint(req: ChatRequest, request: Request):
    if not _UUID_RE.match(req.session_id):
        return error_response("Invalid session ID", 400)
    client_ip = get_client_ip(request)
    if not (await check_rate_limit("chat", client_ip))[0]:
        return await rate_limit_response("chat", client_ip)
    if not (await check_rate_limit("analyze_chat_burst", client_ip))[0]:
        return await rate_limit_response("analyze_chat_burst", client_ip)

    session = await get_session(req.session_id)
    if not session:
        return error_response("Session not found. Run /ws/analyze first.", 404)
    if not session.get("chroma_collection_name"):
        return error_response("Knowledge base not ready — RAG setup may have failed.", 503)

    # Defensive: check if ChromaDB collection still exists (ephemeral storage)
    from chroma_utils import _client
    collection_name = session["chroma_collection_name"]
    try:
        _client.get_collection(collection_name)
    except Exception:
        # Collection lost (ephemeral storage). Re-embed if file_contents available.
        file_contents = session.get("file_contents")
        if file_contents:
            from agents.rag_setup import run_rag_setup
            try:
                new_name = await asyncio.to_thread(
                    run_rag_setup, file_contents, session["repo_name"], session.get("repo_url", "")
                )
                session["chroma_collection_name"] = new_name
                collection_name = new_name
                logger.info("Re-embedded codebase after collection loss", new_collection=new_name)
            except Exception as exc:
                logger.warning("Re-embed failed: %s", exc)
                return error_response("Knowledge base lost (server restart). Re-run analysis.", 503)
        else:
            return error_response("Knowledge base lost (server restart). Re-run analysis.", 503)

    graph_context = _build_graph_context(session)

    answer, sources = await asyncio.to_thread(
        run_chat_agent,
        question=req.question,
        collection_name=session["chroma_collection_name"],
        chat_history=session["chat_history"],
        repo_name=session["repo_name"],
        graph_context=graph_context,
    )

    session["chat_history"].extend(
        [
            {"role": "user", "content": req.question},
            {"role": "assistant", "content": answer},
        ]
    )
    session["chat_history"] = session["chat_history"][-50:]

    return {"answer": answer, "sources": sources}


@router.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest, request: Request):
    from agents.chat import run_chat_agent_stream

    if not _UUID_RE.match(req.session_id):

        async def _bad():
            yield f"data: {json.dumps({'error': 'Invalid session ID'})}\n\n"

        return StreamingResponse(_bad(), media_type="text/event-stream")

    client_ip = get_client_ip(request)
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

        # Defensive: check if ChromaDB collection still exists (ephemeral storage)
        from chroma_utils import _client
        collection_name = session["chroma_collection_name"]
        try:
            _client.get_collection(collection_name)
        except Exception:
            file_contents = session.get("file_contents")
            if file_contents:
                from agents.rag_setup import run_rag_setup
                try:
                    new_name = await asyncio.to_thread(
                        run_rag_setup, file_contents, session["repo_name"], session.get("repo_url", "")
                    )
                    session["chroma_collection_name"] = new_name
                    collection_name = new_name
                except Exception:
                    yield f"data: {json.dumps({'error': 'Knowledge base lost (server restart). Re-run analysis.'})}\n\n"
                    return
            else:
                yield f"data: {json.dumps({'error': 'Knowledge base lost (server restart). Re-run analysis.'})}\n\n"
                return

        graph_context = _build_graph_context(session)
        full_answer = ""
        async for token, sources in run_chat_agent_stream(
            question=req.question,
            collection_name=session["chroma_collection_name"],
            chat_history=session["chat_history"],
            repo_name=session["repo_name"],
            graph_context=graph_context,
        ):
            full_answer += token
            if sources is not None:
                yield f"data: {json.dumps({'token': token, 'sources': sources})}\n\n"
            else:
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
