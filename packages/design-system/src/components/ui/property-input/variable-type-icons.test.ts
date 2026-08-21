import { describe, expect, it } from "vitest";

import { typeFromVariableKind, variableTypeKind } from "./variable-type-icons";

describe("variableTypeKind", () => {
  it("uses primitive Type strings as-is", () => {
    expect(variableTypeKind("text")).toBe("text");
    expect(variableTypeKind("number")).toBe("number");
  });

  it("matches GraphQL-shaped kinds, including object", () => {
    expect(variableTypeKind({ kind: "object" })).toBe("object");
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

describe("typeFromVariableKind", () => {
  it("maps primitives to Type strings", () => {
    expect(typeFromVariableKind("text")).toBe("text");
    expect(typeFromVariableKind("color")).toBe("color");
  });

  it("defaults array to array of text, but keeps an existing element type", () => {
    expect(typeFromVariableKind("array")).toEqual({ kind: "array", of: "text" });
    expect(typeFromVariableKind("array", { kind: "array", of: "number" })).toEqual({
      kind: "array",
      of: "number",
    });
  });

  it("maps object, keeping a named shape", () => {
    expect(typeFromVariableKind("object")).toEqual({ kind: "object" });
    expect(typeFromVariableKind("object", { kind: "shape", shapeId: "scoreboard" })).toEqual({
      kind: "shape",
      shapeId: "scoreboard",
    });
  });
});
