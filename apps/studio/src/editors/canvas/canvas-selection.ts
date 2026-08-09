import type { CanvasClientRect } from "./canvas-geometry";

export interface CanvasSelection {
  readonly artId: string | null;
  readonly elementIds: readonly string[];
}

export interface SelectionCandidate {
  readonly id: string;
  readonly rect: CanvasClientRect;
}

export function rectContainsPoint(rect: CanvasClientRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.right && y >= rect.y && y <= rect.bottom;
}

export function rectContainsRect(outer: CanvasClientRect, inner: CanvasClientRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}

/** Full containment is intentional: a rubberband never selects a clipped partial Element. */
export function containedSelection(
  candidates: readonly SelectionCandidate[],
  rubberband: CanvasClientRect,
): string[] {
  return candidates.reduce<string[]>((selectedIds, { id, rect }) => {
    if (rectContainsRect(rubberband, rect)) selectedIds.push(id);
    return selectedIds;
  }, []);
}

export function toggleSelection(
  current: readonly string[],
  id: string,
  additive: boolean,
): string[] {
  if (!additive) return [id];
  return current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
}

export function normalizeSelection(selection: CanvasSelection): CanvasSelection {
  if (selection.artId === null) return { artId: null, elementIds: [] };
  return { artId: selection.artId, elementIds: [...new Set(selection.elementIds)] };
}

export function selectionRect(rects: readonly CanvasClientRect[]): CanvasClientRect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}
export function topmostPaintedElementAtPoint(
  artboard: HTMLElement,
  x: number,
  y: number,
  penetrate = false,
): HTMLElement | null {
  const elements = [...artboard.querySelectorAll<HTMLElement>("[data-element-id]")];
  const painted = elements.reverse().find((element) => {
    if (element.dataset.elementRoot === "true") return false;
    if (element.dataset.elementPainted !== "true") return false;
    const rect = element.getBoundingClientRect();
    return rectContainsPoint(
      {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      },
      x,
      y,
    );
  });
  if (!painted || !penetrate) return painted ?? null;
  const parentId = painted.dataset.elementParentId;
  return parentId
    ? (elements.find((element) => element.dataset.elementId === parentId) ?? painted)
    : painted;
}
