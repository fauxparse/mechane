import type { Element } from "@mechane/domain";

/** Corner handles resize two axes at once; edge handles resize one. */
export const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

export interface ResizeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Nothing may be resized away entirely — a zero-width Element could never be grabbed again. */
export const MIN_ELEMENT_SIZE = 1;

export function isCornerHandle(handle: ResizeHandle): boolean {
  return handle.length === 2;
}

/** Where a handle sits in the selection box, as a fraction of its width and height. */
export function handlePosition(handle: ResizeHandle): { x: number; y: number } {
  return {
    x: handle.includes("w") ? 0 : handle.includes("e") ? 1 : 0.5,
    y: handle.includes("n") ? 0 : handle.includes("s") ? 1 : 0.5,
  };
}

export function handleCursor(handle: ResizeHandle): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  return handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize";
}

/** The aspect ratio an Element is locked to, if any. Width over height. */
export function lockedAspectRatio(element: Element | null | undefined): number | null {
  const lock = element?.layout?.aspectRatio ?? element?.aspectRatio;
  if (!lock || typeof lock.ratio !== "number" || !Number.isFinite(lock.ratio) || lock.ratio <= 0) {
    return null;
  }
  return lock.ratio;
}

/**
 * Where a box inside `from` lands once `from` has been resized into `to`. Resizing a
 * multi-selection is this applied to each Element: the selection box is what the handle drags,
 * and everything inside keeps its relative place and proportion within it.
 */
export function scaleWithin(box: ResizeBox, from: ResizeBox, to: ResizeBox): ResizeBox {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;
  return {
    x: to.x + (box.x - from.x) * scaleX,
    y: to.y + (box.y - from.y) * scaleY,
    width: Math.max(MIN_ELEMENT_SIZE, box.width * scaleX),
    height: Math.max(MIN_ELEMENT_SIZE, box.height * scaleY),
  };
}

/** Writes resized dimensions into the same sizing vocabulary the Element already uses. */
export function fixedResizeProperties(
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
    if (layout?.[axis]) {
      layout[axis] = { mode: "fixed", value };
      layoutChanged = true;
    } else if (sizing?.[axis]) {
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

/**
 * The box a resize drag asks for. The edge opposite the handle is what stays put, which is what
 * makes dragging the west edge grow the Element leftwards rather than move it.
 */
export function resizeBox(
  start: ResizeBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  options: { constrain?: boolean; ratio?: number; min?: number } = {},
): ResizeBox {
  const min = options.min ?? MIN_ELEMENT_SIZE;
  const movesWest = handle.includes("w");
  const movesEast = handle.includes("e");
  const movesNorth = handle.includes("n");
  const movesSouth = handle.includes("s");

  let width = Math.max(min, start.width + (movesEast ? dx : 0) - (movesWest ? dx : 0));
  let height = Math.max(min, start.height + (movesSouth ? dy : 0) - (movesNorth ? dy : 0));

  // Only corners can honour a ratio: an edge drag has one free axis, so forcing the other would
  // make the handle disobey the pointer.
  const ratio =
    options.ratio ?? (start.height > 0 && start.width > 0 ? start.width / start.height : null);
  if (options.constrain && isCornerHandle(handle) && ratio) {
    // Follow whichever axis the pointer pushed further, so the drag tracks the intended direction.
    if (Math.abs(width - start.width) >= Math.abs(height - start.height)) {
      height = Math.max(min, width / ratio);
      width = height * ratio;
    } else {
      width = Math.max(min, height * ratio);
      height = width / ratio;
    }
  }

  return {
    x: movesWest ? start.x + start.width - width : start.x,
    y: movesNorth ? start.y + start.height - height : start.y,
    width,
    height,
  };
}
