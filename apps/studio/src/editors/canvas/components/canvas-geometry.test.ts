import { describe, expect, it } from "vitest";

import { clientRect, contentOrigin, logicalRootSize, selectedCanvasRects } from "./canvas-geometry";

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
  it("normalizes root bounds with the zoom used for measurement", () => {
    expect(logicalRootSize(clientRect({ x: 0, y: 0, width: 840, height: 300 }), 2)).toEqual({
      width: 420,
      height: 150,
    });
  });

  it("moves anchor coordinates from the bordered parent content edge", () => {
    expect(contentOrigin({ x: 100, y: 200 }, 10, 10, 1)).toEqual({ x: 110, y: 210 });
    expect(contentOrigin({ x: 100, y: 200 }, 10, 10, 2)).toEqual({ x: 120, y: 220 });
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
