import { uiReducer, uiInitialState } from "./uiReducer";

describe("uiReducer shareError", () => {
  it("stores a share error", () => {
    const next = uiReducer(uiInitialState, {
      type: "SET_SHARE_ERROR",
      error: { kind: "locked", message: "Needs token" },
    });
    expect(next.shareError).toEqual({ kind: "locked", message: "Needs token" });
  });
  it("clears on CLEAR_SHARE_ERROR / null", () => {
    const seeded = {
      ...uiInitialState,
      shareError: { kind: "network", message: "x" },
    };
    expect(uiReducer(seeded, { type: "CLEAR_SHARE_ERROR" }).shareError).toBeNull();
    expect(
      uiReducer(seeded, { type: "SET_SHARE_ERROR", error: null }).shareError,
    ).toBeNull();
  });
});
