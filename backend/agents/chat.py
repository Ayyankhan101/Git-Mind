import logging

from langchain_groq import ChatGroq

from chroma_utils import search_codebase
from llm_cache import invoke_with_retry

logger = logging.getLogger(__name__)

_MODEL = "llama-3.3-70b-versatile"

_SYSTEM_TEMPLATE = """\
You are a senior software engineer who has read every file in the '{repo_name}' codebase.

Rules:
- ALWAYS cite specific files: e.g. "In auth/middleware.py line 42..."
- If the context contains the answer, be confident and precise
- If it does not, say "I don't see that in the code I have access to" — never guess
- Keep answers under 200 words
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
) -> list[dict]:
    chunks = search_codebase(collection_name, question, n_results=5)
    context = (
        "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks)
        or "No relevant code found."
    )
    history = (
        "\n".join(f"{m['role'].upper()}: {m['content']}" for m in chat_history[-10:])
        or "None."
    )
    system = _SYSTEM_TEMPLATE.format(repo_name=repo_name, context=context, history=history)
    return [{"role": "system", "content": system}, {"role": "user", "content": question}]


def run_chat_agent(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
) -> str:
    messages = _build_messages(question, collection_name, chat_history, repo_name)
    llm      = ChatGroq(model=_MODEL, temperature=0.2)
    answer   = invoke_with_retry(llm, messages).content
    logger.debug("Chat agent answered question of length %d", len(question))
    return answer


async def run_chat_agent_stream(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
):
    """Async generator yielding text tokens for streaming chat responses."""
    messages = _build_messages(question, collection_name, chat_history, repo_name)
    llm      = ChatGroq(model=_MODEL, temperature=0.2)
    try:
        async for chunk in llm.astream(messages):
            yield chunk.content
    except Exception as exc:
        logger.warning("astream failed (%s), falling back to invoke_with_retry", exc)
        yield invoke_with_retry(llm, messages).content
