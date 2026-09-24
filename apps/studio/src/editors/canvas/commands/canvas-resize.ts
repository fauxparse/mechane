import type { Element, Element as CanvasElement } from "@mechane/domain/canvas";
import { isPropertyFormula } from "@mechane/domain/property-values";
import { roundToLogicalPixel } from "../components/canvas-pixels";

/** One Element caught up in a resize, with everything needed to place it again afterwards. */
export interface CanvasResizeSubject {
  readonly elementId: string;
  readonly start: ResizeBox;
  readonly parent: ResizeBox | null;
  readonly autoParent: boolean;
}

export interface CanvasElementUpdate {
  readonly elementId: string;
  readonly properties: Record<string, unknown>;
  readonly unsetProperties: readonly string[];
}
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

/** The axes a handle drags: an edge handle moves one, a corner both. */
export function resizeAxes(handle: ResizeHandle): { width: boolean; height: boolean } {
  return {
    width: handle.includes("e") || handle.includes("w"),
    height: handle.includes("n") || handle.includes("s"),
  };
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
  const lock = element?.layout?.aspectRatio;
  if (!lock || typeof lock.ratio !== "number" || !Number.isFinite(lock.ratio) || lock.ratio <= 0) {
    return null;
  }
  return lock.ratio;
}

/**
 * Where a box inside `from` lands once `from` has been resized into `to`. Resizing a
 * multi-selection is this applied to each Element: the selection box is what the handle drags,
 * and everything inside keeps its relative place and proportion within it. An axis with no
 * extent cannot be scaled, so it grows by the drag instead — a 0%-wide bar must still resize.
 */
export function scaleWithin(box: ResizeBox, from: ResizeBox, to: ResizeBox): ResizeBox {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;
  return {
    x: to.x + (box.x - from.x) * scaleX,
    y: to.y + (box.y - from.y) * scaleY,
    width: Math.max(
      MIN_ELEMENT_SIZE,
      from.width > 0 ? box.width * scaleX : box.width + to.width - from.width,
    ),
    height: Math.max(
      MIN_ELEMENT_SIZE,
      from.height > 0 ? box.height * scaleY : box.height + to.height - from.height,
    ),
  };
}

/**
 * Writes resized dimensions into the canonical `sizing` object, one axis at a time; an axis
 * the drag did not touch keeps its mode. A Formula-driven axis keeps its Formula and takes
 * the dragged size as its fallback, the literal the Artboard shows while the Formula reads
 * nothing.
 */
export function fixedResizeProperties(
  element: Element,
  size: { readonly width?: number; readonly height?: number },
): Record<string, unknown> {
  const sizing = { ...element.sizing };
  for (const axis of ["width", "height"] as const) {
    const value = size[axis];
    if (value === undefined) continue;
    const current = sizing[axis]?.value;
    sizing[axis] = isPropertyFormula(current)
      ? { mode: "fixed", value: { ...current, fallback: { value, unit: "px" } } }
      : { mode: "fixed", value };
  }
  const properties: Record<string, unknown> = { sizing };
  if (element.layout) properties.layout = element.layout;
  return properties;
}

/** Removes an Element's aspect-ratio lock from its canonical layout property. */
export function unlockedAspectRatioProperties(element: Element): {
  properties: Record<string, unknown>;
  unsetProperties: readonly string[];
} {
  if (!element.layout || !("aspectRatio" in element.layout)) {
    return { properties: {}, unsetProperties: [] };
  }

  const { aspectRatio: _aspectRatio, ...layout } = element.layout;
  return Object.keys(layout).length > 0
    ? { properties: { layout }, unsetProperties: [] }
    : { properties: {}, unsetProperties: ["layout"] };
}

export function resizeElementUpdate(input: {
  readonly subject: CanvasResizeSubject;
  readonly selectionStart: ResizeBox;
  readonly requested: ResizeBox;
  readonly element: CanvasElement | null;
  readonly handle: ResizeHandle;
  readonly zoom: number;
}): CanvasElementUpdate {
  const { subject, selectionStart, requested, element, handle, zoom } = input;
  const next = scaleWithin(subject.start, selectionStart, requested);
  const axes = resizeAxes(handle);
  const size = {
    ...(axes.width ? { width: Math.max(1, roundToLogicalPixel(next.width, zoom)) } : {}),
    ...(axes.height ? { height: Math.max(1, roundToLogicalPixel(next.height, zoom)) } : {}),
  };
  const properties = fixedResizeProperties(
    element ?? { id: subject.elementId, type: "rect" },
    size,
  );
  const unlock = !isCornerHandle(handle)
    ? element
      ? unlockedAspectRatioProperties(element)
      : { properties: {}, unsetProperties: ["aspectRatio"] }
    : { properties: {}, unsetProperties: [] };
  Object.assign(properties, unlock.properties);
  if (!subject.autoParent && subject.parent) {
    properties.anchor = {
      horizontal: "left",
      vertical: "top",
      offsetX: roundToLogicalPixel(next.x - subject.parent.x, zoom),
      offsetY: roundToLogicalPixel(next.y - subject.parent.y, zoom),
    };
  }
  return { elementId: subject.elementId, properties, unsetProperties: unlock.unsetProperties };
}
/**
 * The box a resize drag asks for. The edge opposite the handle is what stays put, which is what
 * makes dragging the west edge grow the Element leftwards rather than move it. An axis with no
 * extent has both its handles on one point, so whichever one the pointer caught, the box grows
 * the way the pointer goes.
 */
export function resizeBox(
  start: ResizeBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  options: { constrain?: boolean; ratio?: number; min?: number } = {},
): ResizeBox {
  const min = options.min ?? MIN_ELEMENT_SIZE;
  const horizontal = handle.includes("w") || handle.includes("e");
  const vertical = handle.includes("n") || handle.includes("s");
  const flatX = horizontal && start.width === 0;
  const flatY = vertical && start.height === 0;
  const movesWest = flatX ? dx < 0 : handle.includes("w");
  const movesEast = !flatX && handle.includes("e");
  const movesNorth = flatY ? dy < 0 : handle.includes("n");
  const movesSouth = !flatY && handle.includes("s");

  let width = Math.max(
    min,
    flatX ? Math.abs(dx) : start.width + (movesEast ? dx : 0) - (movesWest ? dx : 0),
  );
  let height = Math.max(
    min,
    flatY ? Math.abs(dy) : start.height + (movesSouth ? dy : 0) - (movesNorth ? dy : 0),
  );

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
