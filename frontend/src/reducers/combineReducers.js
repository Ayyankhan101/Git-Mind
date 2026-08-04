/**
 * Combine multiple reducers into a single reducer.
 * Each reducer manages its own slice of state.
 */
export function combineReducers(reducerMap) {
  const keys = Object.keys(reducerMap);

  return function combinedReducer(state, action) {
    let hasChanged = false;
    const nextState = {};

    for (const key of keys) {
      const reducer = reducerMap[key];
      const previousStateForKey = state[key];
      const nextStateForKey = reducer(previousStateForKey, action);
      nextState[key] = nextStateForKey;
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey;
    }

    return hasChanged ? nextState : state;
  };
}
