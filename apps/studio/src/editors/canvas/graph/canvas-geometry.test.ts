import { describe, expect, it } from "vitest";

import { clientRect } from "./canvas-geometry";

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
});
