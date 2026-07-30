import logging

from langchain_groq import ChatGroq

from chroma_utils import search_codebase
from llm_cache import invoke_with_retry

logger = logging.getLogger(__name__)

_MODEL = "llama-3.3-70b-versatile"
_LLM = ChatGroq(model=_MODEL, temperature=0.2)

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


def _build_messages(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
) -> tuple[list[dict], list[dict]]:
    """Build messages and return (messages, sources) where sources are chunk dicts."""
    chunks = search_codebase(collection_name, question, n_results=8)
    context = "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks) or "No relevant code found."
    history = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in chat_history[-10:]) or "None."
    system = _SYSTEM_TEMPLATE.format(repo_name=repo_name, context=context, history=history)
    sources = [{"filepath": c["filepath"]} for c in chunks]
    return [{"role": "system", "content": system}, {"role": "user", "content": question}], sources


def run_chat_agent(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
) -> tuple[str, list[dict]]:
    """Run chat agent. Returns (answer, sources)."""
    messages, sources = _build_messages(question, collection_name, chat_history, repo_name)
    answer = invoke_with_retry(_LLM, messages).content
    logger.debug("Chat agent answered question of length %d", len(question))
    return answer, sources


async def run_chat_agent_stream(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
):
    """Async generator yielding (token, sources) tuples for streaming chat.

    On the first yield, sources is a list of dicts with 'filepath' keys.
    On subsequent yields, sources is None.
    """
    messages, sources = _build_messages(question, collection_name, chat_history, repo_name)
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
