import { afterEach, describe, expect, it, vi } from "vitest";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import {
  rememberedCanvasCamera,
  rememberedCanvasSelection,
  restoreCanvasSelection,
} from "./canvas-session";

const artboard: CanvasArtboardDocument = {
  canvasId: "canvas-tally",
  artId: "block_tally_row",
  kind: "block",
  name: "TallyRow",
  position: { x: 0, y: 0 },
  canvas: {
    kind: "block",
    root: {
      id: "root",
      type: "frame",
      children: [{ id: "track", type: "frame", children: [{ id: "bar", type: "rect" }] }],
    },
  },
};

/** A tab's storage as the browser would hand it over after a reload. */
function storageHolding(entries: Record<string, string>): Storage {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Canvas selection restore", () => {
  it("keeps the Elements that still exist, however deep", () => {
    expect(
      restoreCanvasSelection({ artId: "block_tally_row", elementIds: ["bar", "deleted"] }, [
        artboard,
      ]),
    ).toEqual({ artId: "block_tally_row", elementIds: ["bar"] });
  });

  it("drops the selection when its Artboard is gone", () => {
    expect(
      restoreCanvasSelection({ artId: "scene_removed", elementIds: ["bar"] }, [artboard]),
    ).toEqual({ artId: null, elementIds: [] });
  });
});

describe("Canvas session storage after a reload", () => {
  it("reads what an earlier page load stored", () => {
    vi.stubGlobal(
      "sessionStorage",
      storageHolding({
        "mechane:canvas-camera:show-reloaded": JSON.stringify({ x: -40, y: 12, zoom: 1.25 }),
        "mechane:canvas-selection:show-reloaded": JSON.stringify({
          artId: "block_tally_row",
          elementIds: ["bar"],
        }),
      }),
    );

    expect(rememberedCanvasCamera("show-reloaded")).toEqual({ x: -40, y: 12, zoom: 1.25 });
    expect(rememberedCanvasSelection("show-reloaded")).toEqual({
      artId: "block_tally_row",
      elementIds: ["bar"],
    });
  });

  it("ignores stored values it cannot trust rather than throwing", () => {
    vi.stubGlobal(
      "sessionStorage",
      storageHolding({
        "mechane:canvas-camera:show-corrupt": "{not json",
        "mechane:canvas-selection:show-corrupt": JSON.stringify({ artId: 7, elementIds: "bar" }),
        "mechane:canvas-camera:show-zoomless": JSON.stringify({ x: 0, y: 0, zoom: 0 }),
      }),
    );

    expect(rememberedCanvasCamera("show-corrupt")).toBeUndefined();
    expect(rememberedCanvasSelection("show-corrupt")).toBeUndefined();
    expect(rememberedCanvasCamera("show-zoomless")).toBeUndefined();
  });
});
