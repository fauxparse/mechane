import { describe, expect, it } from "vitest";

import { sourceValueEditor } from "./SourceValues";

describe("sourceValueEditor", () => {
  it("keeps literal values inline and routes long or multiline text to modal editing", () => {
    expect(sourceValueEditor.usesModal("number", 42)).toBe(false);
    expect(sourceValueEditor.usesModal("boolean", true)).toBe(false);
    expect(sourceValueEditor.usesModal("text", "short text")).toBe(false);
    expect(
      sourceValueEditor.usesModal("text", "x".repeat(sourceValueEditor.inlineStringLimit)),
    ).toBe(false);
    expect(
      sourceValueEditor.usesModal("text", "x".repeat(sourceValueEditor.inlineStringLimit + 1)),
    ).toBe(true);
    expect(sourceValueEditor.usesModal("text", "line one\nline two")).toBe(true);
  });

  it("routes structural values to modal editing", () => {
    expect(sourceValueEditor.usesModal({ kind: "array", of: "text" }, [])).toBe(true);
    expect(sourceValueEditor.usesModal({ kind: "object" }, {})).toBe(true);
    expect(sourceValueEditor.usesModal({ kind: "shape", shapeId: "profile" }, {})).toBe(true);
  });

  it("rejects non-finite numbers without changing the draft value", () => {
    expect(sourceValueEditor.parsePrimitive("number", "42")).toEqual({ value: 42 });
    expect(sourceValueEditor.parsePrimitive("number", "Infinity")).toEqual({
      error: "Enter a finite number.",
    });
  });
});
