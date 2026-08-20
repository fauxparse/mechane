import { describe, expect, it } from "vitest";

import {
  opacityInputValue,
  sizeConstraintKey,
  sizeValueNumber,
  sizeValueUnit,
  sizingForMode,
  variableInput,
} from "./canvas-inspector-values";

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

  it("maps each axis and constraint to its sizing key", () => {
    expect(sizeConstraintKey("width", "min")).toBe("minWidth");
    expect(sizeConstraintKey("height", "max")).toBe("maxHeight");
  });

  it("unwraps constraint values in both plain and united forms", () => {
    expect(sizeValueNumber(120)).toBe(120);
    expect(sizeValueNumber({ value: 50, unit: "%" })).toBe(50);
    expect(sizeValueNumber(undefined)).toBeNull();
    expect(sizeValueUnit({ value: 50, unit: "%" })).toBe("%");
    expect(sizeValueUnit(120)).toBe("px");
  });
});
