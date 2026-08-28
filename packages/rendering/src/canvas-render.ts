import {
  createElement,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type {
  Block,
  Canvas,
  FrameElement,
  ImageAssetReference,
  ResolvedImageValue,
  Shape,
  SlotVariableValue,
  Type,
} from "@mechane/domain";
import { CanvasRenderer } from "./canvas-renderer";

export interface CanvasRendererProps {
  canvas: Canvas | FrameElement;
  className?: string;
  style?: CSSProperties;
  editingElementId?: string | null;
  imageLoading?: "eager" | "lazy";
  blocks?: readonly Block[];
  shapes?: readonly Shape[];
  imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  variables?: readonly SlotVariableValue[];
  runtimeItem?: unknown;
  runtimeType?: Type;
  mode?: "studio" | "player";
  onImageError?(elementId: string, url: string, event: unknown): void;
  onTextDoubleClick?(elementId: string, event: ReactMouseEvent<HTMLDivElement>): void;
  onTextKeyDown?(elementId: string, event: ReactKeyboardEvent<HTMLDivElement>): void;
}

export function renderCanvas(canvas: Canvas | FrameElement | CanvasRendererProps): ReactNode {
  return createElement(CanvasRenderer, "canvas" in canvas ? canvas : { canvas });
}
