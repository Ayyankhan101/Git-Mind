export const fixInitialState = {
  fixLoading: null,
  fixResult: null,
  crisisFinding: null,
};

export function fixReducer(state, action) {
  switch (action.type) {
    case "SET_FIX_LOADING":
      return { ...state, fixLoading: action.id };
    case "SET_FIX_RESULT":
      return { ...state, fixResult: action.result };
    case "SET_CRISIS_FINDING":
      return { ...state, crisisFinding: action.finding };
    default:
      return state;
  }
}
