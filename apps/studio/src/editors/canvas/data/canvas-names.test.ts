import { describe, expect, it } from "vitest";

import { canvasDisplayName, canvasElementDisplayName, canvasElementTypeName } from "./canvas-names";

describe("Canvas display names", () => {
  it.each([
    ["rect", "Rectangle"],
    ["ellipse", "Ellipse"],
    ["text", "Text"],
    ["image", "Image"],
    ["frame", "Frame"],
  ] as const)("coerces %s to %s", (type, expected) => {
    expect(canvasElementTypeName(type)).toBe(expected);
  });

  it("uses an element name when present and its type when absent", () => {
    expect(canvasElementDisplayName({ type: "rect", name: "Promo card" })).toBe("Promo card");
    expect(canvasElementDisplayName({ type: "rect", name: "  " })).toBe("Rectangle");
    expect(canvasElementDisplayName({ type: "rect" })).toBe("Rectangle");
  });

  it("uses the canvas name and falls back to its kind", () => {
    expect(canvasDisplayName({ kind: "scene", name: "Opening scene" })).toBe("Opening scene");
    expect(canvasDisplayName({ kind: "block", name: "" })).toBe("Block");
  });
});
