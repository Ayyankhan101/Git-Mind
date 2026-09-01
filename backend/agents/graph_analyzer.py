import structlog

logger = structlog.get_logger(__name__)

_EDGE_RELATIONSHIP_MAP = {
    "solid": ["imports", "extends", "implements", "inherits", "composes"],
    "dashed": ["calls", "triggers", "dispatches", "publishes"],
    "dotted": ["emits", "notifies", "subscribes"],
    "animated": ["streams", "websocket", "realtime"],
}


def _detect_edge_kind(relationship: str) -> str:
    rl = relationship.lower()
    for kind, keywords in _EDGE_RELATIONSHIP_MAP.items():
        if any(k in rl for k in keywords):
            return kind
    for kind, keywords in _EDGE_RELATIONSHIP_MAP.items():
        if rl in keywords:
            return kind
    return "dashed"


def build_graph(parsed_files: dict[str, dict]) -> dict:
    nodes = []
    edges = []
    node_map = {}

    # ── Build nodes from parsed files ──
    for file_path, info in parsed_files.items():
        if not info:
            continue

        node_id = _make_node_id(file_path)
        layer_rank = _layer_to_rank(info.get("layer", "backend"))

        node = {
            "id": node_id,
            "label": info["label"],
            "type": info.get("type", "module"),
            "layer": info.get("layer", "backend"),
            "layer_rank": layer_rank,
            "icon": info.get("icon", "file"),
            "language": info.get("language", "Unknown"),
            "framework": info.get("framework", ""),
            "endpoints": info.get("endpoints", []),
            "imports": [
                i["source"] for i in info.get("imports", []) if i.get("source")
            ],
            "exports": info.get("exports", []),
            "file_path": file_path,
        }
        nodes.append(node)
        node_map[node_id] = node

    # ── Build edges from import relationships ──
    edge_set = set()
    for node in nodes:
        for dep_name in node.get("imports", []):
            # Try to resolve the dep name to an existing node
            target_id = _resolve_dependency(dep_name, node_map)
            if target_id and target_id != node["id"]:
                edge_key = f"{node['id']}->{target_id}"
                if edge_key not in edge_set:
                    edge_set.add(edge_key)
                    edges.append(
                        {
                            "source": node["id"],
                            "target": target_id,
                            "relationship": "imports",
                            "kind": "solid",
                        }
                    )

    # ── Rank nodes (primary = most imports/exports/endpoints) ──
    if nodes:
        max_score = (
            max(
                len(n.get("imports", []))
                + len(n.get("exports", []))
                + len(n.get("endpoints", [])) * 2
                for n in nodes
            )
            or 1
        )
        for node in nodes:
            score = (
                len(node["imports"]) + len(node["exports"]) + len(node["endpoints"]) * 2
            )
            ratio = score / max_score
            if ratio > 0.6:
                node["importance"] = "primary"
            elif ratio > 0.25:
                node["importance"] = "secondary"
            else:
                node["importance"] = "tertiary"

    return {"nodes": nodes, "edges": edges}


def _make_node_id(file_path: str) -> str:
    path = file_path.replace("\\", "/")
    parts = path.split("/")
    # Use up to 2 context levels for disambiguation
    relevant = parts[-(min(3, len(parts))) :]
    candidate = (
        "_".join(relevant).rsplit(".", 1)[0]
        if "." in relevant[-1]
        else "_".join(relevant)
    )
    return candidate.lower().replace(" ", "_")


def _resolve_dependency(name: str, node_map: dict[str, dict]) -> str | None:
    if name in node_map:
        return name
    # Try fuzzy match: match against label or id
    lower = name.lower().replace("_", "").replace("-", "")
    for nid, node in node_map.items():
        nid_clean = nid.lower().replace("_", "").replace("-", "")
        label_clean = node.get("label", "").lower().replace("_", "").replace("-", "")
        if lower in (nid_clean, label_clean):
            return nid
        if lower in nid_clean or lower in label_clean:
            return nid
    return None


def _layer_to_rank(layer: str) -> int:
    order = ["frontend", "api", "backend", "database", "infrastructure", "utilities"]
    try:
        return order.index(layer)
    except ValueError:
        return 99
