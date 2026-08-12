import { describe, expect, it } from "vitest";
import type { Canvas } from "@mechane/domain";

import {
  addCanvasElement,
  applyCanvasWorkspaceEdits,
  coalesceCanvasWorkspaceEdits,
  moveCanvasArtboard,
  moveCanvasElement,
  moveCanvasElementBetweenCanvases,
  removeCanvasElement,
  reparentCanvasElement,
  updateCanvasElement,
  updateCanvasElements,
} from "./canvas-commands";
import type { CanvasWorkspace, CanvasWorkspaceEdit } from "./canvas-commands";
import { CommandStack } from "./stack";

const firstCanvas: Canvas = {
  root: {
    id: "root",
    type: "frame",
    children: [
      { id: "first", type: "rect", rank: "a" },
      {
        id: "container",
        type: "frame",
        rank: "b",
        children: [{ id: "nested", type: "text", rank: "a", content: "hello" }],
      },
    ],
  },
};

const workspace: CanvasWorkspace = {
  artboards: [
    { canvasId: "scene_a", canvas: firstCanvas, position: { x: 0, y: 0 } },
    {
      canvasId: "block_b",
      canvas: { root: { id: "block-root", type: "frame" } },
      position: { x: 400, y: 0 },
    },
  ],
};

function stored(value: CanvasWorkspace) {
  return value.artboards.map(({ canvasId, canvas, position }) => ({ canvasId, canvas, position }));
}

