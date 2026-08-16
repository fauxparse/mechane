import { describe, expect, it } from "vitest";

import { googleFontVariant, type GoogleFont } from "./google-fonts";

const font: GoogleFont = {
  family: "Example Sans",
  variants: ["regular", "italic", "500", "500italic", "700", "700italic"],
};

describe("googleFontVariant", () => {
  it("selects the requested regular, bold, italic, and bold italic variants", () => {
    expect(googleFontVariant(font, false, false)).toEqual({ weight: 400, italic: false });
    expect(googleFontVariant(font, true, false)).toEqual({ weight: 700, italic: false });
    expect(googleFontVariant(font, false, true)).toEqual({ weight: 400, italic: true });
    expect(googleFontVariant(font, true, true)).toEqual({ weight: 700, italic: true });
  });

  it("uses the nearest supported bold weight", () => {
    const limitedFont: GoogleFont = { family: "Limited Sans", variants: ["regular", "600"] };

    expect(googleFontVariant(limitedFont, true, false)).toEqual({ weight: 600, italic: false });
    expect(googleFontVariant(limitedFont, false, true)).toBeNull();
  });

  it("falls back to standard CSS weights for unknown fonts", () => {
    expect(googleFontVariant(undefined, true, true)).toEqual({ weight: 700, italic: true });
  });
});
