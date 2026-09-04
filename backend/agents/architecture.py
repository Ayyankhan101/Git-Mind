import re
from collections import Counter
from pathlib import Path

import structlog
import tiktoken

from agents.graph_builder import build_architecture_graph
from dspy_setup import dspy
from llm_cache import run_dspy_cached
from optimization.registry import define_program
from settings import LLM_MODEL, get_dspy_lm

logger = structlog.get_logger(__name__)

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
- Maximum 20 nodes — show module structure, not every file
- Group related files into modules (e.g. routes, agents, services)
- Edge labels syntax: -->|short label|

CORRECT EXAMPLE:
graph TD
    frontend[React Frontend] -->|HTTP| backend[FastAPI Backend]
    backend -->|query| database[ChromaDB]
    backend -->|LLM| llm[Groq API]
    backend --> sub1[Routes Layer]
    backend --> sub2[Agents Layer]
    sub1 --> auth[Auth]
    sub1 --> fix[Fix]
    sub2 --> security[Security Agent]
    sub2 --> architecture[Architecture Agent]\
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

    try:
        result = run_dspy_cached(
            _predictor,
            f"{LLM_MODEL}:arch",
            lm=_LM,
            output_field="diagram",
            context=prompt,
        )
    except Exception as exc:
        logger.warning("Architecture agent: LLM failed — %s; using file-tree fallback", exc)
        result = _fallback_mermaid(file_tree, primary_lang)

    result = _strip_fences(result)
    result = _sanitize_mermaid(result)

    if not result.startswith("graph"):
        logger.warning("Architecture agent: unexpected LLM output — using file-tree fallback")
        result = _fallback_mermaid(file_tree, primary_lang)

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
_LM = get_dspy_lm(temperature=0)


class ArchitectureSignature(dspy.Signature):
    """You are an expert software architect. Produce a Mermaid flowchart diagram of the codebase.

    STRICT RULES — any violation breaks the frontend renderer:
    - Output ONLY valid Mermaid syntax. No explanation. No markdown fences.
    - First line must be exactly: graph TD
    - Node IDs must be descriptive camelCase names (e.g. frontend, backend, database) — NOT single letters like A, B, C
    - Node labels: only letters, numbers, and spaces inside square brackets [Like This]
    - NO parentheses inside labels — they crash the parser
    - NO quotes inside labels
    - Maximum 20 nodes — show module structure, not every file
    - Group related files into modules (e.g. routes, agents, services)
    - Edge labels syntax: -->|short label|"""

    context: str = dspy.InputField(desc="Primary language, file tree, and key file contents")
    diagram: str = dspy.OutputField(desc="Mermaid flowchart diagram whose first line is exactly 'graph TD'")


_predictor = define_program(
    "architecture",
    ArchitectureSignature,
    output_field="diagram",
    input_fields=("context",),
    output_model=None,  # plain Mermaid string — structural checks are string-level
)


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


def _fallback_mermaid(file_tree: list[str], primary_lang: str = "Unknown") -> str:
    """Generate a Mermaid diagram from the file tree when the LLM fails.

    Groups files up to 3 levels deep (top-dir/sub-dir/file) and creates nodes + edges.
    Caps total nodes at ~30 to keep diagrams readable.
    """
    from collections import defaultdict

    # Build 3-level tree: top -> sub -> files
    tree: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for f in file_tree:
        parts = f.strip("/").split("/")
        if len(parts) >= 3:
            top, sub = parts[0], parts[1]
            tree[top][sub].append(f)
        elif len(parts) == 2:
            tree[parts[0]]["_files"].append(f)
        else:
            tree["root"]["_files"].append(f)

    if not tree:
        return "graph TD\n    A[Repository]"

    # Flatten to nodes: top-level dirs, sub-dirs with >= 2 files, merge tiny subs
    lines = ["graph TD"]
    node_ids = []
    max_nodes = 30

    dir_labels = {
        "src": "Source", "lib": "Library", "app": "Application",
        "server": "Server", "client": "Client", "api": "API",
        "routes": "Routes", "models": "Models", "views": "Views",
        "templates": "Templates", "static": "Static", "tests": "Tests",
        "test": "Tests", "config": "Config", "scripts": "Scripts",
        "docs": "Docs", "root": primary_lang,
        "agents": "Agents", "services": "Services", "parsers": "Parsers",
        "components": "Components", "utils": "Utils", "hooks": "Hooks",
    }

    def _sanitize_id(name: str) -> str:
        return name.lower().replace(" ", "_").replace("-", "_").replace(".", "_")

    for top in sorted(tree.keys()):
        subs = tree[top]
        top_id = _sanitize_id(top)
        top_label = dir_labels.get(top, top.title())

        # If few subs, just show top-level node with file count
        total_files = sum(len(fs) for fs in subs.values())
        if len(subs) <= 1 or total_files <= 3:
            lines.append(f"    {top_id}[{top_label} ({total_files} files)]")
            node_ids.append(top_id)
            continue

        # Multiple subs: create top node + sub nodes
        lines.append(f"    {top_id}[{top_label}]")
        node_ids.append(top_id)

        for sub in sorted(subs.keys()):
            if len(node_ids) >= max_nodes:
                break
            files = subs[sub]
            sub_id = f"{top_id}_{_sanitize_id(sub)}"
            sub_label = f"{len(files)} files" if sub == "_files" else sub.replace("_", " ").title()
            lines.append(f"    {sub_id}[{sub_label} ({len(files)} files)]")
            lines.append(f"    {top_id} --> {sub_id}")
            node_ids.append(sub_id)

        if len(node_ids) >= max_nodes:
            break

    # Add edges between top-level dirs (root -> others)
    root_id = None
    other_ids = []
    for nid in node_ids:
        # Only connect top-level nodes (no underscores = top level)
        if "_" not in nid:
            if nid == "root":
                root_id = nid
            else:
                other_ids.append(nid)

    if root_id and other_ids:
        for nid in other_ids[:8]:
            lines.append(f"    {root_id} --> {nid}")
    elif len([n for n in node_ids if "_" not in n]) >= 2:
        tops = [n for n in node_ids if "_" not in n]
        for i in range(len(tops) - 1):
            lines.append(f"    {tops[i]} --> {tops[i + 1]}")

    return "\n".join(lines)


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
