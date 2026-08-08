import { describe, expect, it } from "vitest";

import type { CanvasArtboardDocument } from "../../api/canvas";
import { artIdFromPath, resolveFocusedArtboard } from "./canvas-workspace";

const artboards = [
  {
    canvasId: "canvas-a",
    artId: "scene-a",
    kind: "scene",
    name: "A",
    canvas: { root: { id: "root-a" } },
    position: { x: 0, y: 0 },
  },
  {
    canvasId: "canvas-b",
    artId: "block-b",
    kind: "block",
    name: "B",
    canvas: { root: { id: "root-b" } },
    position: { x: 10, y: 10 },
  },
] as unknown as CanvasArtboardDocument[];

describe("Canvas workspace URL state", () => {
  it("reads an encoded artboard id only from the canonical route", () => {
    expect(artIdFromPath("/shows/show-1/art/block%2Fb", "show-1")).toBe("block/b");
    expect(artIdFromPath("/shows/show-1/art", "show-1")).toBeNull();
    expect(artIdFromPath("/shows/show-2/art/block-b", "show-1")).toBeNull();
  });

  it("resolves either owner id or persisted canvas id and falls back deterministically", () => {
    expect(resolveFocusedArtboard(artboards, "block-b")?.canvasId).toBe("canvas-b");
    expect(resolveFocusedArtboard(artboards, "canvas-b")?.artId).toBe("block-b");
    expect(resolveFocusedArtboard(artboards, "missing")?.artId).toBe("scene-a");
    expect(resolveFocusedArtboard([], "missing")).toBeNull();
  });
});
