import { describe, expect, it } from "vitest";

import { opacityInputValue, variableInput } from "./canvas-inspector-values";

describe("canvas inspector values", () => {
  it("keeps an absent opacity value unset instead of converting it to NaN", () => {
    const value = opacityInputValue(variableInput(undefined, "number", []));

    expect(value).toBeNull();
  });
});
