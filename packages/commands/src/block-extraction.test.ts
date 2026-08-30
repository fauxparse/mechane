import { describe, expect, it } from "vitest";
import type { Canvas, FrameElement, ShowGraph } from "@mechane/domain";

import { createBlockFromSelection, BlockExtractionError } from "./block-extraction";
import type { CanvasWorkspace } from "./canvas-commands";
import { CommandStack } from "./stack";
import type { GraphEdit } from "./graph-edits";
import type { CanvasWorkspaceEdit } from "./canvas-commands";

const sceneCanvas: Canvas = {
  kind: "scene",
  root: {
    id: "root",
    type: "frame",
    layoutMode: "absolute",
    sizing: { width: { mode: "fixed", value: 1920 }, height: { mode: "fixed", value: 1080 } },
    children: [
      {
        id: "card",
        type: "frame",
        rank: "b",
        name: "Card",
        layoutMode: "auto",
        direction: "vertical",
        gap: 12,
        padding: 16,
        fill: "#ffffff",
        alignSelf: "start",
        anchor: { horizontal: "left", vertical: "top", offsetX: 40, offsetY: 60 },
        sizing: { width: { mode: "fixed", value: 320 }, height: { mode: "fixed", value: 200 } },
        children: [
          { id: "title", type: "text", rank: "a", content: "Title" },
          { id: "body", type: "text", rank: "b", content: "Body" },
        ],
      },
      { id: "loose-one", type: "rect", rank: "c" },
      { id: "loose-two", type: "rect", rank: "d" },
    ],
  },
};

const workspace: CanvasWorkspace = {
  artboards: [{ canvasId: "scene_a", canvas: sceneCanvas, position: { x: 0, y: 0 } }],
};

const emptyGraph: ShowGraph = { nodes: [], edges: [], shapes: [], blocks: [] };

function ids(
  input: {
    blockId?: string;
    blockCanvasId?: string;
    slotElementId?: string;
  } = {},
) {
  return {
    blockId: input.blockId ?? "block_new",
    blockCanvasId: input.blockCanvasId ?? "canvas_new",
    slotElementId: input.slotElementId ?? "slot_new",
  };
}

