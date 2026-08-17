import { describe, expect, it } from "vitest";

import { opacityInputValue, sizingForMode, variableInput } from "./canvas-inspector-values";

describe("canvas inspector values", () => {
  it("keeps an absent opacity value unset instead of converting it to NaN", () => {
    const value = opacityInputValue(variableInput(undefined, "number", []));

    expect(value).toBeNull();
  });

  it("uses the current rendered dimension when changing hug to fixed", () => {
    expect(sizingForMode({ mode: "hug", value: 120 }, "fixed", 248)).toEqual({
      mode: "fixed",
      value: 248,
    });
  });
});
