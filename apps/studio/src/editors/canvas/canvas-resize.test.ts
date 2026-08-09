import { describe, expect, it } from "vitest";

import type { Element } from "@mechane/domain";

import {
  handleCursor,
  handlePosition,
  isCornerHandle,
  lockedAspectRatio,
  resizeBox,
} from "./canvas-resize";

const start = { x: 100, y: 200, width: 80, height: 40 };

describe("Canvas resize handles", () => {
  it("separates corners from edges", () => {
    expect(isCornerHandle("se")).toBe(true);
    expect(isCornerHandle("s")).toBe(false);
  });

  it("places handles around the selection box", () => {
    expect(handlePosition("nw")).toEqual({ x: 0, y: 0 });
    expect(handlePosition("se")).toEqual({ x: 1, y: 1 });
    expect(handlePosition("n")).toEqual({ x: 0.5, y: 0 });
    expect(handlePosition("w")).toEqual({ x: 0, y: 0.5 });
  });

  it("gives each handle the cursor that matches its axis", () => {
    expect(handleCursor("n")).toBe("ns-resize");
    expect(handleCursor("w")).toBe("ew-resize");
    expect(handleCursor("se")).toBe("nwse-resize");
    expect(handleCursor("ne")).toBe("nesw-resize");
  });
});

describe("Canvas resize geometry", () => {
  it("grows from the south-east corner without moving the origin", () => {
    expect(resizeBox(start, "se", 20, 10)).toEqual({ x: 100, y: 200, width: 100, height: 50 });
  });

  it("keeps the opposite edge fixed when dragging west or north", () => {
    expect(resizeBox(start, "w", -20, 0)).toEqual({ x: 80, y: 200, width: 100, height: 40 });
    expect(resizeBox(start, "n", 0, -10)).toEqual({ x: 100, y: 190, width: 80, height: 50 });
  });

  it("resizes one axis only from an edge handle", () => {
    expect(resizeBox(start, "e", 20, 999)).toEqual({ x: 100, y: 200, width: 100, height: 40 });
    expect(resizeBox(start, "s", 999, 10)).toEqual({ x: 100, y: 200, width: 80, height: 50 });
  });

  it("never resizes below the minimum", () => {
    const squashed = resizeBox(start, "se", -500, -500);
    expect(squashed.width).toBe(1);
    expect(squashed.height).toBe(1);
  });

  it("holds the start ratio on a constrained corner drag", () => {
    const box = resizeBox(start, "se", 40, 0, { constrain: true });
    expect(box.width / box.height).toBeCloseTo(start.width / start.height);
    expect(box.width).toBeCloseTo(120);
    expect(box.height).toBeCloseTo(60);
  });

  it("follows whichever axis the pointer pushed further", () => {
    const byHeight = resizeBox(start, "se", 0, 40, { constrain: true });
    expect(byHeight.height).toBeCloseTo(80);
    expect(byHeight.width).toBeCloseTo(160);
  });

  it("holds a locked ratio in preference to the start box", () => {
    const box = resizeBox(start, "se", 40, 0, { constrain: true, ratio: 1 });
    expect(box.width).toBeCloseTo(120);
    expect(box.height).toBeCloseTo(120);
  });

  it("keeps the anchored corner fixed while constraining", () => {
    const box = resizeBox(start, "nw", -40, 0, { constrain: true });
    expect(box.x + box.width).toBeCloseTo(start.x + start.width);
    expect(box.y + box.height).toBeCloseTo(start.y + start.height);
  });

  it("ignores the constraint on edge handles, which own one axis", () => {
    expect(resizeBox(start, "e", 40, 0, { constrain: true })).toEqual({
      x: 100,
      y: 200,
      width: 120,
      height: 40,
    });
  });
});

describe("Canvas aspect ratio locks", () => {
  const withRatio = (aspectRatio: unknown) => ({ id: "a", type: "rect", aspectRatio }) as Element;

  it("reads a lock from either the layout or the Element", () => {
    expect(lockedAspectRatio(withRatio({ ratio: 1.5, driver: "width" }))).toBe(1.5);
    expect(
      lockedAspectRatio({
        id: "a",
        type: "rect",
        layout: { aspectRatio: { ratio: 2, driver: "width" } },
      } as Element),
    ).toBe(2);
  });

  it("treats a missing or nonsensical lock as unlocked", () => {
    expect(lockedAspectRatio(null)).toBeNull();
    expect(lockedAspectRatio({ id: "a", type: "rect" } as Element)).toBeNull();
    expect(lockedAspectRatio(withRatio({ ratio: 0, driver: "width" }))).toBeNull();
  });
});
