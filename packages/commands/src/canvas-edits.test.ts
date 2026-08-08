import { describe, expect, it } from "vitest";

import type { Canvas } from "@mechane/domain";

import { applyCanvasEdits, CANVAS_COMMAND_TYPES, CanvasEditError } from "./canvas-edits";

const canvas: Canvas = {
  root: {
    id: "root",
    type: "frame",
    children: [
      { id: "first", type: "rect", rank: "a" },
      { id: "second", type: "frame", rank: "b", children: [] },
    ],
  },
};

describe("applyCanvasEdits", () => {
  it("adds and orders a child without mutating the source", () => {
    const next = applyCanvasEdits(canvas, [
      {
        type: CANVAS_COMMAND_TYPES.addElement,
        element: { id: "middle", type: "text", content: "hello" },
        parentId: "root",
        rank: "aa",
      },
    ]);

    expect(next.root.children?.map((child) => child.id)).toEqual(["first", "middle", "second"]);
    expect(canvas.root.children?.map((child) => child.id)).toEqual(["first", "second"]);
  });

  it("removes a subtree and updates element properties", () => {
    const next = applyCanvasEdits(canvas, [
      {
        type: CANVAS_COMMAND_TYPES.updateElement,
        elementId: "first",
        properties: { opacity: 0.5 },
      },
      { type: CANVAS_COMMAND_TYPES.removeElement, elementId: "second" },
    ]);

    expect(next.root.children).toEqual([{ id: "first", type: "rect", rank: "a", opacity: 0.5 }]);
  });

  it("rejects cycles and unknown parents", () => {
    expect(() =>
      applyCanvasEdits(canvas, [
        {
          type: CANVAS_COMMAND_TYPES.reparentElement,
          elementId: "second",
          parentId: "second",
          rank: "a",
        },
      ]),
    ).toThrow(CanvasEditError);
    expect(() =>
      applyCanvasEdits(canvas, [
        {
          type: CANVAS_COMMAND_TYPES.addElement,
          element: { id: "new", type: "rect" },
          parentId: "missing",
          rank: "a",
        },
      ]),
    ).toThrow(CanvasEditError);
  });
});
