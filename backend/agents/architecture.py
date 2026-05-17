import logging

import tiktoken
from langchain_groq import ChatGroq

from llm_cache import get_cached, set_cached

logger = logging.getLogger(__name__)

_MODEL         = "llama-3.3-70b-versatile"
_TOKEN_BUDGET  = 12_000   # leaves headroom for system prompt + completion
_MAX_TREE_LINES  = 150
_MAX_KEY_FILES   = 8
_MAX_SNIPPET_LEN = 800

_PRIORITY_KEYWORDS = [
    "main", "app", "index", "server",
    "routes", "router", "models", "config",
    "database", "db", "auth", "api",
    "service", "controller",
]

_SYSTEM_PROMPT = """\
You are an expert software architect.
Analyze the codebase below and produce a Mermaid flowchart diagram.

STRICT RULES — any violation breaks the frontend renderer:
- Output ONLY valid Mermaid syntax. No explanation. No markdown fences.
- First line must be exactly: graph TD
- Node labels: only letters, numbers, and spaces inside square brackets [Like This]
- NO parentheses inside labels — they crash the parser
- NO quotes inside labels
- Maximum 15 nodes — fewer clean nodes beats many messy ones
- Edge labels syntax: -->|short label|

CORRECT EXAMPLE:
graph TD
    A[React Frontend] -->|HTTP| B[FastAPI Backend]
    B -->|query| C[ChromaDB]
    B -->|LLM| D[OpenAI]\
"""


def run_architecture_agent(file_tree: list[str], file_contents: dict[str, str]) -> str:
    if not file_tree:
        return "graph TD\n    A[Empty Repository]"

    prompt = _build_prompt(file_tree, file_contents)

    cached = get_cached(_MODEL, prompt)
    if cached:
        logger.debug("Architecture agent: cache hit")
        return cached

    llm    = ChatGroq(model=_MODEL, temperature=0)
    result = llm.invoke(prompt).content.strip()
    result = _strip_fences(result)

    if not result.startswith("graph"):
        logger.warning("Architecture agent: unexpected LLM output — using fallback diagram")
        result = "graph TD\n    A[Analysis Incomplete]"

    set_cached(_MODEL, prompt, result)
    return result


# ── Private helpers ────────────────────────────────────────────────────────────

def _build_prompt(file_tree: list[str], file_contents: dict[str, str]) -> str:
    enc    = tiktoken.get_encoding("cl100k_base")  # approximation for Llama token counts
    budget = _TOKEN_BUDGET

    tree_str = "\n".join(file_tree[:_MAX_TREE_LINES])
    budget  -= len(enc.encode(tree_str))

    # Priority files: those whose path contains domain keywords
    priority = [
        f for f in file_tree
        if any(kw in f.lower() for kw in _PRIORITY_KEYWORDS)
    ][:_MAX_KEY_FILES]

    key_content = ""
    for fp in priority:
        if fp not in file_contents:
            continue
        snippet = file_contents[fp][:_MAX_SNIPPET_LEN]
        block   = f"\n\n=== {fp} ===\n{snippet}"
        cost    = len(enc.encode(block))
        if budget - cost < 500:   # reserve 500 tokens for system prompt + output
            break
        key_content += block
        budget      -= cost

    return f"{_SYSTEM_PROMPT}\n\nFILE TREE:\n{tree_str}\n\nKEY FILES:{key_content}"


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that the LLM sometimes adds."""
    if "```" not in text:
        return text
    for block in text.split("```"):
        block = block.strip()
        if block.startswith("mermaid"):
            return block[len("mermaid"):].strip()
        if block.startswith("graph"):
            return block
    return text
