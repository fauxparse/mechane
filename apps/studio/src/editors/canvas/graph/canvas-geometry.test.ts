import { describe, expect, it } from "vitest";

import { clientRect, selectedCanvasRects } from "./canvas-geometry";

describe("Canvas geometry", () => {
  it("normalizes browser rectangles for screen-space overlays", () => {
    expect(clientRect({ x: 12, y: 24, width: 80, height: 40 })).toEqual({
      x: 12,
      y: 24,
      width: 80,
      height: 40,
      right: 92,
      bottom: 64,
    });
  });

  it("uses the artboard bounds when the Canvas root is selected", () => {
    const artboard = clientRect({ x: 10, y: 20, width: 320, height: 180 });
    const root = clientRect({ x: 10, y: 20, width: 280, height: 160 });
    expect(
      selectedCanvasRects(
        { rect: artboard, elements: new Map([["root", root]]), rootElementId: "root" },
        ["root"],
      ),
    ).toEqual([artboard]);
  });
});