describe("createBlockFromSelection", () => {
  it("turns a selected Frame into the Block Canvas itself, without re-wrapping it", () => {
    const { block, slot } = createBlockFromSelection({
      canvasId: "scene_a",
      canvas: sceneCanvas,
      elementIds: ["card"],
      name: "Card",
      position: { x: 2000, y: 0 },
      ...ids(),
    });

    expect(block.canvas.id).toBe("canvas_new");
    expect(block.canvas.position).toEqual({ x: 2000, y: 0 });
    const root = block.canvas.root as FrameElement;
    // The Frame's own children, not the Frame itself.
    expect(root.children?.map((child) => child.id)).toEqual(["title", "body"]);
    expect(root.direction).toBe("vertical");
    expect(root.gap).toBe(12);
    expect(root.padding).toBe(16);
    expect(root.fill).toBe("#ffffff");
    expect(root.sizing?.width).toEqual({ mode: "fixed", value: 320 });

    // Where the Frame sat in its parent stays behind on the Slot.
    expect(slot.type).toBe("slot");
    expect(slot.blockId).toBe("block_new");
    expect(slot.name).toBe("Card");
    expect(slot.sizing).toEqual(sceneCanvas.root.children?.[0]?.sizing);
    expect(slot.anchor).toEqual({ horizontal: "left", vertical: "top", offsetX: 40, offsetY: 60 });
    expect(slot.alignSelf).toBe("start");
    // A Slot Layout Container always uses auto layout.
    expect(slot.layoutMode).toBe("auto");
  });

  it("gathers ungrouped siblings into a Block sized like the box they came out of", () => {
    const { block, slot } = createBlockFromSelection({
      canvasId: "scene_a",
      canvas: sceneCanvas,
      elementIds: ["loose-two", "loose-one"],
      name: "Pair",
      position: { x: 2000, y: 0 },
      ...ids(),
    });

    const root = block.canvas.root as FrameElement;
    // Stacking order is preserved regardless of the order they were selected in.
    expect(root.children?.map((child) => child.id)).toEqual(["loose-one", "loose-two"]);
    expect(root.layoutMode).toBe("absolute");
    expect(root.sizing).toEqual(sceneCanvas.root.sizing);
    // An absolute parent means the Elements kept their anchors, so the Slot takes over its box.
    expect(slot.sizing).toEqual({ width: { mode: "fill" }, height: { mode: "fill" } });
  });

  it("copies the layout properties of a shared auto-layout parent", () => {
    const canvas: Canvas = {
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "stack",
            type: "frame",
            rank: "a",
            layoutMode: "auto",
            direction: "horizontal",
            gap: 8,
            children: [
              { id: "one", type: "rect", rank: "a" },
              { id: "two", type: "rect", rank: "b" },
            ],
          },
        ],
      },
    };
    const { block, slot } = createBlockFromSelection({
      canvasId: "scene_a",
      canvas,
      elementIds: ["one", "two"],
      name: "Pair",
      position: { x: 0, y: 500 },
      ...ids(),
    });

    const root = block.canvas.root as FrameElement;
    expect(root.direction).toBe("horizontal");
    expect(root.gap).toBe(8);
    // Inside an auto-layout parent the Slot is laid out for it; it claims no box of its own.
    expect(slot.sizing).toBeUndefined();
    expect(slot.anchor).toBeUndefined();
  });

  it("ignores selected Elements that already travel inside another selected Element", () => {
    const { block } = createBlockFromSelection({
      canvasId: "scene_a",
      canvas: sceneCanvas,
      elementIds: ["card", "title"],
      name: "Card",
      position: { x: 0, y: 0 },
      ...ids(),
    });
    expect((block.canvas.root as FrameElement).children?.map((child) => child.id)).toEqual([
      "title",
      "body",
    ]);
  });

  it("refuses a selection that is not siblings, an empty selection, or the Canvas root", () => {
    const base = {
      canvasId: "scene_a",
      canvas: sceneCanvas,
      name: "Nope",
      position: { x: 0, y: 0 },
      ...ids(),
    };
    expect(() => createBlockFromSelection({ ...base, elementIds: ["title", "loose-one"] })).toThrow(
      BlockExtractionError,
    );
    expect(() => createBlockFromSelection({ ...base, elementIds: [] })).toThrow(
      BlockExtractionError,
    );
    expect(() => createBlockFromSelection({ ...base, elementIds: ["root"] })).toThrow(
      BlockExtractionError,
    );
  });

  it("replaces the selection with the Slot in one undo entry, and puts it back on undo", () => {
    const canvasBatches: CanvasWorkspaceEdit[][] = [];
    const canvasStack = new CommandStack<CanvasWorkspace, CanvasWorkspaceEdit>({
      state: workspace,
      dispatch: (_command, _state, edits) => canvasBatches.push([...edits]),
    });
    const graphStack = new CommandStack<ShowGraph, GraphEdit>({ state: emptyGraph });

    const { graphCommand, canvasCommand } = createBlockFromSelection({
      canvasId: "scene_a",
      canvas: sceneCanvas,
      elementIds: ["card"],
      name: "Card",
      position: { x: 2000, y: 0 },
      ...ids(),
    });
    graphStack.execute(graphCommand);
    canvasStack.execute(canvasCommand);

    const root = canvasStack.state.artboards[0]!.canvas.root;
    expect(root.children?.map((child) => child.id)).toEqual(["slot_new", "loose-one", "loose-two"]);
    // The Slot takes the Frame's place in the stacking order, not the top of it.
    expect(root.children?.[0]?.rank).toBe("b");
    expect(graphStack.state.blocks?.map((block) => block.id)).toEqual(["block_new"]);
    expect(canvasBatches).toHaveLength(1);

    canvasStack.undo();
    graphStack.undo();
    expect(canvasStack.state.artboards[0]!.canvas.root.children?.map((child) => child.id)).toEqual([
      "card",
      "loose-one",
      "loose-two",
    ]);
    expect(graphStack.state.blocks).toEqual([]);

    graphStack.redo();
    canvasStack.redo();
    expect(canvasStack.state.artboards[0]!.canvas.root.children?.map((child) => child.id)).toEqual([
      "slot_new",
      "loose-one",
      "loose-two",
    ]);
    expect(graphStack.state.blocks?.map((block) => block.id)).toEqual(["block_new"]);
  });
});
