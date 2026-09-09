import {
  createElement,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type { BlockInstancePathSegment, Canvas, FrameElement } from "@mechane/domain";
import { prepareLegacyCanvasPresentation } from "./canvas-presentation";
import { CanvasRenderer } from "./canvas-renderer";
import type { CanvasPresentation } from "./canvas-presentation";
export interface CanvasRendererProps {
  presentation: CanvasPresentation;
  className?: string;
  style?: CSSProperties;
  editingElementId?: string | null;
  imageLoading?: "eager" | "lazy";
  onImageError?(elementId: string, url: string, event: unknown): void;
  onTextDoubleClick?(elementId: string, event: ReactMouseEvent<HTMLDivElement>): void;
  onTextKeyDown?(elementId: string, event: ReactKeyboardEvent<HTMLDivElement>): void;
  /**
   * A tap, with the root-to-leaf Slot instance path to the Element. Elements
   * inside a Block instance render with the Block Canvas's own ids, so the
   * path is the only thing that says which instance was tapped.
   */
  onElementTap?(elementId: string, slotInstancePath: readonly BlockInstancePathSegment[]): void;
}

export function renderCanvas(canvas: Canvas | FrameElement | CanvasRendererProps): ReactNode {
  if ("presentation" in canvas) return createElement(CanvasRenderer, canvas);
  const sourceCanvas = "root" in canvas ? canvas : { root: canvas };
  return createElement(CanvasRenderer, {
    presentation: prepareLegacyCanvasPresentation(sourceCanvas, {
      variables: [],
      shapes: [],
      blocks: [],
      imageAssets: [],
      mode: "studio",
    }),
  });
}
