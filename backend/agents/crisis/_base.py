import time
import logging

from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

_MODEL = "llama-3.3-70b-versatile"

_LEAK_TRIGGER_WORDS = ["breach", "leaked", "exposed", "customers affected", "data exposed"]
_llm = ChatGroq(model=_MODEL, temperature=0.7)


def make_crisis_agent(name: str, system_prompt: str, leaks: bool = True):
    """
    Factory: returns a LangGraph node function for a crisis role-play agent.

    Each node consumes shared CrisisState:
      - selected_finding_id, security_findings: source of incident facts
      - crisis_messages: rolling transcript
      - crisis_turn: turn counter
      - public_signals: messages a Reporter could leak (filled when leaks=True)
    """

    def node(state: dict) -> dict:
        # Build conversation history (last 12 turns to bound prompt size)
        history_msgs = state.get("crisis_messages", [])[-12:]
        history = "\n".join(
            f"{m['agent']}: {m['content']}" for m in history_msgs
        ) or "No prior messages."

        # Find the active incident
        finding = next(
            (f for f in state.get("security_findings", [])
             if f.get("id") == state.get("selected_finding_id")),
            None,
        )
        if not finding and state.get("security_findings"):
            finding = state["security_findings"][0]
        finding = finding or {
            "title": "Unknown vulnerability",
            "severity": "high",
            "exploit_story": "Details pending engineering review.",
        }

        prompt = (
            f"{system_prompt}\n\n"
            f"INCIDENT: {finding.get('title','')} ({finding.get('severity','')})\n"
            f"EXPLOIT: {finding.get('exploit_story','')}\n\n"
            f"CONVERSATION SO FAR:\n{history}\n\n"
            f"Respond as {name} in 2-4 sentences. Do not break character."
        )

        try:
            text = _llm.invoke(prompt).content
        except Exception as exc:
            logger.error("crisis agent %s failed: %s", name, exc)
            text = f"[{name} unavailable — investigating]"

        ts = time.time()
        update: dict = {
            "crisis_messages": [{"agent": name, "content": text, "turn": state.get("crisis_turn", 0)}],
            "crisis_turn":     state.get("crisis_turn", 0) + 1,
            "events":          [{"agent": name, "kind": "message", "content": text, "ts": ts}],
        }

        # Leak heuristic — Engineering / CEO statements containing breach keywords
        # become public_signals the Reporter can pick up
        if leaks and any(k in text.lower() for k in _LEAK_TRIGGER_WORDS):
            update["public_signals"] = [text]

        logger.info("crisis agent %s spoke (turn %d)", name, state.get("crisis_turn", 0))
        return update

    return node
