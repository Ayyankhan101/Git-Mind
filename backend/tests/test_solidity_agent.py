"""agents.solidity_agent: distinguishing "no Solidity in this repo" from
"Solidity present but the audit tooling failed".

Regression: when .sol files exist but the parser sidecar is unreachable and
the ML classifier isn't loaded, solidity_agent returned {"solidity_audit":
None} — the exact same value used for repos with zero .sol files. A repo
with real Solidity contracts would show "no Solidity components" in the UI,
identical to a repo that never had any.
"""

from unittest.mock import patch

import httpx
import pytest

from agents.solidity_agent import solidity_agent


class TestNoSolidityFiles:
    def test_none_when_repo_has_no_sol_files(self):
        result = solidity_agent({"file_tree": ["main.py"], "file_contents": {"main.py": "x = 1"}})
        assert result == {"solidity_audit": None}


class TestToolingUnavailable:
    def test_sidecar_down_and_no_ml_classifier_raises_not_none(self):
        state = {
            "file_tree": ["Token.sol"],
            "file_contents": {"Token.sol": "contract Token {}"},
        }
        with (
            patch("httpx.Client.post", side_effect=httpx.ConnectError("refused")),
            patch("agents.solidity_agent._get_ml_classifier", return_value=None),
            pytest.raises(RuntimeError, match="tooling unavailable"),
        ):
            solidity_agent(state)

    def test_ml_classifier_available_but_finds_nothing_is_genuinely_clean(self):
        """The ML layer DID run and found nothing — that's real signal, not
        a tooling failure, so this must stay a normal (not raised) result."""
        state = {
            "file_tree": ["Token.sol"],
            "file_contents": {"Token.sol": "contract Token {}"},
        }
        fake_clf = type("Clf", (), {"predict": lambda _self, _code: {"label": "safe", "severity": "low"}})()
        with (
            patch("httpx.Client.post", side_effect=httpx.ConnectError("refused")),
            patch("agents.solidity_agent._get_ml_classifier", return_value=fake_clf),
        ):
            result = solidity_agent(state)

        assert result == {"solidity_audit": None}
