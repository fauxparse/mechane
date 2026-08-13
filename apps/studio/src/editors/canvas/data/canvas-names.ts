import type { Element, ElementKind } from "@mechane/domain";

import type { CanvasArtboardDocument } from "../../../api/canvas";

const ELEMENT_TYPE_NAMES: Record<ElementKind, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  text: "Text",
  image: "Image",
  frame: "Frame",
};

const CANVAS_KIND_NAMES: Record<CanvasArtboardDocument["kind"], string> = {
  scene: "Scene",
  block: "Block",
};

export function canvasElementTypeName(type: ElementKind): string {
  return ELEMENT_TYPE_NAMES[type];
}

export function canvasElementDisplayName(element: Pick<Element, "name" | "type">): string {
  return element.name?.trim() || canvasElementTypeName(element.type);
}

export function canvasDisplayName(artboard: Pick<CanvasArtboardDocument, "name" | "kind">): string {
  return artboard.name.trim() || CANVAS_KIND_NAMES[artboard.kind];
}