describe("Canvas workspace commands", () => {
  it("adds an Element and sends an ordinary inverse on undo", () => {
    const batches: CanvasWorkspaceEdit[][] = [];
    const stack = new CommandStack<CanvasWorkspace, CanvasWorkspaceEdit>({
      state: workspace,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });

    stack.execute(addCanvasElement("scene_a", { id: "new", type: "rect" }, "root", "aa"));
    expect(stack.state.artboards[0]?.canvas.root.children?.map((child) => child.id)).toEqual([
      "first",
      "new",
      "container",
    ]);

    stack.undo();
    expect(stored(stack.state)).toEqual(stored(workspace));
    expect(batches).toHaveLength(2);
    expect(batches[1]?.[0]?.edit.type).toBe("canvas.removeElement");
  });

  it("restores a removed subtree with its parent and order", () => {
    const stack = new CommandStack<CanvasWorkspace>({ state: workspace });
    stack.execute(removeCanvasElement("scene_a", "container"));
    expect(stack.state.artboards[0]?.canvas.root.children?.map((child) => child.id)).toEqual([
      "first",
    ]);
    stack.undo();
    expect(stored(stack.state)).toEqual(stored(workspace));
  });

  it("restores optional properties that an update unset", () => {
    const stack = new CommandStack<CanvasWorkspace>({ state: workspace });
    stack.execute(updateCanvasElement("scene_a", "first", { opacity: 0.5 }));
    stack.execute(updateCanvasElement("scene_a", "first", {}, ["opacity"]));
    stack.undo();
    expect(stack.state.artboards[0]?.canvas.root.children?.[0]).toMatchObject({ opacity: 0.5 });
    stack.undo();
    expect(stack.state.artboards[0]?.canvas.root.children?.[0]).not.toHaveProperty("opacity");
  });

  it("reparents an Element and restores the original parent and rank", () => {
    const stack = new CommandStack<CanvasWorkspace>({ state: workspace });
    stack.execute(reparentCanvasElement("scene_a", "nested", "root", "aa"));
    expect(stack.state.artboards[0]?.canvas.root.children?.map((child) => child.id)).toEqual([
      "first",
      "nested",
      "container",
    ]);
    stack.undo();
    expect(stored(stack.state)).toEqual(stored(workspace));
  });
  it("moves and updates an Element as one undoable command", () => {
    const stack = new CommandStack<CanvasWorkspace>({ state: workspace });
    stack.execute(
      moveCanvasElement("scene_a", "nested", "root", "aa", {
        anchor: { horizontal: "left", vertical: "top", offsetX: 12, offsetY: 18 },
      }),
    );
    expect(stack.depth).toBe(1);
    expect(stack.state.artboards[0]?.canvas.root.children?.[1]).toMatchObject({
      id: "nested",
      anchor: { offsetX: 12, offsetY: 18 },
    });
    stack.undo();
    expect(stored(stack.state)).toEqual(stored(workspace));
  });

  it("moves a subtree between Canvases as one undoable batch", () => {
    const batches: CanvasWorkspaceEdit[][] = [];
    const stack = new CommandStack<CanvasWorkspace, CanvasWorkspaceEdit>({
      state: workspace,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });
    stack.execute(
      moveCanvasElementBetweenCanvases("scene_a", "block_b", "container", "block-root", "a"),
    );

    expect(stack.depth).toBe(1);
    expect(stack.state.artboards[0]?.canvas.root.children?.map((child) => child.id)).toEqual([
      "first",
    ]);
    expect(stack.state.artboards[1]?.canvas.root.children?.map((child) => child.id)).toEqual([
      "container",
    ]);
    expect(batches[0]?.map((edit) => edit.canvasId)).toEqual(["scene_a", "block_b", "block_b"]);

    stack.undo();
    expect(stored(stack.state)).toEqual(stored(workspace));
    stack.redo();
    expect(stack.state.artboards[1]?.canvas.root.children?.[0]?.id).toBe("container");
  });

  it("coalesces an artboard drag and preserves undo behavior", () => {
    const batches: CanvasWorkspaceEdit[][] = [];
    const stack = new CommandStack<CanvasWorkspace, CanvasWorkspaceEdit>({
      state: workspace,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });
    const drag = stack.beginGesture({ key: "artboard:block_b", label: "Move Artboard" });
    drag.update(moveCanvasArtboard("block_b", { x: 410, y: 5 }));
    drag.update(moveCanvasArtboard("block_b", { x: 420, y: 10 }));
    drag.commit();

    expect(stack.state.artboards[1]?.position).toEqual({ x: 420, y: 10 });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.[0]?.edit).toMatchObject({
      type: "canvas.moveArtboard",
      position: { x: 420, y: 10 },
    });
    stack.undo();
    expect(stack.state.artboards[1]?.position).toEqual({ x: 400, y: 0 });
  });

  it("coalesces repeated setters without crossing element lifetimes", () => {
    const edits: CanvasWorkspaceEdit[] = [
      {
        canvasId: "scene_a",
        edit: { type: "canvas.updateElement", elementId: "first", properties: { opacity: 0.1 } },
      },
      {
        canvasId: "scene_a",
        edit: { type: "canvas.updateElement", elementId: "first", properties: { opacity: 0.2 } },
      },
      { canvasId: "scene_a", edit: { type: "canvas.removeElement", elementId: "first" } },
      {
        canvasId: "scene_a",
        edit: { type: "canvas.updateElement", elementId: "first", properties: { opacity: 0.3 } },
      },
    ];
    expect(coalesceCanvasWorkspaceEdits(edits)).toEqual([edits[1], edits[2], edits[3]]);
  });

  it("replays dispatched edits to the same workspace state", () => {
    const batches: CanvasWorkspaceEdit[][] = [];
    const stack = new CommandStack<CanvasWorkspace, CanvasWorkspaceEdit>({
      state: workspace,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });
    stack.execute(updateCanvasElement("scene_a", "first", { opacity: 0.25 }));
    expect(stored(applyCanvasWorkspaceEdits(workspace, batches.flat()))).toEqual(
      stored(stack.state),
    );
  });
  it("updates a multi-selection as one undoable composite", () => {
    const batches: CanvasWorkspaceEdit[][] = [];
    const stack = new CommandStack<CanvasWorkspace, CanvasWorkspaceEdit>({
      state: workspace,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });

    stack.execute(
      updateCanvasElements("scene_a", [
        { elementId: "first", properties: { opacity: 0.5 } },
        { elementId: "nested", properties: { opacity: 0.5 } },
      ]),
    );
    expect(stack.state.artboards[0]?.canvas.root.children?.[0]).toMatchObject({ opacity: 0.5 });
    expect(stack.state.artboards[0]?.canvas.root.children?.[1]?.children?.[0]).toMatchObject({
      opacity: 0.5,
    });
    expect(batches[0]).toHaveLength(2);

    stack.undo();
    expect(stack.state.artboards[0]?.canvas.root.children?.[0]).not.toHaveProperty("opacity");
    expect(stack.state.artboards[0]?.canvas.root.children?.[1]?.children?.[0]).not.toHaveProperty(
      "opacity",
    );
    expect(batches).toHaveLength(2);
  });
});
