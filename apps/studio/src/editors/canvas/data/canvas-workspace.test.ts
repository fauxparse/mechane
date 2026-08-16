import { describe, expect, it } from "vitest";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import {
  artIdFromPath,
  canvasArtboardSize,
  isCanvasPath,
  resolveFocusedArtboard,
} from "./canvas-workspace";

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

describe("Canvas workspace artboard sizing", () => {
  it("uses preview defaults until a Canvas root has authored dimensions", () => {
    const scene = {
      ...artboards[0]!,
      canvas: {
        kind: "scene" as const,
        root: { id: "scene-root", type: "frame" as const },
      },
    } as CanvasArtboardDocument;
    const resizedScene = {
      ...scene,
      canvas: {
        ...scene.canvas,
        root: {
          ...scene.canvas.root,
          sizing: {
            width: { mode: "fixed" as const, value: 960 },
            height: { mode: "fixed" as const, value: 540 },
          },
        },
      },
    } as CanvasArtboardDocument;
    const block = {
      ...artboards[1]!,
      canvas: {
        kind: "block" as const,
        root: {
          id: "block-root",
          type: "frame" as const,
          sizing: {
            width: { mode: "fixed" as const, value: 480 },
            height: { mode: "fixed" as const, value: 280 },
          },
        },
      },
    } as CanvasArtboardDocument;

    expect(canvasArtboardSize(scene)).toEqual({ width: 720, height: 420 });
    expect(canvasArtboardSize(resizedScene)).toEqual({ width: 960, height: 540 });
    expect(canvasArtboardSize(block)).toEqual({ width: 480, height: 280 });
  });
});

describe("isCanvasPath", () => {
  const showId = "ses8v4b3";

  it("recognises the bare Canvas path", () => {
    expect(isCanvasPath(`/shows/${showId}/art`, showId)).toBe(true);
  });

  it("recognises an Artboard path", () => {
    expect(isCanvasPath(`/shows/${showId}/art/c6dy7ybf`, showId)).toBe(true);
  });

  // The regression: while the router transitions away from the Canvas editor the
  // route is still mounted, and its redirect must not fire for the destination's
  // pathname — that bounced the user straight back and silently cancelled every
  // navigation out of the Canvas editor.
  it("rejects the Show editor's path, so leaving the Canvas editor is not undone", () => {
    expect(isCanvasPath(`/shows/${showId}`, showId)).toBe(false);
  });

  it.each(["/settings", "/", `/shows/${showId}/artwork`])("rejects %s", (pathname) => {
    expect(isCanvasPath(pathname, showId)).toBe(false);
  });

  it("rejects another Show's Canvas path", () => {
    expect(isCanvasPath("/shows/other/art/c6dy7ybf", showId)).toBe(false);
  });
});
