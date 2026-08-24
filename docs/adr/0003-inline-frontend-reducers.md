# ADR-0003: Inline frontend reducers

`appReducer.js` uses `combineReducers` then immediately flattens the result back for backward compatibility. The slicing/flattening code is nearly as long as the reducers themselves — a shallow wrapper.

Inline all reducers into a single flat `appReducer.js`. Delete the custom `combineReducers.js` utility (dead code). Less churn across 35+ components than migrating to nested state.

**Consequences:** State shape defined in one place. Remove ~40 lines of slicing code. `combineReducers.js` deleted; git history preserves if needed.
