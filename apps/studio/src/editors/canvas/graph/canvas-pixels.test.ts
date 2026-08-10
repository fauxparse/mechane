import { describe, expect, it } from "vitest";

import { roundToLogicalPixel } from "./canvas-pixels";

describe("Canvas pixel snapping", () => {
  it("rounds screen-space values to the nearest logical pixel", () => {
    expect(roundToLogicalPixel(12.49, 1)).toBe(12);
    expect(roundToLogicalPixel(12.5, 1)).toBe(13);
  });

  it("accounts for camera zoom before rounding", () => {
    expect(roundToLogicalPixel(20.9, 2)).toBe(10);
    expect(roundToLogicalPixel(21, 2)).toBe(11);
  });
});
