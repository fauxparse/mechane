import { describe, expect, it } from "vitest";

import { CANVAS_COMMAND_TYPES } from "@mechane/commands";

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
