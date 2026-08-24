"""Tests for agent_types validation."""

from agent_types import validate_agent_output, ArchitectureOutput, ApiDocOutput, SecurityOutput


class TestValidateAgentOutput:
    """validate_agent_output must check TypedDict keys."""

    def test_valid_architecture_output(self):
        """Valid architecture output passes validation."""
        result = {
            "architecture_diagram": "graph TD",
            "architecture_graph": {"nodes": [], "edges": []},
        }
        output = validate_agent_output("architecture", result)
        assert output == result

    def test_valid_api_docs_output(self):
        """Valid api_docs output passes validation."""
        result = {"api_docs": [{"path": "/users", "method": "GET"}]}
        output = validate_agent_output("api_docs", result)
        assert output == result

    def test_valid_security_output(self):
        """Valid security output passes validation."""
        result = {"security_findings": [{"severity": "high", "rule": "test"}]}
        output = validate_agent_output("security", result)
        assert output == result

    def test_missing_key_raises_error(self):
        """Missing required key raises ValueError."""
        result = {"architecture_diagram": "graph TD"}  # missing architecture_graph
        try:
            validate_agent_output("architecture", result)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "missing keys" in str(e)
            assert "architecture_graph" in str(e)

    def test_extra_key_raises_error(self):
        """Extra unexpected key raises ValueError."""
        result = {
            "architecture_diagram": "graph TD",
            "architecture_graph": {"nodes": [], "edges": []},
            "extra_field": "unexpected",
        }
        try:
            validate_agent_output("architecture", result)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "unexpected keys" in str(e)
            assert "extra_field" in str(e)

    def test_events_key_allowed(self):
        """events key is allowed even if not in TypedDict."""
        result = {
            "architecture_diagram": "graph TD",
            "architecture_graph": {"nodes": [], "edges": []},
            "events": [{"agent": "architecture", "status": "done"}],
        }
        output = validate_agent_output("architecture", result)
        assert output == result

    def test_unknown_agent_skips_validation(self):
        """Unknown agent name skips validation."""
        result = {"any": "thing"}
        output = validate_agent_output("unknown_agent", result)
        assert output == result

    def test_scanner_agent_skips_validation(self):
        """Scanner agent skips validation (no TypedDict)."""
        result = {"local_path": "/tmp", "file_tree": []}
        output = validate_agent_output("scanner", result)
        assert output == result
