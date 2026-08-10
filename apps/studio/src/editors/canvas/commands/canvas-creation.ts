import type { CanvasClientRect } from "../graph/canvas-geometry";

export type CanvasCreationTool = "select" | "rect" | "text" | "image" | "frame";

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
