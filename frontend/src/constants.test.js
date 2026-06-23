import { LANG_COLOR } from "./constants";

test("has colors for common languages", () => {
  expect(LANG_COLOR["JavaScript"]).toBe("#f7df1e");
  expect(LANG_COLOR["Python"]).toBe("#3572A5");
  expect(LANG_COLOR["TypeScript"]).toBe("#3178c6");
});

test("all values are hex colors", () => {
  Object.values(LANG_COLOR).forEach((color) => {
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
