import { describe, expect, it } from "vitest";

import { canvasKeyboardIntent, canvasToolFor, nudgeAnchor } from "./canvas-keyboard";

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

describe("Canvas tool shortcuts", () => {
  const chord = (key: string, overrides: Partial<KeyboardEvent> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  });

  it("selects each tool from its bare shortcut", () => {
    expect(canvasToolFor(chord("r"), { inKeyConsumingWidget: false })).toBe("rect");
    expect(canvasToolFor(chord("o"), { inKeyConsumingWidget: false })).toBe("ellipse");
    expect(canvasToolFor(chord("f"), { inKeyConsumingWidget: false })).toBe("frame");
    expect(canvasToolFor(chord("i"), { inKeyConsumingWidget: false })).toBe("image");
    expect(canvasToolFor(chord("v"), { inKeyConsumingWidget: false })).toBe("select");
    expect(canvasToolFor(chord("t"), { inKeyConsumingWidget: false })).toBe("text");
    expect(canvasToolFor(chord("b"), { inKeyConsumingWidget: false })).toBe("block");
  });

  it("leaves modified keys and focused controls to their owners", () => {
    expect(
      canvasToolFor(chord("r", { shiftKey: true }), { inKeyConsumingWidget: false }),
    ).toBeNull();
    expect(canvasToolFor(chord("r"), { inKeyConsumingWidget: true })).toBeNull();
  });
});
