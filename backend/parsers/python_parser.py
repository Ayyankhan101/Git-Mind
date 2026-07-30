import ast
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


_FASTAPI_DECORATORS = {
    "app.get",
    "app.post",
    "app.put",
    "app.patch",
    "app.delete",
    "router.get",
    "router.post",
    "router.put",
    "router.patch",
    "router.delete",
    "api_router.get",
    "api_router.post",
    "api_router.put",
    "api_router.patch",
    "api_router.delete",
}


def _extract_imports(tree: ast.AST) -> list[dict]:
    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(
                    {
                        "source": alias.name.split(".")[0] if alias.name else "",
                        "name": alias.asname or alias.name,
                        "kind": "direct",
                    }
                )
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                # Take the top-level package name (skip relative dots)
                parts = [p for p in module.replace("\\", "/").split(".") if p and p != ".." and p != "."]
                source = parts[0] if parts else ""
                imports.append(
                    {
                        "source": source,
                        "name": alias.asname or alias.name,
                        "kind": "from",
                    }
                )
    return imports


def _extract_classes(tree: ast.AST) -> list[dict]:
    classes = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            bases = []
            for base in node.bases:
                if isinstance(base, ast.Name):
                    bases.append(base.id)
                elif isinstance(base, ast.Attribute):
                    bases.append(base.attr)
            classes.append(
                {
                    "name": node.name,
                    "bases": bases,
                    "methods": [m.name for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))],
                    "lineno": node.lineno,
                }
            )
    return classes


def _extract_functions(tree: ast.AST) -> list[dict]:
    fns = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            fns.append(
                {
                    "name": node.name,
                    "decorators": [d.id for d in node.decorator_list if isinstance(d, ast.Name)],
                    "lineno": node.lineno,
                }
            )
    return fns


def _extract_endpoints(tree: ast.AST, _source: str) -> list[dict]:
    endpoints = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Call):
                    func = decorator.func
                    if isinstance(func, ast.Attribute):
                        call_expr = f"{_resolve_attr(func)}.{func.attr}"
                        if call_expr in _FASTAPI_DECORATORS:
                            method = func.attr.upper()
                            args = [
                                ast.literal_eval(a) for a in decorator.args if isinstance(a, (ast.Constant, ast.Str))
                            ]
                            path = args[0] if args else "/"
                            endpoints.append(
                                {
                                    "method": method,
                                    "path": str(path),
                                    "handler": node.name,
                                }
                            )
    return endpoints


def _resolve_attr(node: ast.expr) -> str:
    parts = []
    current = node
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        parts.append(current.id)
    return ".".join(reversed(parts))


_NODE_TYPE_KEYWORDS = {
    "controller": ["controller", "handler", "auth", "oauth"],
    "service": ["service", "manager", "provider"],
    "model": ["model", "schema", "entity"],
    "route": ["route", "router", "endpoint", "api"],
    "config": ["config", "settings", "env"],
    "middleware": ["middleware", "guard", "interceptor"],
    "db": ["database", "db", "repository", "dao"],
    "util": ["util", "helper", "utility"],
}


def _classify_node(name: str, file_path: str, classes: list[dict], endpoints: list) -> tuple[str, str]:
    lower = name.lower()
    path_lower = file_path.lower()

    # If file has API endpoints, it's a route
    if endpoints:
        return "route", "api"

    for type_name, keywords in _NODE_TYPE_KEYWORDS.items():
        if any(k in lower for k in keywords):
            return type_name, _TYPE_LAYERS.get(type_name, "backend")

    # Check parent directory name
    parent_dir = path_lower.split("/")[-2] if "/" in path_lower else ""
    for type_name, keywords in _NODE_TYPE_KEYWORDS.items():
        if any(k in parent_dir for k in keywords):
            return type_name, _TYPE_LAYERS.get(type_name, "backend")

    # Check class bases
    for cls in classes:
        for base in cls["bases"]:
            bl = base.lower()
            if "model" in bl:
                return "model", "backend"
            if "service" in bl:
                return "service", "backend"
            if "route" in bl or "router" in bl:
                return "route", "backend"
    return "module", "backend"


