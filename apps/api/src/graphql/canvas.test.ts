import { describe, expect, it } from "vitest";

import { CANVAS_COMMAND_TYPES } from "@mechane/commands";

import { parseCanvasEdit, resolveCanvasElementType } from "./canvas";
describe("Canvas GraphQL adapter", () => {
  it.each([
    ["rect", "RectElement"],
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
});
