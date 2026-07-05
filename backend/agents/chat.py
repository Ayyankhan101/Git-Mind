import logging

from chroma_utils import search_codebase
from llm_cache import invoke_with_retry
from settings import get_llm

logger = logging.getLogger(__name__)

_MODEL = "llama-3.3-70b-versatile"
_LLM = get_llm(temperature_key="chat")

_MAX_HISTORY_CHARS = 12_000

_SYSTEM_TEMPLATE = """\
You are a senior software engineer who has read every file in the '{repo_name}' codebase.

Rules:
- ALWAYS cite specific files: e.g. "In auth/middleware.py line 42..."
- If the context contains the answer, be confident and precise
- If it does not, say "I don't see that in the code I have access to" — never guess
- Be concise but complete — use as many words as the question requires, no more
- Use markdown for code blocks and lists when it aids clarity
- Write as if you built this system yourself

Relevant code from the codebase:
{context}

Previous conversation:
{history}\
"""


def _truncate_history(history: list[dict]) -> list[dict]:
    """Keep as many recent messages as fit within a character budget."""
    total = 0
    kept: list[dict] = []
    for msg in reversed(history):
        total += len(msg.get("content", ""))
        if total > _MAX_HISTORY_CHARS:
            break
        kept.append(msg)
    kept.reverse()
    return kept


def _build_context(chunks: list[dict]) -> str:
    """Format chunks into context string with file headers.

    Allows multiple chunks per file (different code regions).
    Deduplicates identical filepath+content pairs.
    """
    seen: set[str] = set()
    parts: list[str] = []
    for c in chunks:
        key = f"{c['filepath']}:{c['content'][:200]}"
        if key in seen:
            continue
        seen.add(key)
        parts.append(f"--- {c['filepath']} ---\n{c['content']}")
    return "\n\n".join(parts) or "No relevant code found."


def _build_messages(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
) -> tuple[list[dict], list[dict]]:
    """Build LLM messages and return (messages, chunks) for source tracking."""
    chunks = search_codebase(
        collection_name,
        question,
        n_results=8,
        use_hybrid=True,
        use_reranker=True,
    )
    context = _build_context(chunks)
    history = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in _truncate_history(chat_history)) or "None."
    system = _SYSTEM_TEMPLATE.format(repo_name=repo_name, context=context, history=history)
    return [{"role": "system", "content": system}, {"role": "user", "content": question}], chunks


def _chunks_to_sources(chunks: list[dict]) -> list[dict]:
    """Extract source references from search chunks."""
    return [
        {
            "filepath": c["filepath"],
            "score": round(c.get("rerank_score", c.get("rrf_score", c.get("bm25_score", 0))), 3),
        }
        for c in chunks
    ]


def run_chat_agent(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
) -> tuple[str, list[dict]]:
    """Returns (answer, sources)."""
    messages, chunks = _build_messages(question, collection_name, chat_history, repo_name)
    answer = invoke_with_retry(_LLM, messages).content
    sources = _chunks_to_sources(chunks)
    logger.debug("Chat agent answered question of length %d", len(question))
    return answer, sources


async def run_chat_agent_stream(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
):
    """Async generator yielding (token, sources_or_none).

    Final yield is (None, sources_list) to signal completion.
    """
    messages, chunks = _build_messages(question, collection_name, chat_history, repo_name)
    sources = _chunks_to_sources(chunks)
    try:
        async for chunk in _LLM.astream(messages):
            yield chunk.content, None
    except Exception as exc:
        logger.warning("astream failed (%s), falling back to invoke_with_retry", exc)
        answer = invoke_with_retry(_LLM, messages).content
        yield answer, None
    yield None, sources
