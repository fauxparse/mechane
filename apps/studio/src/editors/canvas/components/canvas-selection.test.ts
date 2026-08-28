import { describe, expect, it } from "vitest";

import {
  authoredSelectionBoundary,
  containedSelection,
  normalizeSelection,
  rangeSelection,
  rectContainsRect,
  rectsOverlap,
  selectionBoundary,
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

  it("selects the nearest Slot for rendered Block descendants", () => {
    type Node = { id: string; type: string; parent: Node | null };
    const artboard: Node = { id: "artboard", type: "artboard", parent: null };
    const firstSlot: Node = { id: "slot-first", type: "slot", parent: artboard };
    const firstRoot: Node = { id: "block-root", type: "frame", parent: firstSlot };
    const firstLabel: Node = { id: "label", type: "text", parent: firstRoot };
    const secondSlot: Node = { id: "slot-second", type: "slot", parent: artboard };
    const secondRoot: Node = { id: "block-root", type: "frame", parent: secondSlot };
    const secondLabel: Node = { id: "label", type: "text", parent: secondRoot };
    const parentOf = (node: Node) => node.parent;
    const typeOf = (node: Node) => node.type;

    expect(selectionBoundary(firstLabel, artboard, parentOf, typeOf)).toBe(firstSlot);
    expect(selectionBoundary(secondLabel, artboard, parentOf, typeOf)).toBe(secondSlot);
  });
  it("skips rendered nested Slots that are not authored by the Canvas", () => {
    type Node = { id: string; type: string; parent: Node | null };
    const artboard: Node = { id: "artboard", type: "artboard", parent: null };
    const outerSlot: Node = { id: "outer-slot", type: "slot", parent: artboard };
    const blockRoot: Node = { id: "block-root", type: "frame", parent: outerSlot };
    const innerSlot: Node = { id: "inner-slot", type: "slot", parent: blockRoot };

    expect(
      authoredSelectionBoundary(
        innerSlot,
        artboard,
        (node) => node.parent,
        (node) => node.id === "outer-slot",
      ),
    ).toBe(outerSlot);
  });

  it("keeps Block descendants selectable outside a Slot", () => {
    type Node = { id: string; type: string; parent: Node | null };
    const artboard: Node = { id: "artboard", type: "artboard", parent: null };
    const blockRoot: Node = { id: "block-root", type: "frame", parent: artboard };
    const label: Node = { id: "label", type: "text", parent: blockRoot };

    expect(
      selectionBoundary(
        label,
        artboard,
        (node) => node.parent,
        (node) => node.type,
      ),
    ).toBe(label);
  });

  it("selects the inclusive visible range in either direction", () => {
    expect(rangeSelection(["a", "b", "c", "d"], "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeSelection(["a", "b", "c", "d"], "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("falls back to the target when the range anchor is not visible", () => {
    expect(rangeSelection(["a", "b"], "missing", "b")).toEqual(["b"]);
  });
});
