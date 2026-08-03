import logging
import re
from collections import Counter
from pathlib import Path

import tiktoken

from agents.graph_builder import build_architecture_graph
from llm_cache import get_cached, invoke_with_retry, set_cached
from settings import LLM_MODEL, get_llm

logger = logging.getLogger(__name__)

_TOKEN_BUDGET = 24_000  # llama-3.3-70b supports 128K ctx — use more headroom
_MAX_TREE_LINES = 200
_MAX_KEY_FILES = 14
_MAX_SNIPPET_LEN = 1_600

_PRIORITY_KEYWORDS = [
    "main",
    "app",
    "index",
    "server",
    "routes",
    "router",
    "models",
    "config",
    "database",
    "db",
    "auth",
    "api",
    "service",
    "controller",
    "handler",
    "middleware",
    "schema",
    "store",
    "client",
    "gateway",
    "proxy",
    "pipeline",
]

_SYSTEM_PROMPT = """\
You are an expert software architect.
Analyze the codebase below and produce a Mermaid flowchart diagram.

STRICT RULES — any violation breaks the frontend renderer:
- Output ONLY valid Mermaid syntax. No explanation. No markdown fences.
- First line must be exactly: graph TD
- Node IDs must be descriptive camelCase names (e.g. frontend, backend, database) — NOT single letters like A, B, C
- Node labels: only letters, numbers, and spaces inside square brackets [Like This]
- NO parentheses inside labels — they crash the parser
- NO quotes inside labels
- Maximum 15 nodes — fewer clean nodes beats many messy ones
- Edge labels syntax: -->|short label|

CORRECT EXAMPLE:
graph TD
    frontend[React Frontend] -->|HTTP| backend[FastAPI Backend]
    backend -->|query| database[ChromaDB]
    backend -->|LLM| llm[OpenAI]\
"""


_EXT_TO_LANG = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "JavaScript/React",
    ".tsx": "TypeScript/React",
    ".java": "Java",
    ".go": "Go",
    ".rb": "Ruby",
    ".php": "PHP",
    ".rs": "Rust",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".swift": "Swift",
    ".kt": "Kotlin",
}


def _detect_primary_language(file_tree: list[str]) -> str:
    counts: Counter = Counter()
    for f in file_tree:
        ext = Path(f).suffix.lower()
        if ext in _EXT_TO_LANG:
            counts[ext] += 1
    if not counts:
        return "Unknown"
    return _EXT_TO_LANG[counts.most_common(1)[0][0]]


def run_architecture_agent(file_tree: list[str], file_contents: dict[str, str]) -> str:
    if not file_tree:
        return "graph TD\n    A[Empty Repository]"

    primary_lang = _detect_primary_language(file_tree)
    prompt = _build_prompt(file_tree, file_contents, primary_lang)

    cached = get_cached(f"{LLM_MODEL}:arch", prompt)
    if cached:
        logger.debug("Architecture agent: cache hit")
        return cached

    result = invoke_with_retry(_LLM, prompt).content.strip()
    result = _strip_fences(result)
    result = _sanitize_mermaid(result)

    if not result.startswith("graph"):
        logger.warning("Architecture agent: unexpected LLM output — using fallback diagram")
        result = "graph TD\n    A[Analysis Incomplete]"

    set_cached(f"{LLM_MODEL}:arch", prompt, result)
    return result


def run_with_graph(file_tree: list[str], file_contents: dict[str, str]) -> dict:
    """Run the architecture agent and return both the Mermaid diagram + rich JSON graph."""
    mermaid = run_architecture_agent(file_tree, file_contents)
    graph = build_architecture_graph(file_tree, file_contents)
    return {
        "architecture_diagram": mermaid,
        "architecture_graph": graph,
    }


# ── Private helpers ────────────────────────────────────────────────────────────

_ENC = tiktoken.get_encoding("cl100k_base")  # load once at import time
_LLM = get_llm(temperature=0)


def _build_prompt(file_tree: list[str], file_contents: dict[str, str], primary_lang: str = "Unknown") -> str:
    budget = _TOKEN_BUDGET
    tree_str = "\n".join(file_tree[:_MAX_TREE_LINES])
    budget -= len(_ENC.encode(tree_str, allowed_special="all"))

    # Priority files: those whose path contains domain keywords
    priority = [f for f in file_tree if any(kw in f.lower() for kw in _PRIORITY_KEYWORDS)][:_MAX_KEY_FILES]

    key_content = ""
    for fp in priority:
        if fp not in file_contents:
            continue
        snippet = file_contents[fp][:_MAX_SNIPPET_LEN]
        block = f"\n\n=== {fp} ===\n{snippet}"
        cost = len(_ENC.encode(block, allowed_special="all"))
        if budget - cost < 500:  # reserve 500 tokens for system prompt + output
            break
        key_content += block
        budget -= cost

    return f"{_SYSTEM_PROMPT}\n\nPRIMARY LANGUAGE: {primary_lang}\n\nFILE TREE:\n{tree_str}\n\nKEY FILES:{key_content}"


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that the LLM sometimes adds."""
    if "```" not in text:
        return text
    for block in text.split("```"):
        block = block.strip()
        if block.startswith("mermaid"):
            return block[len("mermaid") :].strip()
        if block.startswith("graph") or block.startswith("flowchart"):
            return block
    return text


def _sanitize_mermaid(diagram: str) -> str:
    """Fix common LLM mistakes that cause Mermaid v11 parse errors."""
    diagram = diagram.replace("\r\n", "\n").strip()

    # Accept flowchart TD as well — normalise to graph TD
    diagram = re.sub(r"^flowchart\s+", "graph ", diagram, flags=re.MULTILINE)

    # Drop directives Mermaid v11 is strict about
    diagram = re.sub(r"^\s*click\s+\S+.*$", "", diagram, flags=re.MULTILINE)
    diagram = re.sub(r"^\s*style\s+.*$", "", diagram, flags=re.MULTILINE)
    diagram = re.sub(r"^\s*classDef\s+.*$", "", diagram, flags=re.MULTILINE)
    diagram = re.sub(r"^\s*class\s+.*$", "", diagram, flags=re.MULTILINE)
    diagram = re.sub(r":::[\w-]+", "", diagram)

    def _clean_label(m: re.Match) -> str:
        content = m.group(1)
        content = re.sub(r"\(\s*\)", "", content)  # remove empty parens only
        content = re.sub(r'[<>&"\'#%\\]', "", content)  # strip chars that break parser
        content = content.replace("_", " ")
        content = re.sub(r"\s+", " ", content).strip()
        return f"[{content or 'Node'}]"

    diagram = re.sub(r"\[([^\]\[]+)\]", _clean_label, diagram)

    # Drop now-blank lines, keep at most one blank between any two lines
    lines = [line for line in diagram.splitlines() if line.strip()]
    return "\n".join(lines)
