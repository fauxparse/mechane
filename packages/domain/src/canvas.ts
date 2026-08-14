/**
 * The persisted Canvas/Element tree rendered by the shared DOM renderer.
 *
 * Canvas is deliberately independent of React and storage. The API assembles
 * this tree from relational rows; studio and player consume the same value.
 */
import { isPropertyConnection } from "./property-values";
import type { PropertyConnection, PropertyValue } from "./property-values";
export const ELEMENT_KINDS = ["rect", "ellipse", "text", "image", "frame"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const SIZE_MODES = ["hug", "fill", "fixed"] as const;
export type SizeMode = (typeof SIZE_MODES)[number];
export type SizeUnit = "px" | "%";
export type SizeValue = number | { value: number; unit: SizeUnit };

export interface AxisSize {
  mode: SizeMode;
  value?: SizeValue | PropertyConnection;
}

export type Rotation = 0 | 90 | 180 | 270;
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "plus-lighter"
  | "plus-darker";
export type FrameLayoutMode = "absolute" | "auto";
export type FrameGap = number | "auto";
export type LayoutDirection = "horizontal" | "vertical";
export type LayoutAlignment =
  | "start"
  | "center"
  | "centre"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type Anchor = "left" | "center" | "centre" | "right" | "top" | "bottom";
export type TextAlign = "left" | "center" | "right" | "justify" | "start" | "end";
export type ObjectFit = "fill" | "contain" | "cover" | "none" | "scale-down";

export interface GradientStop {
  color?: string;
  position: number;
}

export interface GradientFill {
  kind?: "linear" | "radial";
  type?: "linear" | "radial";
  stops: readonly GradientStop[];
  angle?: number;
}

export type Fill = string | GradientFill;

export interface AspectRatioLock {
  ratio: number;
  driver: "width" | "height";
}

export interface ElementLayout {
  width?: AxisSize;
  height?: AxisSize;
  minWidth?: SizeValue;
  maxWidth?: SizeValue;
  minHeight?: SizeValue;
  maxHeight?: SizeValue;
  rotation?: Rotation;
  aspectRatio?: AspectRatioLock;
}

export interface ElementSizing {
  width?: AxisSize;
  height?: AxisSize;
  minWidth?: SizeValue;
  maxWidth?: SizeValue;
  minHeight?: SizeValue;
  maxHeight?: SizeValue;
}

export interface ElementBase {
  id: string;
  type: ElementKind;
  name?: string | null;
  rank?: string;
  hidden?: boolean;
  layout?: ElementLayout;
  sizing?: ElementSizing;
  width?: AxisSize;
  height?: AxisSize;
  minWidth?: SizeValue;
  maxWidth?: SizeValue;
  minHeight?: SizeValue;
  maxHeight?: SizeValue;
  rotation?: Rotation;
  aspectRatio?: AspectRatioLock;
  opacity?: PropertyValue<number>;
  blendMode?: BlendMode;
  alignSelf?: LayoutAlignment;
  fill?: PropertyValue<Fill>;
  anchor?: AnchorPosition;
  children?: readonly Element[];
}

export interface CornerRadius {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
}

export type CornerRadiusValue = number | CornerRadius;

export interface CornerRadiusElement extends ElementBase {
  cornerRadius?: PropertyValue<CornerRadiusValue>;
}

export interface RectElement extends CornerRadiusElement {
  type: "rect";
}

export interface EllipseElement extends ElementBase {
  type: "ellipse";
}

export interface TextElement extends ElementBase {
  type: "text";
  content?: PropertyValue<string>;
  text?: PropertyValue<string>;
  value?: PropertyValue<string>;
  color?: PropertyValue<string>;
  fontFamily?: PropertyValue<string>;
  fontSize?: PropertyValue<number>;
  fontWeight?: PropertyValue<string | number>;
  lineHeight?: PropertyValue<string | number>;
  letterSpacing?: PropertyValue<number>;
  textAlign?: PropertyValue<TextAlign>;
}

export interface ImageElement extends ElementBase {
  type: "image";
  src?: PropertyValue<string>;
  image?: PropertyValue<string>;
  source?: PropertyValue<string>;
  alt?: PropertyValue<string>;
  objectFit?: PropertyValue<ObjectFit>;
}

export interface FrameElement extends CornerRadiusElement {
  type: "frame";
  layoutMode?: FrameLayoutMode;
  autoLayout?: boolean;
  direction?: LayoutDirection;
  gap?: FrameGap;
  padding?: number | Padding;
  alignPrimary?: LayoutAlignment;
  alignCounter?: LayoutAlignment;
  primaryAlign?: LayoutAlignment;
  counterAlign?: LayoutAlignment;
  clip?: boolean;
}

export interface Padding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export function hasCornerRadius(element: Element): element is CornerRadiusElement {
  return element.type === "rect" || element.type === "frame";
}

export interface AnchorPosition {
  horizontal?: Extract<Anchor, "left" | "center" | "centre" | "right">;
  vertical?: Extract<Anchor, "top" | "center" | "centre" | "bottom">;
  offsetX?: number;
  offsetY?: number;
}

export type Element = RectElement | EllipseElement | TextElement | ImageElement | FrameElement;

export interface Canvas {
  root: FrameElement;
  kind?: "scene" | "block";
}

export class InvalidCanvasError extends Error {
  constructor(reason: string) {
    super(`Invalid Canvas: ${reason}`);
    this.name = "InvalidCanvasError";
  }
}

const ROTATIONS: Record<number, true> = { 0: true, 90: true, 180: true, 270: true };

function assertSizeValue(value: SizeValue, context: string): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new InvalidCanvasError(`${context} must be a finite non-negative number.`);
    }
    return;
  }
  if (
    (value.unit !== "px" && value.unit !== "%") ||
    !Number.isFinite(value.value) ||
    value.value < 0
  ) {
    throw new InvalidCanvasError(`${context} must use a finite non-negative px or % value.`);
  }
}

