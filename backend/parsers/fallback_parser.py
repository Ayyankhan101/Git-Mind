import re

_IMPORT_PATTERNS = [
    re.compile(r"^\s*import\s+(\S+)", re.MULTILINE),
    re.compile(r"^\s*use\s+(\S+)", re.MULTILINE),
    re.compile(r'require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
    re.compile(r'include\s+[\'"]([^\'"]+)[\'"]'),
]

_FN_PATTERN = re.compile(r"(?:func|fn|def|function|sub)\s+(\w+)")

_CLASS_PATTERN = re.compile(r"(?:class|type|struct|impl)\s+(\w+)")

_LANG_EXT = {
    ".go": "Go",
    ".rs": "Rust",
    ".rb": "Ruby",
    ".php": "PHP",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".h": "C",
}

_NODE_TYPE_KEYWORDS = {
    "service": ["service", "manager", "provider"],
    "model": ["model", "entity", "struct", "type"],
    "controller": ["controller", "handler"],
    "route": ["route", "router", "api"],
    "config": ["config", "env"],
    "db": ["db", "repo", "store", "database"],
}


def parse_fallback(file_path: str, source: str) -> dict | None:
    if not source or not source.strip():
        return None

    ext = "." + file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""

    imports: list[dict] = []
    for pat in _IMPORT_PATTERNS:
        for m in pat.finditer(source):
            mod_path = m.group(1)
            parts = [p for p in mod_path.replace("\\", "/").split("/") if p and p != ".." and p != "."]
            mod = parts[-1].split(".")[0] if parts else ""
            if mod and mod not in [i["source"] for i in imports]:
                imports.append({"source": mod, "name": mod, "kind": "module"})

    exports = [m.group(1) for m in _FN_PATTERN.finditer(source)]

    path = file_path.replace("\\", "/")
    stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0] if "/" in path else path.rsplit(".", 1)[0]
    label = stem.replace("_", " ").replace("-", " ").title()

    node_type = "module"
    lower = stem.lower()
    for t, keywords in _NODE_TYPE_KEYWORDS.items():
        if any(k in lower for k in keywords):
            node_type = t
            break

    type_layers = {
        "service": "backend",
        "model": "backend",
        "controller": "backend",
        "route": "api",
        "config": "infrastructure",
        "db": "database",
    }

    icon_map = {
        "service": "cog",
        "model": "database",
        "controller": "shield",
        "route": "route",
        "config": "settings",
        "db": "database",
    }

    return {
        "label": label,
        "type": node_type,
        "layer": type_layers.get(node_type, "backend"),
        "icon": icon_map.get(node_type, "file"),
        "language": _LANG_EXT.get(ext, "Unknown"),
        "framework": "",
        "imports": imports,
        "exports": list(set(exports)),
        "endpoints": [],
        "file_path": path,
    }
