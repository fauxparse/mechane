import { describe, expect, it } from "vitest";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import { ancestorIdsOf, canvasLayerRows, expansionForSelection } from "./canvas-layer-tree";

const artboard: CanvasArtboardDocument = {
  canvasId: "canvas-1",
  artId: "scene-1",
  kind: "scene",
  name: "Into the wood",
  position: { x: 0, y: 0 },
  canvas: {
    kind: "scene",
    root: {
      id: "root",
      type: "frame",
      children: [
        { id: "back", type: "rect", rank: "a" },
        {
          id: "group",
          type: "frame",
          rank: "b",
          name: "Group",
          children: [
            { id: "nested", type: "text", rank: "a", name: "Caption" },
            {
              id: "deep",
              type: "frame",
              rank: "b",
              children: [{ id: "leaf", type: "rect", rank: "a" }],
            },
          ],
        },
      ],
    },
  },
};

const rows = (expanded: string[], query?: string) =>
  canvasLayerRows(artboard, { expanded: new Set(expanded), query }).map((row) => [
    row.kind,
    row.id,
    row.depth,
  ]);

describe("Canvas layer tree rows", () => {
  it("makes the Canvas the root and never shows the root Element", () => {
    expect(rows([])).toEqual([["canvas", "scene-1", 0]]);
    const opened = canvasLayerRows(artboard, { expanded: new Set(["scene-1"]) });
    expect(opened.map((row) => row.id)).not.toContain("root");
    expect(opened[0]).toMatchObject({ kind: "canvas", name: "Into the wood", hasChildren: true });
  });

  it("hangs the root's children directly off the Canvas, topmost first", () => {
    // layerChildren paints the top of the stack first, which is how a navigator reads.
    expect(rows(["scene-1"])).toEqual([
      ["canvas", "scene-1", 0],
      ["element", "group", 1],
      ["element", "back", 1],
    ]);
  });

  it("opens only what is expanded", () => {
    expect(rows(["scene-1", "group"])).toEqual([
      ["canvas", "scene-1", 0],
      ["element", "group", 1],
      ["element", "deep", 2],
      ["element", "nested", 2],
      ["element", "back", 1],
    ]);
  });

  it("reports which rows can be opened", () => {
    const opened = canvasLayerRows(artboard, { expanded: new Set(["scene-1"]) });
    expect(opened.find((row) => row.id === "group")).toMatchObject({ hasChildren: true });
    expect(opened.find((row) => row.id === "back")).toMatchObject({ hasChildren: false });
  });

  it("carries the Element kind so the row can be given an icon", () => {
    const opened = canvasLayerRows(artboard, { expanded: new Set(["scene-1", "group"]) });
    expect(opened.find((row) => row.id === "nested")?.elementKind).toBe("text");
    expect(opened.find((row) => row.id === "group")?.elementKind).toBe("frame");
  });

  it("prefers a name over the default type label", () => {
    const opened = canvasLayerRows(artboard, { expanded: new Set(["scene-1", "group"]) });
    expect(opened.find((row) => row.id === "nested")?.name).toBe("Caption");
    expect(opened.find((row) => row.id === "back")?.name).toBe("Rectangle");
  });
});

describe("Canvas layer tree search", () => {
  it("opens whatever stands between the Canvas and a match", () => {
    // Nothing is expanded, yet the match and its ancestors show.
    expect(rows([], "Caption")).toEqual([
      ["canvas", "scene-1", 0],
      ["element", "group", 1],
      ["element", "nested", 2],
    ]);
  });

  it("drops branches with no match anywhere inside them", () => {
    expect(rows([], "leaf")).toEqual([
      ["canvas", "scene-1", 0],
      ["element", "group", 1],
      ["element", "deep", 2],
      ["element", "leaf", 3],
    ]);
  });

  it("treats a blank query as no query", () => {
    expect(rows([], "   ")).toEqual([["canvas", "scene-1", 0]]);
  });
});

describe("Canvas layer tree expansion for a selection", () => {
  it("names the Canvas rather than the root Element", () => {
    expect(ancestorIdsOf(artboard, "back")).toEqual(["scene-1"]);
  });

  it("names every Frame between the Canvas and the Element", () => {
    expect(ancestorIdsOf(artboard, "leaf").sort()).toEqual(["deep", "group", "scene-1"]);
  });

  it("has nothing to say about an Element that isn't there", () => {
    expect(ancestorIdsOf(artboard, "missing")).toEqual([]);
  });

  it("collects the ancestors of a whole selection without repeats", () => {
    expect(expansionForSelection(artboard, ["nested", "leaf"]).sort()).toEqual([
      "deep",
      "group",
      "scene-1",
    ]);
  });
});
