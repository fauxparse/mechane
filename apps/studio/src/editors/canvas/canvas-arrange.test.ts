import { describe, expect, it } from "vitest";

import type { FrameElement } from "@mechane/domain";

import { arrangeIntentFor, arrangeWithinParent, inStackingOrder } from "./canvas-arrange";

const frame = (...ids: string[]): FrameElement => ({
  id: "parent",
  type: "frame",
  children: ids.map((id, index) => ({ id, type: "rect", rank: String.fromCharCode(97 + index) })),
});

/** The order the Elements end up in, which is what a caller actually cares about. */
const orderAfter = (parent: FrameElement, selected: string[], intent: Parameters<typeof arrangeWithinParent>[2]) => {
  const moves = arrangeWithinParent(parent, selected, intent);
  const ranks = new Map(moves.map((move) => [move.elementId, move.rank]));
  return inStackingOrder(
    (parent.children ?? []).map((child) => ({ ...child, rank: ranks.get(child.id) ?? child.rank })),
  ).map((child) => child.id);
};

describe("Canvas arrange bindings", () => {
  it("uses Figma's brackets: bare goes all the way, the command key goes one step", () => {
    expect(arrangeIntentFor({ key: "]" })).toBe("bring-to-front");
    expect(arrangeIntentFor({ key: "[" })).toBe("send-to-back");
    expect(arrangeIntentFor({ key: "]", metaKey: true })).toBe("bring-forward");
    expect(arrangeIntentFor({ key: "[", metaKey: true })).toBe("send-backward");
    expect(arrangeIntentFor({ key: "]", ctrlKey: true })).toBe("bring-forward");
  });

  it("claims nothing else", () => {
    expect(arrangeIntentFor({ key: "a" })).toBeNull();
    expect(arrangeIntentFor({ key: "]", shiftKey: true })).toBeNull();
    expect(arrangeIntentFor({ key: "]", altKey: true })).toBeNull();
    // Both modifiers is not "the command key".
    expect(arrangeIntentFor({ key: "]", metaKey: true, ctrlKey: true })).toBe("bring-to-front");
  });
});

describe("Canvas arrange within a parent", () => {
  it("moves one Element a single step, or all the way", () => {
    expect(orderAfter(frame("a", "b", "c", "d"), ["a"], "bring-forward")).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(orderAfter(frame("a", "b", "c", "d"), ["a"], "bring-to-front")).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    expect(orderAfter(frame("a", "b", "c", "d"), ["d"], "send-backward")).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
    expect(orderAfter(frame("a", "b", "c", "d"), ["d"], "send-to-back")).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps a multi-selection together and in order", () => {
    expect(orderAfter(frame("a", "b", "c", "d"), ["a", "b"], "bring-to-front")).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
    expect(orderAfter(frame("a", "b", "c", "d"), ["c", "d"], "send-to-back")).toEqual([
      "c",
      "d",
      "a",
      "b",
    ]);
  });

  it("closes a split selection up rather than stepping past a sibling", () => {
    expect(orderAfter(frame("a", "b", "c", "d"), ["a", "c"], "bring-forward")).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("does nothing when the selection is already where it would go", () => {
    expect(arrangeWithinParent(frame("a", "b", "c"), ["c"], "bring-to-front")).toEqual([]);
    expect(arrangeWithinParent(frame("a", "b", "c"), ["c"], "bring-forward")).toEqual([]);
    expect(arrangeWithinParent(frame("a", "b", "c"), ["a"], "send-to-back")).toEqual([]);
    expect(arrangeWithinParent(frame("a", "b", "c"), ["a"], "send-backward")).toEqual([]);
  });

  it("does nothing when everything is selected, or nothing is", () => {
    expect(arrangeWithinParent(frame("a", "b"), ["a", "b"], "bring-to-front")).toEqual([]);
    expect(arrangeWithinParent(frame("a", "b"), [], "bring-to-front")).toEqual([]);
    expect(arrangeWithinParent(frame(), ["a"], "bring-to-front")).toEqual([]);
  });

  it("only reports the Elements whose rank actually changes", () => {
    const moves = arrangeWithinParent(frame("a", "b", "c", "d"), ["a"], "bring-to-front");
    expect(moves.map((move) => move.elementId)).toEqual(["a"]);
    expect(moves[0]!.parentId).toBe("parent");
  });

  it("reads stacking order as ascending rank, so the last sibling is on top", () => {
    expect(inStackingOrder(frame("a", "b", "c").children!).map((child) => child.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
