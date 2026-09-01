"""Tests for state.py initial_state and PUBLIC_FIELDS."""

from state import _DEFAULTS, _INTERNAL_FIELDS, PUBLIC_FIELDS, initial_state


class TestInitialState:
    """initial_state must create correct defaults."""

    def test_initial_state_has_repo_url(self):
        """initial_state sets repo_url."""
        result = initial_state("https://github.com/test/repo")
        assert result["repo_url"] == "https://github.com/test/repo"

    def test_initial_state_has_default_gh_token(self):
        """initial_state sets gh_token to None by default."""
        result = initial_state("https://github.com/test/repo")
        assert result["gh_token"] is None

    def test_initial_state_with_gh_token(self):
        """initial_state accepts gh_token parameter."""
        result = initial_state("https://github.com/test/repo", gh_token="token123")
        assert result["gh_token"] == "token123"

    def test_initial_state_has_all_defaults(self):
        """initial_state includes all fields from _DEFAULTS."""
        result = initial_state("https://github.com/test/repo")
        for key in _DEFAULTS:
            assert key in result, f"Missing key: {key}"

    def test_initial_state_file_tree_empty(self):
        """initial_state sets file_tree to empty list."""
        result = initial_state("https://github.com/test/repo")
        assert result["file_tree"] == []

    def test_initial_state_file_contents_empty(self):
        """initial_state sets file_contents to empty dict."""
        result = initial_state("https://github.com/test/repo")
        assert result["file_contents"] == {}

    def test_initial_state_events_empty(self):
        """initial_state sets events to empty list."""
        result = initial_state("https://github.com/test/repo")
        assert result["events"] == []


class TestPublicFields:
    """PUBLIC_FIELDS must be derived from _DEFAULTS minus _INTERNAL_FIELDS."""

    def test_public_fields_excludes_internal(self):
        """PUBLIC_FIELDS does not contain internal fields."""
        for field in _INTERNAL_FIELDS:
            assert (
                field not in PUBLIC_FIELDS
            ), f"Internal field {field} in PUBLIC_FIELDS"

    def test_public_fields_includes_key_fields(self):
        """PUBLIC_FIELDS includes important public fields from RepoState."""
        assert "repo_name" in PUBLIC_FIELDS
        assert "architecture_diagram" in PUBLIC_FIELDS
        assert "security_findings" in PUBLIC_FIELDS
        assert "api_docs" in PUBLIC_FIELDS

    def test_public_fields_is_tuple(self):
        """PUBLIC_FIELDS is a tuple (immutable)."""
        assert isinstance(PUBLIC_FIELDS, tuple)

    def test_public_fields_matches_defaults(self):
        """PUBLIC_FIELDS is a subset of _DEFAULTS keys."""
        for field in PUBLIC_FIELDS:
            assert field in _DEFAULTS, f"PUBLIC_FIELDS has {field} not in _DEFAULTS"
