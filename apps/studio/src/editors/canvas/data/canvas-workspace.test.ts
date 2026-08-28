import { describe, expect, it } from "vitest";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import {
  artIdFromPath,
  canvasArtboardSize,
  freeArtboardPosition,
  isCanvasPath,
  resolveFocusedArtboard,
  shouldFrameForeignLayer,
  uniqueBlockName,
} from "./canvas-workspace";
import { rememberedCanvasCamera, rememberCanvasCamera } from "./canvas-session";

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

describe("Canvas layer navigation", () => {
  it("frames a foreign Element unless Shift is extending a selection", () => {
    expect(shouldFrameForeignLayer("scene-a", "block-b", "element", false)).toBe(true);
    expect(shouldFrameForeignLayer("scene-a", "block-b", "element", true)).toBe(false);
    expect(shouldFrameForeignLayer("scene-a", "scene-a", "element", false)).toBe(false);
    expect(shouldFrameForeignLayer("scene-a", "block-b", "canvas", false)).toBe(false);
  });
});

describe("Canvas camera session state", () => {
  it("remembers the latest camera independently for each Show", () => {
    const camera = { x: -120, y: 64, zoom: 1.5 };
    rememberCanvasCamera("show-camera", camera);
    rememberCanvasCamera("show-other", { x: 0, y: 0, zoom: 1 });

    expect(rememberedCanvasCamera("show-camera")).toEqual(camera);
    expect(rememberedCanvasCamera("show-other")).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(rememberedCanvasCamera("show-missing")).toBeUndefined();
  });
});

describe("Canvas workspace artboard sizing", () => {
  it("uses measured root bounds for Hug and design bounds for Fixed and Fill", () => {
    const scene = {
      ...artboards[0]!,
      canvas: {
        kind: "scene" as const,
        root: { id: "scene-root", type: "frame" as const },
      },
    } as CanvasArtboardDocument;
    const hugRoot = {
      ...scene,
      canvas: {
        ...scene.canvas,
        root: {
          ...scene.canvas.root,
          sizing: {
            width: { mode: "hug" as const },
            height: { mode: "hug" as const },
          },
        },
      },
    } as CanvasArtboardDocument;
    const fixedRoot = {
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
    const fillRoot = {
      ...scene,
      canvas: {
        ...scene.canvas,
        root: {
          ...scene.canvas.root,
          sizing: {
            width: { mode: "fill" as const, value: 960 },
            height: { mode: "fill" as const, value: 540 },
          },
        },
      },
    } as CanvasArtboardDocument;

    expect(canvasArtboardSize(scene)).toEqual({ width: 720, height: 420 });
    expect(canvasArtboardSize(hugRoot, { width: 312, height: 56 })).toEqual({
      width: 312,
      height: 56,
    });
    expect(canvasArtboardSize(fixedRoot, { width: 1, height: 2 })).toEqual({
      width: 960,
      height: 540,
    });
    expect(canvasArtboardSize(fillRoot, { width: 1, height: 2 })).toEqual({
      width: 960,
      height: 540,
    });
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

describe("placing a new Artboard", () => {
  it("clears every existing Artboard, level with the topmost one", () => {
    // Both fall back to the 720x420 default size, so "b" ends at 730.
    expect(freeArtboardPosition(artboards, 40)).toEqual({ x: 770, y: 0 });
  });

  it("starts at the origin in an empty workspace", () => {
    expect(freeArtboardPosition([])).toEqual({ x: 0, y: 0 });
  });
});

describe("naming a new Block", () => {
  it("keeps the preferred name when it is free, and numbers it when it is not", () => {
    expect(uniqueBlockName(["Card"], "Header")).toBe("Header");
    expect(uniqueBlockName(["Card"], "card")).toBe("card 2");
    expect(uniqueBlockName(["Card", "Card 2"], "Card")).toBe("Card 3");
    expect(uniqueBlockName([], "  ")).toBe("Block");
  });
});
