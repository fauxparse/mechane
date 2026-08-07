import { describe, expect, it } from "vitest";

import {
  assertValidShapes,
  topologicallySortShapes,
  assertValueConformsToShape,
  coerceValue,
  conformsToShape,
  COERCIONS,
  CoercionError,
  InvalidShapeError,
} from "./shapes";
import type { Shape } from "./shapes";

const address: Shape = {
  id: "address",
  name: "Address",
  fields: [
    { id: "street", name: "Street", type: "text", required: true, defaultValue: "" },
    { id: "postcode", name: "Postcode", type: "text", required: false, defaultValue: null },
  ],
};

const person: Shape = {
  id: "person",
  name: "Person",
  fields: [
    { id: "name", name: "Name", type: "text", required: true, defaultValue: "Unknown" },
    {
      id: "addresses",
      name: "Addresses",
      type: { kind: "array", of: { kind: "shape", shapeId: "address" } },
      required: true,
      defaultValue: [],
    },
  ],
};

describe("Shape grammar", () => {
  it("accepts nested Shape references and preserves field order", () => {
    expect(() => assertValidShapes([person, address])).not.toThrow();
    expect(topologicallySortShapes([person, address]).map((shape) => shape.id)).toEqual([
      "address",
      "person",
    ]);
    expect(person.fields.map((field) => field.id)).toEqual(["name", "addresses"]);
  });

  it("rejects direct and transitive cycles", () => {
    const a: Shape = {
      id: "a",
      name: "A",
      fields: [{ id: "b", name: "B", type: { kind: "shape", shapeId: "b" }, required: true, defaultValue: {} }],
    };
    const b: Shape = {
      id: "b",
      name: "B",
      fields: [{ id: "a", name: "A", type: { kind: "shape", shapeId: "a" }, required: true, defaultValue: {} }],
    };
    expect(() => assertValidShapes([a, b])).toThrow(InvalidShapeError);
  });

  it("rejects duplicate field names and missing required defaults", () => {
    expect(() =>
      assertValidShapes([
        {
          id: "bad",
          name: "Bad",
          fields: [
            { id: "a", name: "same", type: "text", required: true, defaultValue: null },
            { id: "b", name: "same", type: "text", required: false, defaultValue: null },
          ],
        },
      ]),
    ).toThrow(InvalidShapeError);
  });
});

describe("Shape values", () => {
  it("validates required, optional, arrays, and nested Shapes", () => {
    const value = { name: "Ada", addresses: [{ street: "Main Street" }] };
    expect(conformsToShape(value, person, [person, address])).toBe(true);
    expect(conformsToShape({ addresses: [] }, person, [person, address])).toBe(false);
    expect(conformsToShape({ name: "Ada", addresses: [{ street: 42 }] }, person, [person, address])).toBe(false);
  });

  it("accepts stable field ids as value keys", () => {
    expect(() =>
      assertValueConformsToShape({ name: "Ada", addresses: [{ street: "Main" }] }, person, [person, address]),
    ).not.toThrow();
  });
});

describe("coercion table", () => {
  it("contains exactly the supported primitive pairs", () => {
    expect(COERCIONS.map(({ from, to }) => `${from}->${to}`)).toEqual([
      "number->text",
      "boolean->text",
      "datetime->date",
      "text->number",
      "text->date",
      "text->datetime",
      "text->boolean",
    ]);
  });

  it("converts lossless and deliberate lossy pairs", () => {
    expect(coerceValue(12, "number", "text")).toBe("12");
    expect(coerceValue(true, "boolean", "text")).toBe("true");
    expect(coerceValue("2025-04-03T12:30:00Z", "datetime", "date")).toBe("2025-04-03");
    expect(coerceValue("42", "text", "number")).toBe(42);
    expect(coerceValue("false", "text", "boolean")).toBe(false);
  });

  it("rejects invalid parses and deliberately unsupported pairs", () => {
    expect(() => coerceValue("maybe", "text", "boolean")).toThrow(CoercionError);
    expect(() => coerceValue("2025-02-30", "text", "date")).toThrow(CoercionError);
    expect(() => coerceValue("2025-04-03", "date", "datetime")).toThrow(CoercionError);
  });
});
