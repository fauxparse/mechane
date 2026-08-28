import { CANVAS_COMMAND_TYPES } from "@mechane/commands";
import { describe, expect, it } from "vitest";

import { schema } from "./schema";
import { parseCanvasEdit, resolveCanvasElementType } from "./canvas";
describe("Canvas GraphQL adapter", () => {
  it.each([
    ["rect", "RectElement"],
    ["ellipse", "EllipseElement"],
    ["text", "TextElement"],
    ["image", "ImageElement"],
    ["frame", "FrameElement"],
  ] as const)("maps %s to %s", (type, graphqlType) => {
    expect(resolveCanvasElementType({ type })).toBe(graphqlType);
  });

  it("parses an edit", () => {
    expect(
      parseCanvasEdit({
        type: CANVAS_COMMAND_TYPES.updateElement,
        elementId: "title",
        properties: { content: "Updated" },
      }),
    ).toEqual({
      type: CANVAS_COMMAND_TYPES.updateElement,
      elementId: "title",
      properties: { content: "Updated" },
    });
  });
  it("parses artboard position edits", () => {
    expect(
      parseCanvasEdit({
        type: CANVAS_COMMAND_TYPES.moveArtboard,
        position: { x: 120.5, y: -40 },
      }),
    ).toEqual({
      type: CANVAS_COMMAND_TYPES.moveArtboard,
      position: { x: 120.5, y: -40 },
    });
  });
});

describe("Canvas GraphQL schema", () => {
  it.each([
    ["TextElement", "textAlign"],
    ["TextElement", "value"],
    ["ImageElement", "objectPosition"],
    ["TextElement", "alignSelf"],
    ["TextElement", "aspectRatio"],
  ])("exposes %s.%s so Canvas refreshes retain it", (type, field) => {
    const element = schema.getType(type);
    const fields = element && "getFields" in element ? element.getFields() : undefined;
    expect(fields?.[field]).toBeDefined();
  });
});
