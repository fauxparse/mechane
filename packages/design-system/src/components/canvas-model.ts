import type { CSSProperties } from "react";

export const ELEMENT_KINDS = ["rect", "text", "image", "frame"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const SIZE_MODES = ["hug", "fill", "fixed"] as const;
export type SizeMode = (typeof SIZE_MODES)[number];
export type SizeUnit = "px" | "%";
export type SizeValue = number | { value: number; unit: SizeUnit };

export interface AxisSize {
  mode: SizeMode;
  /** Required for fixed sizing. A number is interpreted as pixels. */
  value?: SizeValue;
}

export type Rotation = 0 | 90 | 180 | 270;
export type BlendMode = CSSProperties["mixBlendMode"];
export type FrameLayoutMode = "absolute" | "auto";
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

export interface GradientStop {
  color?: string;
  colour?: string;
  /** A normalized position between 0 and 1. */
  position: number;
}

export interface GradientFill {
  kind?: "linear" | "radial";
  type?: "linear" | "radial";
  stops: readonly GradientStop[];
  /** Degrees clockwise from the top for linear gradients. */
  angle?: number;
}

export type Fill = string | GradientFill;

export interface AspectRatioLock {
  /** Width divided by height. */
  ratio: number;
  /** The authored axis; the other axis is derived by CSS. */
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
  /** Siblings are painted and laid out in ascending rank order. */
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
  opacity?: number;
  blendMode?: BlendMode;
  fill?: Fill;
  anchor?: AnchorPosition;
  children?: readonly Element[];
}

export interface RectElement extends ElementBase {
  type: "rect";
  cornerRadius?: number;
}

export interface TextElement extends ElementBase {
  type: "text";
  content?: string;
  text?: string;
  value?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: CSSProperties["fontWeight"];
  lineHeight?: CSSProperties["lineHeight"];
  letterSpacing?: number;
  textAlign?: CSSProperties["textAlign"];
}

export interface ImageElement extends ElementBase {
  type: "image";
  src?: string;
  image?: string;
  source?: string;
  alt?: string;
  objectFit?: CSSProperties["objectFit"];
}

export interface FrameElement extends ElementBase {
  type: "frame";
  layoutMode?: FrameLayoutMode;
  mode?: FrameLayoutMode;
  /** Alias accepted for JSON authored before layoutMode was named. */
  autoLayout?: boolean;
  direction?: LayoutDirection;
  gap?: number;
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

export interface AnchorPosition {
  horizontal?: Extract<Anchor, "left" | "center" | "centre" | "right">;
  vertical?: Extract<Anchor, "top" | "center" | "centre" | "bottom">;
  offsetX?: number;
  offsetY?: number;
}

export type Element = RectElement | TextElement | ImageElement | FrameElement;

export interface Canvas {
  root: FrameElement;
  kind?: "scene" | "block";
}

export interface CanvasRendererProps {
  canvas: Canvas | FrameElement;
  className?: string;
  style?: CSSProperties;
}
