import { describe, expect, it } from "vitest";

import type { FrameElement } from "@mechane/domain";

import { layerDropPlacement, layerDropZone } from "./canvas-layer-drop";

const root: FrameElement = {
  id: "root",
  type: "frame",
  children: [
    { id: "back", type: "rect", rank: "a" },
    {
      id: "group",
      type: "frame",
      rank: "b",
      children: [{ id: "nested", type: "rect", rank: "a" }],
    },
    { id: "front", type: "rect", rank: "c" },
  ],
};

describe("Canvas layer drop zones", () => {
  it("reparents only through the middle band of a Frame row", () => {
    expect(layerDropZone(1, 32, true)).toBe("before");
    expect(layerDropZone(16, 32, true)).toBe("inside");
    expect(layerDropZone(31, 32, true)).toBe("after");
  });

  it("reorders around rows that cannot take children", () => {
    expect(layerDropZone(4, 32, false)).toBe("before");
    expect(layerDropZone(28, 32, false)).toBe("after");
  });
});

describe("Canvas layer drop placement", () => {
  it("reparents into a Frame dropped onto", () => {
    const placement = layerDropPlacement(root, "back", "group", "inside");
    expect(placement?.parentId).toBe("group");
  });

  it("reorders within a parent and ranks above the row dropped before", () => {
    const placement = layerDropPlacement(root, "back", "front", "before");
    expect(placement?.parentId).toBe("root");
    expect(placement!.rank > "c").toBe(true);
  });

  it("ranks below the row dropped after", () => {
    const placement = layerDropPlacement(root, "front", "back", "after");
    expect(placement?.parentId).toBe("root");
    expect(placement!.rank < "a").toBe(true);
  });

  it("moves a nested Element back out to the root", () => {
    expect(layerDropPlacement(root, "nested", "back", "before")?.parentId).toBe("root");
  });

  it("refuses to drop a Frame into its own subtree", () => {
    expect(layerDropPlacement(root, "group", "nested", "before")).toBeNull();
    expect(layerDropPlacement(root, "group", "group", "inside")).toBeNull();
  });

  it("refuses to move the root and refuses no-op drops", () => {
    expect(layerDropPlacement(root, "root", "back", "before")).toBeNull();
    expect(layerDropPlacement(root, "nested", "group", "inside")).toBeNull();
  });
});
