import type { Element, FrameElement } from "@mechane/domain";

import { rankForInsertion } from "../commands/canvas-creation";
import { layerChildren } from "./canvas-layers";

/** Where a layer row drop lands relative to the row under the pointer. */
export type LayerDropZone = "before" | "after" | "inside";

export interface LayerDropPlacement {
  readonly parentId: string;
  readonly rank: string;
}

/**
 * Rows are 8px tall by convention; the middle band of a Frame row reparents into it,
 * the outer bands reorder around it. Non-Frame rows only ever reorder.
 */
export function layerDropZone(offsetY: number, height: number, isFrame: boolean): LayerDropZone {
  if (height <= 0) return "before";
  const ratio = offsetY / height;
  if (!isFrame) return ratio < 0.5 ? "before" : "after";
  if (ratio < 0.25) return "before";
  if (ratio > 0.75) return "after";
  return "inside";
}

/**
 * The zone for a whole navigator row. A Canvas row is the exception: Canvases have no ordering to
 * insert into (#222 keeps them out of the drag entirely), so anywhere on the row means "into this
 * Canvas" rather than before or after it.
 */
export function layerRowDropZone(
  row: {
    kind: "canvas" | "element";
    elementKind?: string;
    hasChildren?: boolean;
    expanded?: boolean;
  },
  offsetY: number,
  height: number,
): LayerDropZone {
  if (row.kind === "canvas") return "inside";
  const zone = layerDropZone(offsetY, height, row.elementKind === "frame");
  // Below an *expanded* parent, the next row on screen is its own first child — so that is where
  // the indicator points, and "after" has to mean "in, at the top" rather than "next sibling".
  // Collapsed, there is no child row in the way and "after" means what it says.
  if (zone === "after" && row.expanded && row.hasChildren) return "inside";
  return zone;
}

function findParent(
  root: FrameElement,
  elementId: string,
): { parent: FrameElement; element: Element } | null {
  const stack: FrameElement[] = [root];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    for (const child of frame.children ?? []) {
      if (child.id === elementId) return { parent: frame, element: child };
      if (child.type === "frame") stack.push(child);
    }
  }
  return null;
}

function subtreeIds(element: Element): string[] {
  const ids = [element.id];
  if (element.type === "frame") {
    for (const child of element.children ?? []) ids.push(...subtreeIds(child));
  }
  return ids;
}

/**
 * Resolves a layer-navigator drop into the parent and rank a reparent command needs,
 * or null when the drop is a no-op or would move a Frame inside itself.
 */
export function layerDropPlacement(
  root: FrameElement,
  draggedId: string,
  targetId: string,
  zone: LayerDropZone,
): LayerDropPlacement | null {
  if (draggedId === targetId || draggedId === root.id) return null;
  const dragged = findParent(root, draggedId);
  if (!dragged) return null;
  // Dropping a Frame into its own subtree would detach that subtree from the tree.
  if (subtreeIds(dragged.element).includes(targetId)) return null;

  const target =
    targetId === root.id ? { parent: root, element: root as Element } : findParent(root, targetId);
  if (!target) return null;

  const dropIntoTarget = zone === "inside" || targetId === root.id;
  const parent = dropIntoTarget ? target.element : target.parent;
  if (parent.type !== "frame") return null;

  // `layerChildren` is already in inspector order (frontmost first), while ranks sort in the
  // opposite direction. Keep the inspector order for target indexing, but derive the insertion
  // rank from the corresponding rank-sorted position.
  const ordered = [...layerChildren(parent)].filter((child) => child.id !== draggedId);
  const inspectorIndex = dropIntoTarget
    ? ordered.length
    : (() => {
        const at = ordered.findIndex((child) => child.id === targetId);
        if (at < 0) return ordered.length;
        return zone === "before" ? at : at + 1;
      })();
  const rankIndex = dropIntoTarget ? ordered.length : ordered.length - inspectorIndex;
  const rank = rankForInsertion(
    ordered.map((child) => child.rank ?? ""),
    rankIndex,
  );
  if (parent.id === dragged.parent.id && rank === (dragged.element.rank ?? "")) return null;
  return { parentId: parent.id, rank };
}

/** Resolves a drop into a Canvas that is different from the dragged Element's source Canvas. */
export function layerDropPlacementInCanvas(
  root: FrameElement,
  targetId: string,
  zone: LayerDropZone,
): LayerDropPlacement | null {
  const target =
    targetId === root.id ? { parent: root, element: root as Element } : findParent(root, targetId);
  if (!target) return null;
  const dropIntoTarget = zone === "inside" || targetId === root.id;
  const parent = dropIntoTarget ? target.element : target.parent;
  if (parent.type !== "frame") return null;

  const ordered = [...layerChildren(parent)];
  const inspectorIndex = dropIntoTarget
    ? ordered.length
    : (() => {
        const at = ordered.findIndex((child) => child.id === targetId);
        if (at < 0) return ordered.length;
        return zone === "before" ? at : at + 1;
      })();
  const rankIndex = dropIntoTarget ? ordered.length : ordered.length - inspectorIndex;
  return {
    parentId: parent.id,
    rank: rankForInsertion(
      ordered.map((child) => child.rank ?? ""),
      rankIndex,
    ),
  };
}
