import { describe, expect, it } from "vitest";

import type { FrameElement } from "@mechane/domain";
import { flattenCanvasLayers, layerChildren, layerMatches } from "./canvas-layers";

const root: FrameElement = {
  id: "root",
  type: "frame",
  children: [
    { id: "back", type: "rect", rank: "a" },
    { id: "front", type: "rect", rank: "b", name: "Front" },
  ],
};

describe("Canvas layer tree", () => {
  it("renders siblings in reverse paint rank and flattens parent context", () => {
    expect(layerChildren(root).map((element) => element.id)).toEqual(["front", "back"]);
    expect(
      flattenCanvasLayers(root).map(({ element, depth, parentId }) => [
        element.id,
        depth,
        parentId,
      ]),
    ).toEqual([
      ["root", 0, null],
      ["front", 1, "root"],
      ["back", 1, "root"],
    ]);
  });

  it("matches names, ids, and types for navigator search", () => {
    const entry = flattenCanvasLayers(root)[1]!;
    expect(layerMatches(entry, "Front")).toBe(true);
    expect(layerMatches(entry, "rect")).toBe(true);
    expect(layerMatches(entry, "missing")).toBe(false);
  });
});
