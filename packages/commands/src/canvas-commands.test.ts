import type { CanvasDocument } from "./canvas-commands";
import { addElement, removeElement, updateElementProperties } from "./canvas-commands";
import { CANVAS_COMMAND_TYPES, coalesceCanvasEdits } from "./canvas-edits";
import { describe, expect, it } from "vitest";

const CANVAS: CanvasDocument = {
  id: "canvas:test",
  kind: "scene",
  root: {
    id: "frame:root",
    type: "frame",
    children: [
      {
        id: "frame:child",
        type: "frame",
        rank: "a",
        children: [{ id: "rect:child", type: "rect", rank: "a" }],
      },
      { id: "rect:peer", type: "rect", rank: "b" },
    ],
  },
};

describe("Canvas commands", () => {
  it("deletes a subtree and its inverse restores it", () => {
    const applied = removeElement("frame:child").apply(CANVAS);
    expect(applied.state.root.children).toHaveLength(1);
    expect(applied.state.root.children?.[0]?.id).toBe("rect:peer");
    expect(applied.inverse.apply(applied.state).state).toEqual(CANVAS);
  });

  it("updates a property and restores an absent property as absent", () => {
    const applied = updateElementProperties("rect:peer", { opacity: 0.5 }).apply(CANVAS);
    expect(applied.state.root.children?.[1]?.opacity).toBe(0.5);
    const restored = applied.inverse.apply(applied.state).state;
    expect(restored.root.children?.[1]).not.toHaveProperty("opacity");
  });

  it("coalesces repeated absolute Canvas writes", () => {
    const edits = [
      {
        type: CANVAS_COMMAND_TYPES.updateElement,
        elementId: "rect:peer",
        properties: { opacity: 0.2 },
      },
      {
        type: CANVAS_COMMAND_TYPES.updateElement,
        elementId: "rect:peer",
        properties: { opacity: 0.8 },
      },
    ] as const;
    expect(coalesceCanvasEdits(edits)).toEqual([edits[1]]);
  });

  it("adds a leaf at the requested parent and rank", () => {
    const element = { id: "text:new", type: "text" as const, content: "Hello" };
    const applied = addElement(element, "frame:root", "c").apply(CANVAS);
    expect(applied.state.root.children?.at(-1)).toMatchObject(element);
    expect(applied.state.root.children?.at(-1)?.rank).toBe("c");
    expect(applied.inverse.apply(applied.state).state).toEqual(CANVAS);
  });
});
