import logging

from langchain_groq import ChatGroq

from chroma_utils import search_codebase

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


def run_chat_agent(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
) -> str:
    chunks = search_codebase(collection_name, question, n_results=5)
    context = (
        "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks)
        or "No relevant code found."
    )
    history = (
        "\n".join(f"{m['role'].upper()}: {m['content']}" for m in chat_history[-4:])
        or "None."
    )
    system = _SYSTEM_TEMPLATE.format(
        repo_name=repo_name,
        context=context,
        history=history,
    )

    llm    = ChatGroq(model=_MODEL, temperature=0.2)
    answer = llm.invoke([
        {"role": "system",  "content": system},
        {"role": "user",    "content": question},
    ]).content

    logger.debug("Chat agent answered question of length %d", len(question))
    return answer


async def run_chat_agent_stream(
    question: str,
    collection_name: str,
    chat_history: list[dict],
    repo_name: str,
):
    """Async generator yielding text tokens for streaming chat responses."""
    chunks = search_codebase(collection_name, question, n_results=5)
    context = (
        "\n\n".join(f"--- {c['filepath']} ---\n{c['content']}" for c in chunks)
        or "No relevant code found."
    )
    history = (
        "\n".join(f"{m['role'].upper()}: {m['content']}" for m in chat_history[-4:])
        or "None."
    )
    system = _SYSTEM_TEMPLATE.format(
        repo_name=repo_name,
        context=context,
        history=history,
    )
    llm = ChatGroq(model=_MODEL, temperature=0.2)
    async for chunk in llm.astream([
        {"role": "system", "content": system},
        {"role": "user",   "content": question},
    ]):
        yield chunk.content
