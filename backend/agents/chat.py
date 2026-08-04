import structlog

from chroma_utils import search_codebase
from llm_cache import invoke_with_retry
from settings import get_llm

logger = structlog.get_logger(__name__)

_LLM = get_llm(temperature_key="chat")

_SYSTEM_TEMPLATE = """\
You are a senior software engineer who has read every file in the '{repo_name}' codebase.

Rules:
- ALWAYS cite specific files: e.g. "In auth/middleware.py line 42..."
- If the context contains the answer, be confident and precise
- If it does not, say "I don't see that in the code I have access to" — never guess
- Be concise but complete — use as many words as the question requires, no more
- Use markdown for code blocks and lists when it aids clarity
- Write as if you built this system yourself
- Reference the file's language, layer, and relationships when explaining architecture

Relevant code from the codebase:
{context}

Previous conversation:
{history}\
"""


def _build_messages(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
    graph_context: str = "",
) -> tuple[list[dict], list[dict]]:
    """Build messages with enhanced retrieval and optional graph context."""
    # Detect if question is about architecture, imports, or specific files
    question_lower = question.lower()
    layer_filter = None
    language_filter = None

    if any(k in question_lower for k in ("frontend", "ui", "react", "component")):
        layer_filter = "frontend"
    elif any(k in question_lower for k in ("backend", "api", "server", "route")):
        layer_filter = "backend"
    elif any(k in question_lower for k in ("test", "spec")):
        layer_filter = "tests"

    if "python" in question_lower:
        language_filter = "Python"
    elif any(k in question_lower for k in ("typescript", "typescript")):
        language_filter = "TypeScript"
    elif any(k in question_lower for k in ("javascript", "javascript")):
        language_filter = "JavaScript"

    # Enhanced search with metadata filtering
    chunks = search_codebase(
        collection_name,
        question,
        n_results=8,
        layer_filter=layer_filter,
        language_filter=language_filter,
    )

    # Build context with file metadata
    context_parts = []
    for c in chunks:
        lang = c.get("language", "")
        layer = c.get("layer", "")
        header = f"--- {c['filepath']} [{lang}] ({layer}) ---"
        context_parts.append(f"{header}\n{c['content']}")
    context = "\n\n".join(context_parts) or "No relevant code found."

    # Add graph context if available
    if graph_context:
        context = f"Architecture Overview:\n{graph_context}\n\nDetailed Code:\n{context}"

    history = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in chat_history[-10:]) or "None."
    system = _SYSTEM_TEMPLATE.format(repo_name=repo_name, context=context, history=history)
    sources = [
        {
            "filepath": c["filepath"],
            "language": c.get("language", ""),
            "layer": c.get("layer", ""),
        }
        for c in chunks
    ]
    return [{"role": "system", "content": system}, {"role": "user", "content": question}], sources


def run_chat_agent(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
    graph_context: str = "",
) -> tuple[str, list[dict]]:
    """Run chat agent with enhanced retrieval. Returns (answer, sources)."""
    messages, sources = _build_messages(question, collection_name, chat_history, repo_name, graph_context)
    answer = invoke_with_retry(_LLM, messages).content
    logger.debug("Chat agent answered question of length %d", len(question))
    return answer, sources


async def run_chat_agent_stream(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
    graph_context: str = "",
):
    """Async generator yielding (token, sources) tuples for streaming chat.

    On the first yield, sources is a list of dicts with 'filepath', 'language', 'layer' keys.
    On subsequent yields, sources is None.
    """
    messages, sources = _build_messages(question, collection_name, chat_history, repo_name, graph_context)
    yielded_sources = False
    try:
        async for chunk in _LLM.astream(messages):
            if not yielded_sources:
                yield chunk.content, sources
                yielded_sources = True
            else:
                yield chunk.content, None
    except Exception as exc:
        logger.warning("astream failed (%s), falling back to invoke_with_retry", exc)
        result = invoke_with_retry(_LLM, messages).content
        if not yielded_sources:
            yield result, sources
        else:
            yield result, None