function assertAxisSize(size: AxisSize | undefined, context: string): void {
  if (!size) return;
  if (!SIZE_MODES.includes(size.mode)) {
    throw new InvalidCanvasError(`${context} has an unknown sizing mode.`);
  }
  if (size.mode === "fixed" && size.value === undefined) {
    throw new InvalidCanvasError(`${context} fixed sizing requires a value.`);
  }
  if (size.value !== undefined && !isPropertyConnection(size.value)) {
    assertSizeValue(size.value, `${context} value`);
  }
}

function assertLayout(element: Element): void {
  const sizing = element.sizing;
  for (const [axis, size] of [
    ["width", element.width],
    ["height", element.height],
    ["layout.width", element.layout?.width],
    ["layout.height", element.layout?.height],
    ["sizing.width", sizing?.width],
    ["sizing.height", sizing?.height],
  ] as const) {
    assertAxisSize(size, `${element.id} ${axis}`);
  }
  for (const [name, value] of [
    ["minWidth", element.minWidth],
    ["maxWidth", element.maxWidth],
    ["minHeight", element.minHeight],
    ["maxHeight", element.maxHeight],
    ["layout.minWidth", element.layout?.minWidth],
    ["layout.maxWidth", element.layout?.maxWidth],
    ["layout.minHeight", element.layout?.minHeight],
    ["layout.maxHeight", element.layout?.maxHeight],
    ["sizing.minWidth", sizing?.minWidth],
    ["sizing.maxWidth", sizing?.maxWidth],
    ["sizing.minHeight", sizing?.minHeight],
    ["sizing.maxHeight", sizing?.maxHeight],
  ] as const) {
    if (value !== undefined) assertSizeValue(value, `${element.id} ${name}`);
  }
  const rotation = element.layout?.rotation ?? element.rotation;
  if (rotation !== undefined && ROTATIONS[rotation] !== true) {
    throw new InvalidCanvasError(`${element.id} has an invalid rotation.`);
  }
  const ratio = element.layout?.aspectRatio ?? element.aspectRatio;
  if (ratio && (!Number.isFinite(ratio.ratio) || ratio.ratio <= 0)) {
    throw new InvalidCanvasError(`${element.id} has an invalid aspect ratio.`);
  }
  if (
    typeof element.opacity === "number" &&
    (!Number.isFinite(element.opacity) || element.opacity < 0 || element.opacity > 1)
  ) {
    throw new InvalidCanvasError(`${element.id} opacity must be between 0 and 1.`);
  }
  if (
    typeof element.fill !== "string" &&
    element.fill !== undefined &&
    !isPropertyConnection(element.fill)
  ) {
    const kind = element.fill.kind ?? element.fill.type;
    if (kind !== "linear" && kind !== "radial") {
      throw new InvalidCanvasError(`${element.id} has an unknown gradient kind.`);
    }
    if (element.fill.stops.length < 2) {
      throw new InvalidCanvasError(`${element.id} gradients require at least two stops.`);
    }
    let previous = -Infinity;
    for (const stop of element.fill.stops) {
      if (
        !stop.color ||
        !Number.isFinite(stop.position) ||
        stop.position < 0 ||
        stop.position > 1 ||
        stop.position < previous
      ) {
        throw new InvalidCanvasError(`${element.id} has invalid gradient stops.`);
      }
      previous = stop.position;
    }
  }
  if (element.type === "frame" && element.gap !== undefined) {
    if (element.gap !== "auto" && (!Number.isFinite(element.gap) || element.gap < 0)) {
      throw new InvalidCanvasError(
        `${element.id} gap must be auto or a finite non-negative number.`,
      );
    }
  }
}

function visit(element: Element, ids: Set<string>, root: boolean): void {
  if (!element.id) throw new InvalidCanvasError("every Element requires an id.");
  if (ids.has(element.id))
    throw new InvalidCanvasError(`Element id "${element.id}" is duplicated.`);
  ids.add(element.id);
  if (root && element.type !== "frame")
    throw new InvalidCanvasError("the Canvas root must be a Frame.");
  if (root && (element.rotation ?? element.layout?.rotation ?? 0) !== 0) {
    throw new InvalidCanvasError("the Canvas root cannot rotate.");
  }
  assertLayout(element);
  const children = element.children ?? [];
  if (element.type !== "frame" && children.length > 0) {
    throw new InvalidCanvasError(`${element.id} of type ${element.type} cannot contain children.`);
  }
  const ranks = new Set<string>();
  for (const child of children) {
    if (child.rank !== undefined && ranks.has(child.rank)) {
      throw new InvalidCanvasError(`siblings under ${element.id} have duplicate ranks.`);
    }
    if (child.rank !== undefined) ranks.add(child.rank);
    visit(child, ids, false);
  }
}

export function assertValidCanvas(canvas: Canvas): Canvas {
  if (!canvas || !canvas.root) throw new InvalidCanvasError("a root Frame is required.");
  visit(canvas.root, new Set<string>(), true);
  return canvas;
}
