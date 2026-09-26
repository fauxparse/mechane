import { describe, expect, it } from "vitest";

import { isLightColor, parseHexColor } from "./color-utils";

const light = (hex: string) => {
  const color = parseHexColor(hex);
  if (!color) throw new Error(`Unparseable ${hex}`);
  return isLightColor(color);
};

describe("isLightColor", () => {
  it("marks a color light where black contrasts more than white", () => {
    // Luminance 0.185 and 0.175: either side of the 0.179 crossover.
    expect(light("#777777")).toBe(true);
    expect(light("#747474")).toBe(false);
  });

  it("weighs channels by luminance, so pure red reads light and pure blue dark", () => {
    expect(light("#ff0000")).toBe(true);
    expect(light("#0000ff")).toBe(false);
  });
});
