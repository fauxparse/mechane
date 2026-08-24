import { describe, expect, it } from "vitest";

import {
  areTypesCompatible,
  assertShapeCanBeRemoved,
  assertShapeFieldNameAvailable,
  assertValidShapeType,
  assertValidShapes,
  topologicallySortShapes,
  assertValueConformsToShape,
  coerceValue,
  coerceShapeValue,
  conformsToShape,
  COERCIONS,
  CoercionError,
  InvalidShapeError,
  shapeReferencesShape,
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
      fields: [
        {
          id: "b",
          name: "B",
          type: { kind: "shape", shapeId: "b" },
          required: true,
          defaultValue: {},
        },
      ],
    };
    const b: Shape = {
      id: "b",
      name: "B",
      fields: [
        {
          id: "a",
          name: "A",
          type: { kind: "shape", shapeId: "a" },
          required: true,
          defaultValue: {},
        },
      ],
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

  it("exposes command-level name, reference, and deletion guards", () => {
    expect(shapeReferencesShape([person, address], person.id, address.id)).toBe(true);
    expect(shapeReferencesShape([person, address], address.id, address.id)).toBe(false);
    expect(() => assertShapeFieldNameAvailable(person, "Addresses", "new")).toThrow(
      /duplicate Field name/,
    );
    expect(() => assertValidShapeType({ kind: "shape", shapeId: "missing" }, [address])).toThrow(
      /unknown Shape/,
    );
    expect(() => assertShapeCanBeRemoved([person, address], address.id)).toThrow(/used/);
  });
});

describe("Shape values", () => {
  it("validates required, optional, arrays, and nested Shapes", () => {
    const value = { name: "Ada", addresses: [{ street: "Main Street" }] };
    expect(conformsToShape(value, person, [person, address])).toBe(true);
    expect(conformsToShape({ addresses: [] }, person, [person, address])).toBe(false);
    expect(
      conformsToShape({ name: "Ada", addresses: [{ street: 42 }] }, person, [person, address]),
    ).toBe(false);
  });

  it("accepts stable field ids as value keys", () => {
    expect(() =>
      assertValueConformsToShape({ name: "Ada", addresses: [{ street: "Main" }] }, person, [
        person,
        address,
      ]),
    ).not.toThrow();
  });

  it("reconciles a live value by stable field id", () => {
    const oldShape: Shape = {
      id: "old",
      name: "Old",
      fields: [
        { id: "count", name: "Count", type: "number", required: true, defaultValue: 0 },
        { id: "removed", name: "Removed", type: "text", required: false, defaultValue: null },
        { id: "renamed", name: "Before", type: "text", required: true, defaultValue: "" },
        {
          id: "when",
          name: "When",
          type: "datetime",
          required: true,
          defaultValue: "2025-01-01T00:00:00.000Z",
        },
      ],
    };
    const newShape: Shape = {
      id: "new",
      name: "New",
      fields: [
        { id: "count", name: "Count", type: "text", required: true, defaultValue: "default" },
        { id: "added", name: "Added", type: "boolean", required: false, defaultValue: true },
        { id: "renamed", name: "After", type: "text", required: true, defaultValue: "" },
        { id: "when", name: "When", type: "date", required: true, defaultValue: "2025-01-01" },
      ],
    };

    const result = coerceShapeValue(
      { count: 12, removed: "discard me", renamed: "Ada", when: "2025-04-03T12:30:00Z" },
      oldShape,
      newShape,
    );

    expect(result.value).toEqual({ count: "12", added: true, renamed: "Ada", when: "2025-04-03" });
    expect(result.losses.map(({ fieldId }) => fieldId)).toEqual(["removed", "when"]);
    expect(
      coerceShapeValue({}, oldShape, newShape, [oldShape, newShape], { added: false }).value,
    ).toMatchObject({ added: false });
  });

  it("uses the new default when a retype cannot be converted", () => {
    const oldShape: Shape = {
      id: "old",
      name: "Old",
      fields: [{ id: "value", name: "Value", type: "text", required: true, defaultValue: "" }],
    };
    const newShape: Shape = {
      id: "new",
      name: "New",
      fields: [{ id: "value", name: "Value", type: "number", required: true, defaultValue: 7 }],
    };

    expect(coerceShapeValue({ value: "not a number" }, oldShape, newShape)).toEqual({
      value: { value: 7 },
      losses: [
        {
          path: ["value"],
          fieldId: "value",
          fieldName: "Value",
          reason: "Value could not be converted from text to number; default used.",
        },
      ],
    });
  });
});

describe("image values", () => {
  it("accepts opaque asset references and rejects implicit string values", () => {
    expect(
      conformsToShape(
        { image: { assetId: "i_demo", revision: "r1" } },
        {
          id: "image-shape",
          name: "Image",
          fields: [
            { id: "image", name: "Image", type: "image", required: true, defaultValue: null },
          ],
        },
      ),
    ).toBe(true);
    expect(
      conformsToShape(
        { image: "https://example.test/image" },
        {
          id: "image-shape",
          name: "Image",
          fields: [
            { id: "image", name: "Image", type: "image", required: true, defaultValue: null },
          ],
        },
      ),
    ).toBe(false);
  });

  it("accepts resolved image metadata at an API boundary", () => {
    expect(
      conformsToShape(
        {
          image: {
            assetId: "i_demo",
            url: "/api/images/i_demo/r1",
            width: 320,
            height: 180,
            alt: "",
            mimeType: "image/webp",
            blurHash: null,
          },
        },
        {
          id: "image-shape",
          name: "Image",
          fields: [
            { id: "image", name: "Image", type: "image", required: true, defaultValue: null },
          ],
        },
      ),
    ).toBe(true);
  });
});

describe("type compatibility", () => {
  it("allows table coercions and single-to-array wrapping", () => {
    expect(areTypesCompatible("number", "text")).toBe(true);
    expect(areTypesCompatible("boolean", { kind: "array", of: "number" })).toBe(false);
    expect(areTypesCompatible("number", { kind: "array", of: "number" })).toBe(true);
    expect(areTypesCompatible({ kind: "array", of: "number" }, "number")).toBe(false);
  });

  it("matches Shape fields by normalized names and ignores unmatched targets", () => {
    const source: Shape = {
      id: "source",
      name: "Source",
      fields: [
        {
          id: "source_count",
          name: "Count Value",
          type: "number",
          required: true,
          defaultValue: 0,
        },
      ],
    };
    const target: Shape = {
      id: "target",
      name: "Target",
      fields: [
        { id: "target_count", name: "countvalue", type: "text", required: true, defaultValue: "" },
        { id: "target_extra", name: "Extra", type: "text", required: false, defaultValue: null },
      ],
    };
    expect(
      areTypesCompatible(
        { kind: "shape", shapeId: source.id },
        { kind: "shape", shapeId: target.id },
        [source, target],
      ),
    ).toBe(true);
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
