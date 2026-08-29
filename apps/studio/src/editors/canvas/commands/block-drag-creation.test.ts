import { describe, expect, it } from "vitest";

import { emptyShowGraph } from "@mechane/domain";

import { createBlockFromDrag } from "./block-drag-creation";

describe("createBlockFromDrag", () => {
  it("creates a sized free block artboard from the workspace background", () => {
    const created = createBlockFromDrag(emptyShowGraph(), {
      sourceCanvasId: null,
      position: { x: 240, y: 80 },
      width: 320,
      height: 180,
    });

    const graph = created.graphCommand.apply(emptyShowGraph()).state;
    const workspace = created.canvasCommand.apply({ artboards: [] }).state;
    const block = graph.blocks?.[0];
    const artboard = workspace.artboards.find(
      (candidate) => candidate.canvasId === block?.canvas.id,
    );

    expect(block?.canvas.root.sizing).toEqual({
      width: { mode: "fixed", value: 320 },
      height: { mode: "fixed", value: 180 },
    });
    expect(artboard?.position).toEqual({ x: 240, y: 80 });
  });

  it("adds a sized slot to the source canvas while placing the block at root", () => {
    const created = createBlockFromDrag(emptyShowGraph(), {
      sourceCanvasId: "scene-canvas",
      position: { x: 900, y: 40 },
      width: 320,
      height: 180,
      slotParentId: "scene-root",
      slotRank: "a",
      slotProperties: {
        anchor: { horizontal: "left", vertical: "top", offsetX: 24, offsetY: 36 },
      },
    });

    const workspace = created.canvasCommand.apply({
      artboards: [
        {
          canvasId: "scene-canvas",
          canvas: { kind: "scene", root: { id: "scene-root", type: "frame", children: [] } },
          position: { x: 0, y: 0 },
        },
      ],
    }).state;
    const scene = workspace.artboards.find((candidate) => candidate.canvasId === "scene-canvas");
    const slot = scene?.canvas.root.children?.[0];

    expect(slot).toMatchObject({
      type: "slot",
      sizing: {
        width: { mode: "fixed", value: 320 },
        height: { mode: "fixed", value: 180 },
      },
      anchor: { horizontal: "left", vertical: "top", offsetX: 24, offsetY: 36 },
      blockId: created.block.id,
    });
  });
});
