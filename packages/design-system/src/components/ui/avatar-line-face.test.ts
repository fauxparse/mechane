import { describe, expect, it } from "vitest";

import fixture from "./avatar-line-face.fixture.json" with { type: "json" };
import { lineFaceSvg } from "./avatar-line-face";

// The fixture holds SVGs rendered by @dicebear/core@10.5.0 before it was
// removed, with its generator comment and <metadata> stripped. Users' avatars
// are seeded from their ids, so any difference here changes someone's face.
describe("lineFaceSvg", () => {
  const backgroundColors = fixture.backgroundColor.map((hex) => `#${hex}`);

  it.each(fixture.avatars)("matches DiceBear for seed $seed", ({ seed, svg }) => {
    expect(lineFaceSvg(seed, backgroundColors)).toBe(svg);
  });
});
