from services.rate_limiter import rate_ok, _rate_data, _rate_lock


def setup_method():
    _rate_data.clear()


def test_allows_within_limit():
    assert rate_ok("chat", "test_key") is True
    assert rate_ok("chat", "test_key") is True


def test_blocks_over_limit():
    for _ in range(20):
        assert rate_ok("chat", "blocked_key") is True
    assert rate_ok("chat", "blocked_key") is False


def test_different_keys_independent():
    for _ in range(20):
        rate_ok("chat", "key_a")
    assert rate_ok("chat", "key_a") is False
    assert rate_ok("chat", "key_b") is True


def test_different_endpoints_independent():
    for _ in range(5):
        rate_ok("summary", "shared_key")
    assert rate_ok("summary", "shared_key") is False
    assert rate_ok("chat", "shared_key") is True


def test_analyze_limit():
    for _ in range(3):
        assert rate_ok("analyze", "analyze_key") is True
    assert rate_ok("analyze", "analyze_key") is False


def test_pr_impact_limit():
    for _ in range(3):
        assert rate_ok("pr_impact", "impact_key") is True
    assert rate_ok("pr_impact", "impact_key") is False


def test_fix_limit():
    for _ in range(10):
        assert rate_ok("fix", "fix_key") is True
    assert rate_ok("fix", "fix_key") is False


def test_unknown_endpoint_defaults():
    for _ in range(20):
        assert rate_ok("unknown_endpoint", "some_key") is True
    assert rate_ok("unknown_endpoint", "some_key") is False
