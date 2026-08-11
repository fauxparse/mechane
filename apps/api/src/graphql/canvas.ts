import type { CanvasEdit } from "@mechane/commands";
import { CANVAS_COMMAND_TYPES, CanvasEditError } from "@mechane/commands";
import type { StoredCanvas } from "../db/canvas";

const ELEMENT_TYPE_NAMES = {
  rect: "RectElement",
  ellipse: "EllipseElement",
  text: "TextElement",
  image: "ImageElement",
  frame: "FrameElement",
} as const;

type CanvasElementDiscriminator = { type: keyof typeof ELEMENT_TYPE_NAMES };

export function resolveCanvasElementType(element: CanvasElementDiscriminator): string {
  return ELEMENT_TYPE_NAMES[element.type];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new CanvasEditError(`Canvas edit field "${field}" must be a non-empty string.`);
  }
  return value;
}

/** Parses GraphQL's nullable-field representation into the Canvas edit union. */
export function parseCanvasEdit(input: unknown): CanvasEdit {
  if (!isRecord(input)) throw new CanvasEditError("Canvas edit must be an object.");
  const type = stringField(input, "type");
  switch (type) {
    case CANVAS_COMMAND_TYPES.addElement: {
      const element = input.element;
      if (!isRecord(element))
        throw new CanvasEditError("canvas.addElement requires an element object.");
      return {
        type,
        element: element as Extract<
          CanvasEdit,
          { type: typeof CANVAS_COMMAND_TYPES.addElement }
        >["element"],
        parentId: stringField(input, "parentId"),
        rank: stringField(input, "rank"),
      };
    }
    case CANVAS_COMMAND_TYPES.removeElement:
      return { type, elementId: stringField(input, "elementId") };
    case CANVAS_COMMAND_TYPES.updateElement: {
      const properties = input.properties;
      if (!isRecord(properties))
        throw new CanvasEditError("canvas.updateElement requires properties.");
      const unsetProperties = input.unsetProperties;
      if (
        unsetProperties !== undefined &&
        (!Array.isArray(unsetProperties) ||
          unsetProperties.some((property) => typeof property !== "string"))
      ) {
        throw new CanvasEditError("canvas.updateElement unsetProperties must be strings.");
      }
      return {
        type,
        elementId: stringField(input, "elementId"),
        properties,
        ...(unsetProperties ? { unsetProperties } : {}),
      };
    }
    case CANVAS_COMMAND_TYPES.reparentElement:
      return {
        type,
        elementId: stringField(input, "elementId"),
        parentId: stringField(input, "parentId"),
        rank: stringField(input, "rank"),
      };
    case CANVAS_COMMAND_TYPES.moveArtboard: {
      const position = input.position;
      if (!isRecord(position) || typeof position.x !== "number" || typeof position.y !== "number") {
        throw new CanvasEditError("canvas.moveArtboard requires a numeric position.");
      }
      return { type, position: { x: position.x, y: position.y } };
    }
    default:
      throw new CanvasEditError(`Unknown Canvas edit type "${type}".`);
  }
}

export function serializeCanvas(canvas: StoredCanvas) {
  return {
    id: canvas.id,
    kind: canvas.kind,
    position: canvas.position,
    ownerId: canvas.ownerId,
    ownerName: canvas.ownerName,
    root: canvas.root,
  };
}
