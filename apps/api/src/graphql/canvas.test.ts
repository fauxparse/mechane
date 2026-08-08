import { describe, expect, it } from "vitest";

import { resolveCanvasElementType } from "./canvas";

describe("Canvas Element interface resolution", () => {
  it.each([
    ["rect", "RectElement"],
    ["text", "TextElement"],
    ["image", "ImageElement"],
    ["frame", "FrameElement"],
  ] as const)("maps %s to %s", (type, graphqlType) => {
    expect(resolveCanvasElementType({ type })).toBe(graphqlType);
  });
});
