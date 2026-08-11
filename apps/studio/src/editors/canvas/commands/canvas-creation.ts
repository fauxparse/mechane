import type { Element } from "@mechane/domain";

import type { CanvasClientRect } from "../graph/canvas-geometry";

/** Replaces fill axes with the rendered dimensions an absolute parent can honor. */
export function fixedFillSizing(
  element: Element,
  width: number,
  height: number,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const layout = element.layout ? { ...element.layout } : undefined;
  const sizing = element.sizing ? { ...element.sizing } : undefined;
  let layoutChanged = false;
  let sizingChanged = false;
  for (const [axis, value] of [
    ["width", width],
    ["height", height],
  ] as const) {
    const authored = element.layout?.[axis] ?? element.sizing?.[axis] ?? element[axis];
    if (authored?.mode !== "fill") continue;
    if (layout?.[axis]?.mode === "fill") {
      layout[axis] = { mode: "fixed", value };
      layoutChanged = true;
    } else if (sizing?.[axis]?.mode === "fill") {
      sizing[axis] = { mode: "fixed", value };
      sizingChanged = true;
    } else {
      properties[axis] = { mode: "fixed", value };
    }
  }
  if (layoutChanged) properties.layout = layout;
  if (sizingChanged) properties.sizing = sizing;
  return properties;
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

export function rankForInsertion(ranks: readonly string[], index: number): string {
  const sorted = [...ranks].sort((left, right) => left.localeCompare(right));
  if (sorted.length === 0) return "a";
  if (index <= 0) return `!${sorted[0]}`;
  if (index >= sorted.length) return `${sorted.at(-1)}~`;
  return `${sorted[index - 1]}~`;
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
