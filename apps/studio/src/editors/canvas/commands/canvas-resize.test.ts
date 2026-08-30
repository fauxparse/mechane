import { describe, expect, it } from "vitest";

import type { Element } from "@mechane/domain";

import {
  fixedResizeProperties,
  handleCursor,
  handlePosition,
  isCornerHandle,
  lockedAspectRatio,
  resizeBox,
  resizeElementUpdate,
  scaleWithin,
  unlockedAspectRatioProperties,
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

describe("Canvas multi-selection scaling", () => {
  const from = { x: 0, y: 0, width: 100, height: 100 };

  it("keeps an Element's relative place and proportion in the selection", () => {
    const to = { x: 0, y: 0, width: 200, height: 50 };
    expect(scaleWithin({ x: 50, y: 50, width: 10, height: 10 }, from, to)).toEqual({
      x: 100,
      y: 25,
      width: 20,
      height: 5,
    });
  });

  it("carries Elements along when the selection box moves", () => {
    const to = { x: 30, y: 40, width: 100, height: 100 };
    expect(scaleWithin({ x: 10, y: 10, width: 20, height: 20 }, from, to)).toEqual({
      x: 40,
      y: 50,
      width: 20,
      height: 20,
    });
  });

  it("leaves an Element whole when the selection is unchanged", () => {
    const box = { x: 10, y: 20, width: 30, height: 40 };
    expect(scaleWithin(box, from, from)).toEqual(box);
  });

  it("never scales an Element below the minimum", () => {
    const to = { x: 0, y: 0, width: 1, height: 1 };
    const scaled = scaleWithin({ x: 0, y: 0, width: 10, height: 10 }, from, to);
    expect(scaled.width).toBe(1);
    expect(scaled.height).toBe(1);
  });

  it("survives a selection box with no extent", () => {
    const flat = { x: 5, y: 5, width: 0, height: 0 };
    const scaled = scaleWithin({ x: 5, y: 5, width: 4, height: 4 }, flat, {
      x: 9,
      y: 9,
      width: 0,
      height: 0,
    });
    expect(scaled).toEqual({ x: 9, y: 9, width: 4, height: 4 });
  });
});

describe("Canvas aspect ratio locks", () => {
  const withRatio = (aspectRatio: unknown) =>
    ({ id: "a", type: "rect", layout: { aspectRatio } }) as Element;

  it("reads the canonical layout lock", () => {
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

describe("Canvas edge resize aspect-ratio unlock", () => {
  it("clears the canonical layout aspect-ratio lock", () => {
    expect(
      unlockedAspectRatioProperties({
        id: "image",
        type: "image",
        layout: {
          rotation: 90,
          aspectRatio: { ratio: 16 / 9, driver: "width" },
        },
      } as Element),
    ).toEqual({
      properties: { layout: { rotation: 90 } },
      unsetProperties: [],
    });
  });

  it("allows a later corner resize to use both axes independently", () => {
    const afterEdge = resizeBox(start, "e", 20, 0, { constrain: true });
    expect(resizeBox(afterEdge, "se", 10, 10)).toEqual({
      x: 100,
      y: 200,
      width: 110,
      height: 50,
    });
  });
});

describe("Canvas fixed resize properties", () => {
  it("writes fixed dimensions into sizing while preserving layout fields", () => {
    expect(
      fixedResizeProperties(
        {
          id: "root",
          type: "frame",
          layout: { rotation: 90 },
          sizing: {
            width: { mode: "fill", value: 1 },
            height: { mode: "fill", value: 1 },
          },
        } as Element,
        320,
        180,
      ),
    ).toEqual({
      sizing: {
        width: { mode: "fixed", value: 320 },
        height: { mode: "fixed", value: 180 },
      },
      layout: { rotation: 90 },
    });
  });

  it("writes fixed dimensions into sizing", () => {
    expect(
      fixedResizeProperties(
        {
          id: "root",
          type: "frame",
          sizing: {
            width: { mode: "fill", value: 1 },
            height: { mode: "fill", value: 1 },
          },
        } as Element,
        240,
        120,
      ),
    ).toEqual({
      sizing: {
        width: { mode: "fixed", value: 240 },
        height: { mode: "fixed", value: 120 },
      },
    });
  });
});

describe("resizeElementUpdate", () => {
  const element: Element = {
    id: "element-1",
    type: "rect",
    layout: { aspectRatio: { ratio: 2, driver: "width" } },
    sizing: { width: { mode: "fixed", value: 100 }, height: { mode: "fixed", value: 50 } },
  };

  it("returns one update with a parent-relative anchor for absolute children", () => {
    const update = resizeElementUpdate({
      subject: {
        elementId: "element-1",
        start: { x: 20, y: 30, width: 100, height: 50 },
        parent: { x: 10, y: 20, width: 300, height: 200 },
        autoParent: false,
      },
      selectionStart: { x: 20, y: 30, width: 100, height: 50 },
      requested: { x: 20, y: 30, width: 120, height: 70 },
      element,
      handle: "se",
      zoom: 1,
    });
    expect(update.properties).toMatchObject({
      sizing: { width: { value: 120 }, height: { value: 70 } },
      anchor: { offsetX: 10, offsetY: 10 },
    });
    expect(update.unsetProperties).toEqual([]);
  });

  it("unlocks aspect ratio on edge resize and omits anchors in auto layout", () => {
    const update = resizeElementUpdate({
      subject: {
        elementId: "element-1",
        start: { x: 20, y: 30, width: 100, height: 50 },
        parent: { x: 10, y: 20, width: 300, height: 200 },
        autoParent: true,
      },
      selectionStart: { x: 20, y: 30, width: 100, height: 50 },
      requested: { x: 20, y: 30, width: 120, height: 70 },
      element,
      handle: "e",
      zoom: 1,
    });
    expect(update.properties).not.toHaveProperty("anchor");
    expect(update.unsetProperties).toEqual(["layout"]);
  });
});
