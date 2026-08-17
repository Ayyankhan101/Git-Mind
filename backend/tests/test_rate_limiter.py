from services.rate_limiter import _mem_data, _mem_rate_check


def setup_method():
    _mem_data.clear()


def test_allows_within_limit():
    allowed, _, _ = _mem_rate_check("chat", "test_key")
    assert allowed is True
    allowed, _, _ = _mem_rate_check("chat", "test_key")
    assert allowed is True


def test_blocks_over_limit():
    for _ in range(20):
        _mem_rate_check("chat", "blocked_key")
    allowed, _, _ = _mem_rate_check("chat", "blocked_key")
    assert allowed is False


def test_different_keys_independent():
    for _ in range(20):
        _mem_rate_check("chat", "key_a")
    allowed_a, _, _ = _mem_rate_check("chat", "key_a")
    assert allowed_a is False
    allowed_b, _, _ = _mem_rate_check("chat", "key_b")
    assert allowed_b is True


def test_different_endpoints_independent():
    for _ in range(5):
        _mem_rate_check("summary", "shared_key")
    allowed_s, _, _ = _mem_rate_check("summary", "shared_key")
    assert allowed_s is False
    allowed_c, _, _ = _mem_rate_check("chat", "shared_key")
    assert allowed_c is True


def test_analyze_limit():
    for _ in range(2):
        allowed, _, _ = _mem_rate_check("analyze", "analyze_key")
        assert allowed is True
    allowed, _, _ = _mem_rate_check("analyze", "analyze_key")
    assert allowed is False


def test_pr_impact_limit():
    for _ in range(3):
        allowed, _, _ = _mem_rate_check("pr_impact", "impact_key")
        assert allowed is True
    allowed, _, _ = _mem_rate_check("pr_impact", "impact_key")
    assert allowed is False


def test_fix_limit():
    for _ in range(10):
        allowed, _, _ = _mem_rate_check("fix", "fix_key")
        assert allowed is True
    allowed, _, _ = _mem_rate_check("fix", "fix_key")
    assert allowed is False


def test_unknown_endpoint_defaults():
    for _ in range(20):
        allowed, _, _ = _mem_rate_check("unknown_endpoint", "some_key")
        assert allowed is True
    allowed, _, _ = _mem_rate_check("unknown_endpoint", "some_key")
    assert allowed is False
