import type { StoredCanvas } from "../db/canvas";

const ELEMENT_TYPE_NAMES = {
  rect: "RectElement",
  text: "TextElement",
  image: "ImageElement",
  frame: "FrameElement",
} as const;

type CanvasElementDiscriminator = { type: keyof typeof ELEMENT_TYPE_NAMES };

export function resolveCanvasElementType(element: CanvasElementDiscriminator): string {
  return ELEMENT_TYPE_NAMES[element.type];
}

export function serializeCanvas(canvas: StoredCanvas) {
  return {
    id: canvas.id,
    kind: canvas.kind,
    root: canvas.root,
  };
}