def _build_smart_label(
    stem: str,
    file_path: str,
    classes: list[dict],
    fns: list[dict],
    endpoints: list[dict],
) -> str:
    """Build a specific, descriptive label from file content instead of just filename."""
    parts = []

    # 1. If there are classes, use the main class name (not filename)
    if classes:
        # Prefer classes that aren't private and aren't just base classes
        public_classes = [c for c in classes if not c["name"].startswith("_")]
        if public_classes:
            main_class = public_classes[0]["name"]
            parts.append(_humanize_label(main_class))
        else:
            parts.append(_humanize_label(stem))
    else:
        parts.append(_humanize_label(stem))

    # 2. Add context from parent directory if it adds specificity
    path_parts = file_path.replace("\\", "/").split("/")
    if len(path_parts) >= 2:
        parent = path_parts[-2].lower()
        # Only add parent if it's not the same as the stem
        if parent and parent != stem.lower() and parent not in ("src", "lib", "app", "."):
            parent_label = _humanize_label(parent)
            # Avoid duplication (e.g., "Auth Auth Middleware" → "Auth Middleware")
            if parent_label.lower() not in parts[0].lower():
                parts[0] = f"{parent_label} {parts[0]}"

    # 3. Add endpoint info for route files
    if endpoints:
        methods = set(e.get("method", "") for e in endpoints)
        paths = set(e.get("path", "") for e in endpoints)
        if paths:
            # Show the common prefix path
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
    # Trim to last / boundary
    if prefix and not prefix.endswith("/"):
        prefix = prefix.rsplit("/", 1)[0]
    return prefix if prefix else ""


_TYPE_LAYERS = {
    "ui": "frontend",
    "component": "frontend",
    "route": "api",
    "controller": "backend",
    "service": "backend",
    "model": "backend",
    "middleware": "backend",
    "config": "infrastructure",
    "db": "database",
    "util": "utilities",
    "module": "backend",
}

_ICON_MAP = {
    "ui": "layout-dashboard",
    "component": "component",
    "route": "route",
    "controller": "shield",
    "service": "cog",
    "model": "database",
    "middleware": "shield-check",
    "config": "settings",
    "db": "database",
    "util": "wrench",
    "module": "package",
}


def _detect_framework(classes: list[dict], fns: list[dict]) -> str:
    for cls in classes:
        for base in cls["bases"]:
            if base in ("FastAPI", "APIRouter"):
                return "FastAPI"
            if base in ("Flask", "Blueprint"):
                return "Flask"
            if base in ("django.db.models.Model",):
                return "Django"
    for fn in fns:
        for dec in fn["decorators"]:
            if dec in ("app", "router"):
                return "FastAPI"
    return "Python"


def parse_python(file_path: str, source: str) -> dict | None:
    if not source or not source.strip():
        return None
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None

    imports = _extract_imports(tree)
    classes = _extract_classes(tree)
    fns = _extract_functions(tree)
    endpoints = _extract_endpoints(tree, source)
    framework = _detect_framework(classes, fns)

    # Build smart label from file content (class names, endpoints, context)
    path = file_path.replace("\\", "/")
    stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0] if "/" in path else path.rsplit(".", 1)[0]
    label = _build_smart_label(stem, file_path, classes, fns, endpoints)

    node_type, layer = _classify_node(stem, file_path, classes, endpoints)

    return {
        "label": label,
        "type": node_type,
        "layer": layer,
        "icon": _ICON_MAP.get(node_type, "file"),
        "language": "Python",
        "framework": framework,
        "imports": imports,
        "exports": [c["name"] for c in classes] + [f["name"] for f in fns if not f["name"].startswith("_")],
        "endpoints": endpoints,
        "classes": classes,
        "functions": fns,
        "file_path": path,
    }
