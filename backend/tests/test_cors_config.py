"""CORS_ORIGINS=* must be rejected outright in production.

Previously this only logged a warning and allowed every origin — one
misconfigured env var away from an open API. _resolve_cors_origins is a
pure function (module-level CORS setup calls it once at import) so this is
testable without reimporting main.py, which has app-startup side effects.
"""

import pytest

from main import _resolve_cors_origins


def test_wildcard_raises_in_production():
    with pytest.raises(RuntimeError, match="production"):
        _resolve_cors_origins("*", "production")


def test_wildcard_allowed_outside_production():
    assert _resolve_cors_origins("*", "development") == ["*"]


def test_explicit_origins_are_split_and_trimmed():
    origins = _resolve_cors_origins("https://a.example.com, https://b.example.com", "production")
    assert origins == ["https://a.example.com", "https://b.example.com"]


def test_defaults_to_prod_origin_list_when_unset_in_production():
    origins = _resolve_cors_origins("", "production")
    assert origins == ["https://gitmind-frontend.pages.dev"]


def test_defaults_to_dev_origin_list_when_unset_outside_production():
    origins = _resolve_cors_origins("", "development")
    assert "http://localhost:3000" in origins
