import { createElement, type CSSProperties, type ReactNode } from "react";

import type { Canvas, FrameElement } from "@mechane/domain";
import { CanvasRenderer } from "./canvas-renderer";

export interface CanvasRendererProps {
  canvas: Canvas | FrameElement;
  className?: string;
  style?: CSSProperties;
}

export function renderCanvas(canvas: Canvas | FrameElement | CanvasRendererProps): ReactNode {
  return createElement(CanvasRenderer, "canvas" in canvas ? canvas : { canvas });
}
