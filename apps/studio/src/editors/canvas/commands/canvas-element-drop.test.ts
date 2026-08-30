import { describe, expect, it } from "vitest";
import type { Element } from "@mechane/domain";

import { planCanvasElementDrop } from "./canvas-element-drop";

const element: Element = {
  id: "source",
  type: "rect",
  sizing: {
    width: { mode: "fill" },
    height: { mode: "fixed", value: 20 },
  },
};

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  right: x + width,
  bottom: y + height,
});

const origin = {
  artId: "art-1",
  canvasId: "canvas-1",
  elementId: "source",
  parentId: "parent-1",
  rank: "b",
  autoParent: false,
};

describe("planCanvasElementDrop", () => {
  it("plans same-parent absolute reposition as an update preserving rank", () => {
    const plan = planCanvasElementDrop({
      origin,
      site: { artId: "art-1", canvasId: "canvas-1", parentId: "parent-1", rank: "z", auto: false },
      dropped: rect(30, 50, 20, 10),
      parentOrigin: { x: 10, y: 20 },
      element,
      zoom: 1,
    });
    expect(plan).toEqual({
      kind: "update",
      canvasId: "canvas-1",
      elementId: "source",
      properties: {
        anchor: { horizontal: "left", vertical: "top", offsetX: 20, offsetY: 30 },
      },
      select: null,
    });
  });

  it("plans same-canvas reparenting as a move", () => {
    const plan = planCanvasElementDrop({
      origin,
      site: { artId: "art-1", canvasId: "canvas-1", parentId: "parent-2", rank: "c", auto: false },
      dropped: rect(30, 50, 20, 10),
      parentOrigin: { x: 10, y: 20 },
      element,
      zoom: 1,
    });
    expect(plan.kind).toBe("move");
    if (plan.kind === "move") expect(plan).toMatchObject({ parentId: "parent-2", rank: "c" });
  });

  it("plans cross-canvas moves with destination selection", () => {
    const plan = planCanvasElementDrop({
      origin,
      site: { artId: "art-2", canvasId: "canvas-2", parentId: "parent-2", rank: "c", auto: true },
      dropped: rect(30, 50, 20, 10),
      parentOrigin: { x: 10, y: 20 },
      element,
      zoom: 1,
    });
    expect(plan).toMatchObject({
      kind: "move-between-canvases",
      sourceCanvasId: "canvas-1",
      targetCanvasId: "canvas-2",
      select: { artId: "art-2", elementIds: ["source"] },
      unsetProperties: ["anchor"],
    });
  });

  it("rejects a missing target", () => {
    expect(
      planCanvasElementDrop({
        origin,
        site: null,
        dropped: null,
        parentOrigin: null,
        element,
        zoom: 1,
      }),
    ).toEqual({ kind: "none", select: null });
  });

  it("unsets anchor for an auto-layout target", () => {
    const plan = planCanvasElementDrop({
      origin: { ...origin, autoParent: true },
      site: { artId: "art-1", canvasId: "canvas-1", parentId: "parent-2", rank: "c", auto: true },
      dropped: rect(30, 50, 20, 10),
      parentOrigin: { x: 10, y: 20 },
      element,
      zoom: 1,
    });
    expect(plan).toMatchObject({ kind: "move", unsetProperties: ["anchor"], properties: {} });
  });

  it.each([
    [0.5, 13, 15],
    [2, 3, 4],
  ])("rounds anchors at zoom %s", (zoom, offsetX, offsetY) => {
    const plan = planCanvasElementDrop({
      origin,
      site: { artId: "art-1", canvasId: "canvas-1", parentId: "parent-1", rank: "b", auto: false },
      dropped: rect(16.25, 27.5, 20, 10),
      parentOrigin: { x: 10, y: 20 },
      element,
      zoom,
    });
    expect(plan).toMatchObject({ properties: { anchor: { offsetX, offsetY } } });
  });
});
