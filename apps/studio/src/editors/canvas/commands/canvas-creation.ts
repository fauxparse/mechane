import type { Element } from "@mechane/domain";
import type { CanvasClientRect } from "../graph/canvas-geometry";

/** Replaces fill axes with the rendered dimensions an absolute parent can honor. */
export function fixedFillSizing(
  element: Element,
  width: number,
  height: number,
): Record<string, unknown> {
  const sizing = { ...element.sizing };
  let changed = false;
  for (const [axis, value] of [
    ["width", width],
    ["height", height],
  ] as const) {
    if (sizing[axis]?.mode !== "fill") continue;
    sizing[axis] = { mode: "fixed", value };
    changed = true;
  }
  return changed ? { sizing } : {};
}

export type CanvasCreationTool = "select" | "rect" | "ellipse" | "text" | "image" | "frame";

/** Returns the dragged creation box, optionally constraining it to a square. */
export function creationRect(
  start: { x: number; y: number },
  current: { x: number; y: number },
  square = false,
): CanvasClientRect {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const width = square ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx);
  const height = square ? width : Math.abs(dy);
  return {
    x: dx < 0 ? start.x - width : start.x,
    y: dy < 0 ? start.y - height : start.y,
    width,
    height,
    right: dx < 0 ? start.x : start.x + width,
    bottom: dy < 0 ? start.y : start.y + height,
  };
}

export type CreationPreviewShape =
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number };

export function creationPreviewShape(
  tool: CanvasCreationTool,
  rect: Pick<CanvasClientRect, "x" | "y" | "width" | "height">,
): CreationPreviewShape {
  if (tool === "ellipse") {
    return {
      type: "ellipse",
      cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height / 2,
      rx: rect.width / 2,
      ry: rect.height / 2,
    };
  }
  return { type: "rect", x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function rankForInsertion(ranks: readonly string[], index: number): string {
  const sorted = [...ranks].sort((left, right) => left.localeCompare(right));
  if (sorted.length === 0) return "a";
  if (index <= 0) return `!${sorted[0]}`;
  if (index >= sorted.length) return `${sorted.at(-1)}~`;

  const left = sorted[index - 1]!;
  const right = sorted[index]!;
  // A simple "~" suffix is normally between its neighbors. Once ranks such as
  // "a~" and "a~~" exist, however, it equals the right neighbor and ties are
  // resolved by element ID instead of the requested layer position.
  for (const suffix of ["~", "!", " ", "0"]) {
    const candidate = `${left}${suffix}`;
    if (left.localeCompare(candidate) < 0 && candidate.localeCompare(right) < 0) {
      return candidate;
    }
  }
  return `${left}~!`;
}

/** Whether a canvas drag would change the Element's parent or its position in auto layout. */
export function dropChangesParentOrPosition(
  sourceParentId: string | null,
  sourceRank: string | null,
  targetParentId: string,
  targetIsAuto: boolean,
  targetRank: string,
): boolean {
  return targetParentId !== sourceParentId || (targetIsAuto && targetRank !== sourceRank);
}

/** Hides the insertion highlight when an absolute Element is still inside its current parent. */
export function showsReparentPreview(
  sourceParentId: string | null,
  sourceRank: string | null,
  sourceParentIsAuto: boolean,
  targetParentId: string,
  targetIsAuto: boolean,
  targetRank: string,
): boolean {
  if (
    !sourceParentIsAuto &&
    !targetIsAuto &&
    sourceParentId !== null &&
    sourceParentId === targetParentId
  ) {
    return false;
  }
  return dropChangesParentOrPosition(
    sourceParentId,
    sourceRank,
    targetParentId,
    targetIsAuto,
    targetRank,
  );
}

export function containingFrame(
  frames: readonly { id: string; rect: CanvasClientRect }[],
  draft: CanvasClientRect,
): string | null {
  return (
    frames
      .filter(
        ({ rect }) =>
          draft.x >= rect.x &&
          draft.y >= rect.y &&
          draft.right <= rect.right &&
          draft.bottom <= rect.bottom,
      )
      .sort(
        (left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height,
      )[0]?.id ?? null
  );
}
