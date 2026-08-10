import type { Element, FrameElement } from "@mechane/domain";

import { rankForInsertion } from "./canvas-creation";
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
  row: { kind: "canvas" | "element"; elementKind?: string },
  offsetY: number,
  height: number,
): LayerDropZone {
  if (row.kind === "canvas") return "inside";
  return layerDropZone(offsetY, height, row.elementKind === "frame");
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

  // The navigator paints top-of-stack first, so a row's visual "before" is a higher rank.
  const ordered = [...layerChildren(parent)].reverse().filter((child) => child.id !== draggedId);
  const index = dropIntoTarget
    ? ordered.length
    : (() => {
        const at = ordered.findIndex((child) => child.id === targetId);
        if (at < 0) return ordered.length;
        return zone === "before" ? at + 1 : at;
      })();

  const rank = rankForInsertion(
    ordered.map((child) => child.rank ?? ""),
    index,
  );
  if (parent.id === dragged.parent.id && rank === (dragged.element.rank ?? "")) return null;
  return { parentId: parent.id, rank };
}
