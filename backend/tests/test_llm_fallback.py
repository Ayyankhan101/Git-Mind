"""get_llm() wires a same-provider fallback model via LangChain's
with_fallbacks(), so a deprecated/rate-limited LLM_MODEL doesn't take every
agent down with it. No network calls here — just checking the Runnable is
actually wired up.
"""

import importlib

from core import settings


def test_fallback_wired_by_default():
    llm = settings.get_llm(temperature_key="chat")
    assert hasattr(llm, "fallbacks"), "expected a RunnableWithFallbacks — default LLM_MODEL_FALLBACK is set"
    assert len(llm.fallbacks) == 1


def test_fallback_uses_the_configured_model(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL", "primary-model")
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "secondary-model")
    llm = settings.get_llm(temperature_key="chat")
    assert llm.runnable.model_name == "primary-model"
    assert llm.fallbacks[0].model_name == "secondary-model"


def test_no_fallback_wrapping_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "")
    llm = settings.get_llm(temperature_key="chat")
    assert not hasattr(llm, "fallbacks")


def test_no_fallback_wrapping_when_same_as_primary(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL", "same-model")
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "same-model")
    llm = settings.get_llm(temperature_key="chat")
    assert not hasattr(llm, "fallbacks")


def test_json_mode_applies_to_both_primary_and_fallback(monkeypatch):
    monkeypatch.setattr(settings, "LLM_MODEL", "primary-model")
    monkeypatch.setattr(settings, "LLM_MODEL_FALLBACK", "secondary-model")
    llm = settings.get_llm(temperature_key="security", json_mode=True)
    # json_mode routes through ChatGroq.bind(...), which wraps in a RunnableBinding
    assert llm.runnable.kwargs.get("response_format") == {"type": "json_object"}
    assert llm.fallbacks[0].kwargs.get("response_format") == {"type": "json_object"}


def test_default_fallback_env_var_reads_module_default():
    """The fallback must be set and must not be the primary.

    Deliberately does NOT pin the literal model name. The previous version of
    this test asserted == "llama-3.1-8b-instant" and stayed green for the entire
    time that model was returning 404 model_not_found in production — it was
    asserting a constant equals itself, never that the model was usable. Live
    reachability is checked by scripts/smoke_test.py, which actually calls it.
    """
    importlib.reload(settings)
    assert settings.LLM_MODEL_FALLBACK, "a fallback model must be configured"
    assert settings.LLM_MODEL_FALLBACK != settings.LLM_MODEL, "falling back to the primary model is not a fallback"


class TestCheapTier:
    """get_dspy_lm(cheap=True) — high-volume, low-judgment agents (api_doc,
    language_audit) route to LLM_MODEL_CHEAP instead of the flagship model."""

    def test_cheap_tier_is_configured_and_not_the_flagship(self):
        """The cheap tier exists and is genuinely a different model.

        Does not assert LLM_MODEL_CHEAP == LLM_MODEL_FALLBACK. They name the
        same model today, but they are separate settings on purpose: chaining
        the cheap default off the fallback meant retuning one silently retuned
        which model every api_doc and language_audit call went to.
        """
        assert settings.LLM_MODEL_CHEAP, "a cheap-tier model must be configured"
        assert settings.LLM_MODEL_CHEAP != settings.LLM_MODEL

    def test_cheap_is_independently_overridable(self, monkeypatch):
        monkeypatch.setenv("LLM_MODEL_CHEAP", "only-cheap-changed")
        monkeypatch.delenv("LLM_MODEL_FALLBACK", raising=False)
        importlib.reload(settings)
        try:
            assert settings.LLM_MODEL_CHEAP == "only-cheap-changed"
            assert settings.LLM_MODEL_FALLBACK != "only-cheap-changed"
        finally:
            monkeypatch.undo()
            importlib.reload(settings)

    def test_cheap_true_uses_cheap_model(self, monkeypatch):
        monkeypatch.setattr(settings, "LLM_MODEL", "flagship-model")
        monkeypatch.setattr(settings, "LLM_MODEL_CHEAP", "cheap-model")
        lm = settings.get_dspy_lm(temperature=0, cheap=True)
        assert lm.model == "groq/cheap-model"

    def test_cheap_false_uses_flagship_model(self, monkeypatch):
        monkeypatch.setattr(settings, "LLM_MODEL", "flagship-model")
        monkeypatch.setattr(settings, "LLM_MODEL_CHEAP", "cheap-model")
        lm = settings.get_dspy_lm(temperature=0, cheap=False)
        assert lm.model == "groq/flagship-model"

    def test_cheap_defaults_to_false(self, monkeypatch):
        """Callers that don't pass cheap= must not silently downgrade."""
        monkeypatch.setattr(settings, "LLM_MODEL", "flagship-model")
        monkeypatch.setattr(settings, "LLM_MODEL_CHEAP", "cheap-model")
        lm = settings.get_dspy_lm(temperature=0)
        assert lm.model == "groq/flagship-model"


class TestCheapTierAssignment:
    """Only the two agents this was scoped for actually use the cheap tier —
    everything security-critical or user-facing-quality-critical must not."""

    def test_api_doc_uses_cheap_tier(self):
        import agents.api_doc as api_doc

        assert api_doc._LM.model == f"groq/{settings.LLM_MODEL_CHEAP}"

    def test_language_audit_uses_cheap_tier(self):
        import agents.language_audit as language_audit

        assert language_audit._LM.model == f"groq/{settings.LLM_MODEL_CHEAP}"

    def test_security_stays_on_flagship_model(self):
        import agents.security as security

        assert security._LM.model == f"groq/{settings.LLM_MODEL}"

    def test_pr_review_stays_on_flagship_model(self):
        import agents.pr_review as pr_review

        assert pr_review._LM.model == f"groq/{settings.LLM_MODEL}"

    def test_solidity_agent_stays_on_flagship_model(self):
        import agents.solidity_agent as solidity_agent

        assert solidity_agent._LM.model == f"groq/{settings.LLM_MODEL}"

    def test_architecture_stays_on_flagship_model(self):
        import agents.architecture as architecture

        assert architecture._LM.model == f"groq/{settings.LLM_MODEL}"
