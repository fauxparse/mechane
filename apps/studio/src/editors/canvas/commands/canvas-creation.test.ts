import { describe, expect, it } from "vitest";

import {
  canvasForCreation,
  creationPreviewShape,
  creationRect,
  fixedFillSizing,
  rankForInsertion,
  showsReparentPreview,
} from "./canvas-creation";

describe("fixedFillSizing", () => {
  it("converts both fill axes to measured fixed dimensions", () => {
    expect(
      fixedFillSizing(
        {
          id: "child",
          type: "rect",
          sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
          fill: "red",
        },
        240,
        80,
      ),
    ).toEqual({
      sizing: {
        width: { mode: "fixed", value: 240 },
        height: { mode: "fixed", value: 80 },
      },
    });
  });

  it("updates one fill axis without changing the fixed axis", () => {
    expect(
      fixedFillSizing(
        {
          id: "child",
          type: "rect",
          sizing: { width: { mode: "fill" }, height: { mode: "fixed", value: 40 } },
        },
        240,
        80,
      ),
    ).toEqual({
      sizing: {
        width: { mode: "fixed", value: 240 },
        height: { mode: "fixed", value: 40 },
      },
    });
  });
});

describe("rankForInsertion", () => {
  it("finds a strict rank between recursively generated tilde ranks", () => {
    const rank = rankForInsertion(["a", "a~", "a~~"], 2);
    expect(rank).toBe("a~!");
    expect("a~".localeCompare(rank)).toBeLessThan(0);
    expect(rank.localeCompare("a~~")).toBeLessThan(0);
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

describe("creationPreviewShape", () => {
  it("uses an ellipse for ellipse-tool previews", () => {
    expect(
      creationPreviewShape("ellipse", {
        x: 10,
        y: 20,
        width: 80,
        height: 40,
      }),
    ).toEqual({ type: "ellipse", cx: 50, cy: 40, rx: 40, ry: 20 });
  });

  it("keeps other creation tools rectangular", () => {
    expect(
      creationPreviewShape("rect", {
        x: 10,
        y: 20,
        width: 80,
        height: 40,
      }),
    ).toEqual({ type: "rect", x: 10, y: 20, width: 80, height: 40 });
  });
});

describe("canvasForCreation", () => {
  const targets = [
    { id: "left", rect: { x: 0, y: 0, width: 100, height: 100, right: 100, bottom: 100 } },
    { id: "right", rect: { x: 120, y: 0, width: 100, height: 100, right: 220, bottom: 100 } },
  ];

  it("returns the only Canvas intersected by the draft", () => {
    expect(
      canvasForCreation(
        targets,
        {
          x: 80,
          y: 20,
          width: 30,
          height: 30,
          right: 110,
          bottom: 50,
        },
        { x: 105, y: 35 },
      ),
    ).toBe("left");
  });

  it("uses the release point when a draft intersects multiple Canvases", () => {
    expect(
      canvasForCreation(
        targets,
        {
          x: 80,
          y: 20,
          width: 70,
          height: 30,
          right: 150,
          bottom: 50,
        },
        { x: 135, y: 35 },
      ),
    ).toBe("right");
  });

  it("falls back to the closest intersected Canvas", () => {
    expect(
      canvasForCreation(
        targets,
        {
          x: 80,
          y: 20,
          width: 70,
          height: 30,
          right: 150,
          bottom: 50,
        },
        { x: 110, y: 35 },
      ),
    ).toBe("left");
  });

  it("returns null when the draft misses every Canvas", () => {
    expect(
      canvasForCreation(
        targets,
        {
          x: 300,
          y: 20,
          width: 30,
          height: 30,
          right: 330,
          bottom: 50,
        },
        { x: 315, y: 35 },
      ),
    ).toBeNull();
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
