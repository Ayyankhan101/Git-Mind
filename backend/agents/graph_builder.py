import json
import structlog

from agents.graph_analyzer import build_graph
from parsers.router import parse_files

logger = structlog.get_logger(__name__)


def build_architecture_graph(_file_tree: list[str], file_contents: dict[str, str]) -> dict:
    """
    Parse all source files and build a rich architecture graph JSON.
    Returns a dict with 'nodes' and 'edges' ready for React Flow.
    """
    if not file_contents:
        return {"nodes": [], "edges": []}

    logger.info("Parsing %d files for architecture graph", len(file_contents))
    parsed = parse_files(file_contents)
    logger.info("Successfully parsed %d files", len(parsed))

    graph = build_graph(parsed)
    logger.info("Graph: %d nodes, %d edges", len(graph["nodes"]), len(graph["edges"]))

    return graph


def format_graph_json(graph: dict) -> str:
    """Return the graph as a JSON string for embedding."""
    return json.dumps(graph, default=str)
