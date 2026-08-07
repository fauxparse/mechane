import { createElement, type ReactNode } from "react";

import { CanvasRenderer } from "./canvas-renderer";
import type { Canvas, CanvasRendererProps, FrameElement } from "./canvas-model";

export function renderCanvas(canvas: Canvas | FrameElement | CanvasRendererProps): ReactNode {
  return createElement(CanvasRenderer, "canvas" in canvas ? canvas : { canvas });
}
