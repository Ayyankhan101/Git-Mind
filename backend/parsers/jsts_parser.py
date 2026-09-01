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
    re.compile(
        r'import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:,\s*\w+)*)\s+from\s+[\'"]([^\'"]+)[\'"]'
    ),
    re.compile(r'const\s+\w+\s*=\s*require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
    re.compile(r'let\s+\w+\s*=\s*require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
    re.compile(r'var\s+\w+\s*=\s*require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
    re.compile(r'from\s+[\'"]([^\'"]+)[\'"]\s+import'),
]

_EXPORT_PATTERNS = [
    re.compile(r"export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)"),
    re.compile(r"export\s+\{[^}]*(?:as\s+\w+)?\}"),
    re.compile(r"module\.exports\s*=\s*(\w+)"),
]

_COMPONENT_PATTERNS = [
    re.compile(r"(?:export\s+)?(?:default\s+)?function\s+(\w+)\s*(?:<\w+>)?\s*\("),
    re.compile(
        r"(?:export\s+)?(?:default\s+)?const\s+(\w+)\s*(?:<\w+>)?\s*=\s*(?:\([^)]*\)\s*=>|React\.memo\()"
    ),
    re.compile(
        r"(?:export\s+)?(?:default\s+)?class\s+(\w+)\s+extends\s+(?:React\.)?(?:Component|PureComponent)"
    ),
]

_ROUTE_PATTERNS = [
    re.compile(
        r'router\.(get|post|put|patch|delete|options)\s*\(\s*[\'"]([^\'"]+)[\'"]'
    ),
    re.compile(r'app\.(get|post|put|patch|delete|options)\s*\(\s*[\'"]([^\'"]+)[\'"]'),
    re.compile(r'@(?:Get|Post|Put|Patch|Delete|Options)\s*\(\s*[\'"]([^\'"]+)[\'"]'),
]

_NODE_TYPE_KEYWORDS = {
    "component": [
        "component",
        "view",
        "screen",
        "page",
        "modal",
        "form",
        "card",
        "list",
        "layout",
        "header",
        "footer",
        "sidebar",
        "container",
        "wrapper",
    ],
    "ui": [
        "ui",
        "button",
        "input",
        "select",
        "dropdown",
        "icon",
        "avatar",
        "badge",
        "tag",
        "table",
        "chart",
    ],
    "route": ["route", "router", "page", "screen"],
    "service": ["service", "api", "client", "provider", "store", "hook", "context"],
    "model": ["model", "type", "interface", "schema", "dto"],
    "config": ["config", "constant", "enum", "env", "settings"],
    "util": ["util", "helper", "lib", "utils", "common", "shared"],
    "middleware": ["middleware", "guard", "auth", "hoc"],
}

_TYPE_LAYERS = {
    "component": "frontend",
    "ui": "frontend",
    "route": "api",
    "service": "backend",
    "model": "backend",
    "config": "infrastructure",
    "util": "utilities",
    "middleware": "backend",
}

_ICON_MAP = {
    "component": "component",
    "ui": "layout-dashboard",
    "route": "route",
    "service": "cog",
    "model": "database",
    "config": "settings",
    "util": "wrench",
    "middleware": "shield-check",
}


def _detect_framework(source: str) -> str:
    if re.search(r'from\s+[\'"]react[\'"]', source) or re.search(
        r"import.*React", source
    ):
        return "React"
    if re.search(r'from\s+[\'"]express[\'"]', source) or re.search(
        r'require\s*\(\s*[\'"]express[\'"]', source
    ):
        return "Express"
    if re.search(r'from\s+[\'"]next[\'"]', source) or re.search(r"next/\w+", source):
        return "Next.js"
    if re.search(r'from\s+[\'"]vue[\'"]', source):
        return "Vue"
    if re.search(r'from\s+[\'"]@angular[\'"]', source):
        return "Angular"
    return "JavaScript/TypeScript"


def _build_smart_label_jsts(
    stem: str,
    file_path: str,
    components: list[str],
    endpoints: list[dict],
) -> str:
    """Build a specific, descriptive label from file content."""
    parts = []

    # 1. If there are React components, use the main component name
    if components:
        # Prefer named exports over default
        named = [c for c in components if c and not c.startswith("_")]
        if named:
            parts.append(_humanize_label(named[0]))
        else:
            parts.append(_humanize_label(stem))
    else:
        parts.append(_humanize_label(stem))

    # 2. Add context from parent directory
    path_parts = file_path.replace("\\", "/").split("/")
    if len(path_parts) >= 2:
        parent = path_parts[-2].lower()
        if (
            parent
            and parent != stem.lower()
            and parent not in ("src", "lib", "app", ".", "components", "pages")
        ):
            parent_label = _humanize_label(parent)
            if parent_label.lower() not in parts[0].lower():
                parts[0] = f"{parent_label} {parts[0]}"

    # 3. Add endpoint info for route files
    if endpoints:
        methods = set(e.get("method", "") for e in endpoints)
        paths = set(e.get("path", "") for e in endpoints)
        if paths:
            common_path = _find_common_prefix(paths)
            if common_path and common_path != "/":
                parts.append(f"({common_path})")
        elif methods:
            parts.append(f"({', '.join(sorted(methods))})")

    return " ".join(parts)


def _find_common_prefix(paths: set[str]) -> str:
    """Find the common prefix path among endpoint paths."""
    if not paths:
        return ""
    sorted_paths = sorted(paths)
    first = sorted_paths[0]
    last = sorted_paths[-1]
    i = 0
    while i < len(first) and i < len(last) and first[i] == last[i]:
        i += 1
    prefix = first[:i]
    if prefix and not prefix.endswith("/"):
        prefix = prefix.rsplit("/", 1)[0]
    return prefix if prefix else ""


def parse_jsts(file_path: str, source: str) -> dict | None:
    if not source or not source.strip():
        return None

    imports: list[dict] = []
    for pat in _IMPORT_PATTERNS:
        for m in pat.finditer(source):
            mod_path = m.group(1)
            # Take the last meaningful module name (skip relative parent dirs)
            parts = [
                p
                for p in mod_path.replace("\\", "/").split("/")
                if p and p != ".." and p != "."
            ]
            mod = parts[-1].split(".")[0] if parts else ""
            if mod and mod not in [i["source"] for i in imports]:
                imports.append({"source": mod, "name": mod, "kind": "module"})

    exports = []
    for pat in _EXPORT_PATTERNS:
        for m in pat.finditer(source):
            exports.append(m.group(1) if m.lastindex and m.group(1) else "default")

    components = []
    for pat in _COMPONENT_PATTERNS:
        for m in pat.finditer(source):
            components.append(m.group(1))

    # Determine if React component
    is_react = bool(components) or bool(re.search(r"jsx|tsx", file_path, re.I))

    endpoints = []
    for pat in _ROUTE_PATTERNS:
        for m in pat.finditer(source):
            method = m.group(1).upper() if m.lastindex and m.lastindex >= 1 else "GET"
            path = m.group(2) if m.lastindex and m.lastindex >= 2 else m.group(1)
            endpoints.append({"method": method, "path": str(path), "handler": ""})

    framework = _detect_framework(source)

    path = file_path.replace("\\", "/")
    stem = (
        path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        if "/" in path
        else path.rsplit(".", 1)[0]
    )
    label = _build_smart_label_jsts(stem, file_path, components, endpoints)

    # Determine node type
    if components:
        node_type = "component"
    elif endpoints:
        node_type = "route"
    else:
        node_type = "module"
        lower = stem.lower()
        for t, keywords in _NODE_TYPE_KEYWORDS.items():
            if any(k in lower for k in keywords):
                node_type = t
                break

        # Check parent directory name
        if node_type == "module":
            parent_dir = path.split("/")[-2] if "/" in path else ""
            for t, keywords in _NODE_TYPE_KEYWORDS.items():
                if any(k in parent_dir for k in keywords):
                    node_type = t
                    break

    # Re-classify if React component
    if is_react and node_type in ("module", "util"):
        node_type = "ui" if "ui" in stem.lower() else "component"

    layer = _TYPE_LAYERS.get(node_type, "frontend" if is_react else "backend")

    return {
        "label": label,
        "type": node_type,
        "layer": layer,
        "icon": _ICON_MAP.get(node_type, "file"),
        "language": (
            "JavaScript"
            if file_path.endswith((".js", ".jsx", ".mjs", ".cjs"))
            else "TypeScript"
        ),
        "framework": framework,
        "imports": imports,
        "exports": list(set(exports)),
        "endpoints": endpoints,
        "components": components,
        "file_path": path,
    }
