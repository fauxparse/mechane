import { describe, expect, it } from "vitest";

import { placeCanvasPosition } from "./canvas-placement";

describe("placeCanvasPosition", () => {
  it("keeps the preferred position when it does not overlap", () => {
    expect(placeCanvasPosition({ x: 800, y: 0 }, [{ x: 0, y: 0 }])).toEqual({ x: 800, y: 0 });
  });

  it("moves a new Canvas to the right of overlapping artboards", () => {
    expect(placeCanvasPosition({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual({ x: 760, y: 0 });
  });

  it("continues past multiple occupied positions", () => {
    expect(placeCanvasPosition({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 760, y: 0 }])).toEqual({
      x: 1520,
      y: 0,
    });
  });
});
