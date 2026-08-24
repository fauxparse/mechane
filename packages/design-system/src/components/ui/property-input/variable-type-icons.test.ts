import { describe, expect, it } from "vitest";

import { variableTypeKind } from "./variable-type-icons";

describe("variableTypeKind", () => {
  it("uses primitive Type strings as-is", () => {
    expect(variableTypeKind("text")).toBe("text");
    expect(variableTypeKind("number")).toBe("number");
  });

  it("matches serialized primitive and array kinds", () => {
    expect(variableTypeKind({ kind: "text" })).toBe("text");
    expect(variableTypeKind({ kind: "array", of: "text" })).toBe("array");
  });

  it("maps named shapes to object", () => {
    expect(variableTypeKind({ kind: "shape", shapeId: "scoreboard" })).toBe("object");
  });

  it("falls back to object when the type is missing", () => {
    expect(variableTypeKind(null)).toBe("object");
    expect(variableTypeKind(undefined)).toBe("object");
  });
});
