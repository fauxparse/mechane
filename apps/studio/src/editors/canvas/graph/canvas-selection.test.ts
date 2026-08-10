import { describe, expect, it } from "vitest";

import {
  containedSelection,
  normalizeSelection,
  rectContainsRect,
  rectsOverlap,
  toggleSelection,
} from "./canvas-selection";

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  right: x + width,
  bottom: y + height,
});

describe("Canvas selection", () => {
  it("uses full containment for rubberband selection", () => {
    expect(
      containedSelection(
        [
          { id: "inside", rect: rect(10, 10, 20, 20) },
          { id: "partial", rect: rect(25, 25, 30, 30) },
        ],
        rect(0, 0, 40, 40),
      ),
    ).toEqual(["inside"]);
    expect(rectContainsRect(rect(0, 0, 40, 40), rect(25, 25, 30, 30))).toBe(false);
  });

  it("finds the artboard a band reaches into, even when it started outside", () => {
    expect(rectsOverlap(rect(0, 0, 40, 40), rect(30, 30, 40, 40))).toBe(true);
    expect(rectsOverlap(rect(0, 0, 40, 40), rect(60, 60, 10, 10))).toBe(false);
  });

  it("keeps additive selection in one artboard and toggles an existing target", () => {
    expect(toggleSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a", true)).toEqual(["b"]);
    expect(normalizeSelection({ artId: null, elementIds: ["a"] })).toEqual({
      artId: null,
      elementIds: [],
    });
  });
});
