"""Tests for agents.graph_analyzer — build_graph, _make_node_id, _resolve_dependency."""

from agents.graph_analyzer import _make_node_id, _resolve_dependency, build_graph


class TestMakeNodeId:
    def test_simple_path(self):
        assert _make_node_id("src/App.tsx") == "src_app"

    def test_deep_path(self):
        assert _make_node_id("backend/routes/auth.py") == "backend_routes_auth"

    def test_single_segment(self):
        assert _make_node_id("index.js") == "index"

    def test_nested_deep(self):
        assert _make_node_id("a/b/c/d/e.py") == "c_d_e"


class TestResolveDependency:
    def setup_method(self):
        self.node_map = {
            "src_app": {"id": "src_app", "label": "App"},
            "services_auth": {"id": "services_auth", "label": "Auth Service"},
        }

    def test_exact_match(self):
        assert _resolve_dependency("src_app", self.node_map) == "src_app"

    def test_label_match(self):
        assert _resolve_dependency("Auth Service", self.node_map) == "services_auth"

    def test_no_match(self):
        assert _resolve_dependency("unknown", self.node_map) is None

    def test_fuzzy_match(self):
        assert _resolve_dependency("services_auth", self.node_map) == "services_auth"


class TestBuildGraph:
    def test_empty_input(self):
        result = build_graph({})
        assert result == {"nodes": [], "edges": []}

    def test_single_node(self):
        parsed = {
            "src/App.tsx": {
                "label": "App",
                "type": "ui",
                "layer": "frontend",
                "imports": [],
                "exports": ["App"],
                "endpoints": [],
            }
        }
        result = build_graph(parsed)
        assert len(result["nodes"]) == 1
        assert result["nodes"][0]["label"] == "App"
        assert result["nodes"][0]["type"] == "ui"
        assert len(result["edges"]) == 0

    def test_imports_create_edges(self):
        parsed = {
            "src/App.tsx": {
                "label": "App",
                "type": "ui",
                "layer": "frontend",
                "imports": [{"source": "auth", "name": "auth", "kind": "direct"}],
                "exports": [],
                "endpoints": [],
            },
            "src/auth.py": {
                "label": "Auth",
                "type": "service",
                "layer": "backend",
                "imports": [],
                "exports": ["auth"],
                "endpoints": [],
            },
        }
        result = build_graph(parsed)
        assert len(result["nodes"]) == 2
        assert len(result["edges"]) == 1
        assert result["edges"][0]["relationship"] == "imports"

    def test_importance_ranking(self):
        parsed = {
            "main.py": {
                "label": "Main",
                "type": "module",
                "layer": "backend",
                "imports": [{"source": "a"}, {"source": "b"}, {"source": "c"}],
                "exports": ["main"],
                "endpoints": [{"method": "GET", "path": "/"}],
            },
            "helper.py": {
                "label": "Helper",
                "type": "util",
                "layer": "backend",
                "imports": [],
                "exports": [],
                "endpoints": [],
            },
        }
        result = build_graph(parsed)
        main_node = next(n for n in result["nodes"] if n["label"] == "Main")
        helper_node = next(n for n in result["nodes"] if n["label"] == "Helper")
        assert main_node["importance"] == "primary"
        assert helper_node["importance"] == "tertiary"
