import { describe, expect, it } from "vitest";

import { fixedFillSizing, showsReparentPreview } from "./canvas-creation";

describe("fixedFillSizing", () => {
  it("converts both fill axes to measured fixed dimensions", () => {
    expect(
      fixedFillSizing(
        {
          id: "child",
          type: "rect",
          layout: { width: { mode: "fill" }, height: { mode: "fill" } },
          fill: "red",
        },
        240,
        80,
      ),
    ).toEqual({
      layout: {
        width: { mode: "fixed", value: 240 },
        height: { mode: "fixed", value: 80 },
      },
    });
  });

  it("updates top-level fill sizing without changing fixed axes", () => {
    expect(
      fixedFillSizing(
        {
          id: "child",
          type: "rect",
          width: { mode: "fill" },
          height: { mode: "fixed", value: 40 },
        },
        240,
        80,
      ),
    ).toEqual({ width: { mode: "fixed", value: 240 } });
  });
});

describe("showsReparentPreview", () => {
  it("does not highlight an absolute Element's existing parent", () => {
    expect(showsReparentPreview("parent", "a", false, "parent", false, "a")).toBe(false);
  });

  it("still highlights a new parent or an auto-layout reorder", () => {
    expect(showsReparentPreview("source", "a", false, "target", false, "a")).toBe(true);
    expect(showsReparentPreview("parent", "a", true, "parent", true, "b")).toBe(true);
  });
});
