import { describe, expect, it } from "vitest";

import { creationRect, fixedFillSizing, showsReparentPreview } from "./canvas-creation";

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

describe("creationRect", () => {
  it("constrains the box to a square in every drag direction", () => {
    expect(creationRect({ x: 10, y: 20 }, { x: 70, y: 50 }, true)).toEqual({
      x: 10,
      y: 20,
      width: 60,
      height: 60,
      right: 70,
      bottom: 80,
    });
    expect(creationRect({ x: 70, y: 50 }, { x: 10, y: 20 }, true)).toEqual({
      x: 10,
      y: -10,
      width: 60,
      height: 60,
      right: 70,
      bottom: 50,
    });
  });

  it("keeps independent dimensions when square mode is disabled", () => {
    expect(creationRect({ x: 10, y: 20 }, { x: 70, y: 50 })).toEqual({
      x: 10,
      y: 20,
      width: 60,
      height: 30,
      right: 70,
      bottom: 50,
    });
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
