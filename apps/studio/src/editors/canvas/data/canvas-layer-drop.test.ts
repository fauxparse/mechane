import { applyCanvasEdits, CANVAS_COMMAND_TYPES } from "@mechane/commands";
import { describe, expect, it } from "vitest";

import type { FrameElement } from "@mechane/domain";

import {
  layerDropPlacement,
  layerDropPlacementInCanvas,
  layerDropZone,
  layerRowDropZone,
} from "./canvas-layer-drop";
import { layerChildren } from "./canvas-layers";

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

describe("Canvas row drop zones", () => {
  it("treats the whole Canvas row as 'into this Canvas'", () => {
    expect(layerRowDropZone({ kind: "canvas" }, 1, 32)).toBe("inside");
    expect(layerRowDropZone({ kind: "canvas" }, 31, 32)).toBe("inside");
  });

  it("sends a drop below an expanded parent in as its first child, not past it", () => {
    // The row under the indicator is the parent's own first child, so that is where it must land.
    expect(
      layerRowDropZone(
        { kind: "element", elementKind: "frame", hasChildren: true, expanded: true },
        31,
        32,
      ),
    ).toBe("inside");
  });

  it("leaves 'after' alone when the parent is collapsed or childless", () => {
    expect(
      layerRowDropZone(
        { kind: "element", elementKind: "frame", hasChildren: true, expanded: false },
        31,
        32,
      ),
    ).toBe("after");
    expect(
      layerRowDropZone(
        { kind: "element", elementKind: "frame", hasChildren: false, expanded: true },
        31,
        32,
      ),
    ).toBe("after");
  });

  it("still gives an Element row its three bands", () => {
    expect(layerRowDropZone({ kind: "element", elementKind: "frame" }, 16, 32)).toBe("inside");
    expect(layerRowDropZone({ kind: "element", elementKind: "frame" }, 1, 32)).toBe("before");
    expect(layerRowDropZone({ kind: "element", elementKind: "rect" }, 16, 32)).toBe("after");
  });
  it("never assigns an inside zone to a Slot row", () => {
    expect(layerRowDropZone({ kind: "element", elementKind: "slot" }, 16, 32)).toBe("after");
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

  it("resolves a foreign-Canvas drop without requiring the source Element", () => {
    const placement = layerDropPlacementInCanvas(root, "group", "inside");
    expect(placement).toEqual({ parentId: "group", rank: "a~" });
  });
  it("refuses to place an Element inside a Slot", () => {
    const rootWithSlot: FrameElement = {
      ...root,
      children: [
        ...(root.children ?? []),
        { id: "slot", type: "slot", rank: "d", blockId: "block" },
      ],
    };

    expect(layerDropPlacement(rootWithSlot, "back", "slot", "inside")).toBeNull();
    expect(layerDropPlacementInCanvas(rootWithSlot, "slot", "inside")).toBeNull();
  });

  it("maps inspector before/after drops to the matching rank order", () => {
    const threeChildren: FrameElement = {
      ...root,
      children: [
        { id: "back", type: "rect", rank: "a" },
        { id: "middle", type: "rect", rank: "b" },
        { id: "front", type: "rect", rank: "c" },
      ],
    };
    expect(layerDropPlacement(threeChildren, "front", "back", "before")).toEqual({
      parentId: "root",
      rank: "a~",
    });
    expect(layerDropPlacement(threeChildren, "back", "front", "after")).toEqual({
      parentId: "root",
      rank: "b~",
    });
    const movedFront = applyCanvasEdits({ root: threeChildren }, [
      {
        type: CANVAS_COMMAND_TYPES.reparentElement,
        elementId: "front",
        parentId: "root",
        rank: "a~",
      },
    ]);
    expect(layerChildren(movedFront.root).map((child) => child.id)).toEqual([
      "middle",
      "front",
      "back",
    ]);
  });
  it("places the last inspector row between the first and second rows", () => {
    const fourChildren: FrameElement = {
      ...root,
      children: [
        { id: "four", type: "rect", rank: "a" },
        { id: "three", type: "rect", rank: "b" },
        { id: "two", type: "rect", rank: "c" },
        { id: "one", type: "rect", rank: "d" },
      ],
    };
    const placement = layerDropPlacement(fourChildren, "four", "one", "after");
    expect(placement).toEqual({ parentId: "root", rank: "c~" });
    const moved = applyCanvasEdits({ root: fourChildren }, [
      {
        type: CANVAS_COMMAND_TYPES.reparentElement,
        elementId: "four",
        parentId: placement!.parentId,
        rank: placement!.rank,
      },
    ]);
    expect(layerChildren(moved.root).map((child) => child.id)).toEqual([
      "one",
      "four",
      "two",
      "three",
    ]);
    expect(layerDropPlacement(fourChildren, "four", "two", "before")).toEqual(placement);
  });
  it("avoids a rank tie when generated ranks are already nested", () => {
    const nestedRanks: FrameElement = {
      ...root,
      children: [
        { id: "four", type: "rect", rank: "!a" },
        { id: "three", type: "rect", rank: "a" },
        { id: "two", type: "rect", rank: "a~" },
        { id: "one", type: "rect", rank: "a~~" },
      ],
    };
    const placement = layerDropPlacement(nestedRanks, "four", "one", "after");
    expect(placement).toEqual({ parentId: "root", rank: "a~!" });
    const moved = applyCanvasEdits({ root: nestedRanks }, [
      {
        type: CANVAS_COMMAND_TYPES.reparentElement,
        elementId: "four",
        parentId: placement!.parentId,
        rank: placement!.rank,
      },
    ]);
    expect(layerChildren(moved.root).map((child) => child.id)).toEqual([
      "one",
      "four",
      "two",
      "three",
    ]);
  });
});
