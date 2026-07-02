def crisis_router(state: dict) -> str:
    """
    Section 9.3 router: rotates CEO / Legal / Engineering for ~10 turns.
    Ends if reporter published, crisis resolved, or 10-turn cap reached.
    """
    if state.get("reporter_published") or state.get("crisis_resolved"):
        return "END"

    turn = state.get("crisis_turn", 0)
    if turn >= 10:
        return "END"

    # CEO every 3rd turn (turns 0, 3, 6, 9)
    if turn % 3 == 0:
        return "ceo"
    # Engineer on even non-CEO turns, Legal on odd
    return "engineer" if turn % 2 == 0 else "legal"
