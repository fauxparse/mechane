import type { Position } from "@mechane/domain";

export interface CanvasPlacementSize {
  width: number;
  height: number;
}

const DEFAULT_SIZE: CanvasPlacementSize = { width: 720, height: 420 };
const DEFAULT_GAP = 40;

function overlaps(
  left: Position,
  right: Position,
  size: CanvasPlacementSize,
  gap: number,
): boolean {
  return (
    left.x < right.x + size.width + gap &&
    left.x + size.width + gap > right.x &&
    left.y < right.y + size.height + gap &&
    left.y + size.height + gap > right.y
  );
}

/** Moves a newly created Canvas right until it clears every existing artboard. */
export function placeCanvasPosition(
  preferred: Position,
  occupied: readonly Position[],
  size: CanvasPlacementSize = DEFAULT_SIZE,
  gap = DEFAULT_GAP,
): Position {
  let position = { ...preferred };
  while (occupied.some((candidate) => overlaps(position, candidate, size, gap))) {
    position = { x: position.x + size.width + gap, y: position.y };
  }
  return position;
}
