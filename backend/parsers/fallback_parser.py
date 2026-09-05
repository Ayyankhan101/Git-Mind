import re


def _humanize_label(name: str) -> str:
    name = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)
    name = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", name)
    name = name.replace("_", " ").replace("-", " ")
    words = name.split()
    result = []
    for w in words:
        if w.isupper() and len(w) > 1:
            result.append(w)
        else:
            result.append(w[0].upper() + w[1:])
    return " ".join(result)


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
    ".kts": "Kotlin",
    ".swift": "Swift",
    ".cs": "C#",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".hpp": "C++",
    ".hxx": "C++",
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

    # Extract classes for smarter labeling
    classes = [m.group(1) for m in _CLASS_PATTERN.finditer(source)]

    path = file_path.replace("\\", "/")
    stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0] if "/" in path else path.rsplit(".", 1)[0]

    # Build smart label: prefer class name, then filename
    if classes:
        public_classes = [c for c in classes if not c.startswith("_")]
        label = _humanize_label(public_classes[0]) if public_classes else _humanize_label(stem)
    else:
        label = _humanize_label(stem)

    # Add parent directory context
    path_parts = path.split("/")
    if len(path_parts) >= 2:
        parent = path_parts[-2].lower()
        if parent and parent != stem.lower() and parent not in ("src", "lib", "app", "."):
            parent_label = _humanize_label(parent)
            if parent_label.lower() not in label.lower():
                label = f"{parent_label} {label}"

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
