import { describe, expect, it } from "vitest";

import { canvasKeyboardIntent, nudgeAnchor } from "./canvas-keyboard";

describe("Canvas keyboard editing", () => {
  it("nudges absolute anchors with larger Shift steps", () => {
    expect(canvasKeyboardIntent("horizontal", "ArrowRight", false, false)).toEqual({
      type: "nudge",
      dx: 1,
      dy: 0,
    });
    expect(canvasKeyboardIntent("horizontal", "ArrowDown", true, false)).toEqual({
      type: "nudge",
      dx: 0,
      dy: 10,
    });
    expect(
      nudgeAnchor({ horizontal: "right", vertical: "bottom", offsetX: 20, offsetY: 30 }, 4, 6),
    ).toEqual({
      horizontal: "right",
      vertical: "bottom",
      offsetX: 16,
      offsetY: 24,
    });
  });

  it("maps primary arrows to reorder and cross-axis arrows to alignment", () => {
    expect(canvasKeyboardIntent("horizontal", "ArrowLeft", false, true)).toMatchObject({
      type: "primary-reorder",
      delta: -1,
    });
    expect(canvasKeyboardIntent("vertical", "ArrowDown", true, true)).toMatchObject({
      type: "primary-reorder",
      delta: "end",
    });
    expect(canvasKeyboardIntent("horizontal", "ArrowDown", true, true)).toEqual({
      type: "cross-align",
      value: "end",
    });
  });
});
