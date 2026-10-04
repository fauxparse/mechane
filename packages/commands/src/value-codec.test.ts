import type { ShowGraph } from "@mechane/domain/graph";
import type { Shape, Type } from "@mechane/domain/shapes";
import { generateId } from "@mechane/domain/id";
import {
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
} from "@mechane/domain/structured-values";
import {
  SOURCE_VALUE_FORMAT,
  VALUE_MAX_BYTES,
  VALUE_MAX_LOGICAL_RECORDS,
  ValueTransferError,
  defaultReplacementEntries,
  defaultTemplateAtPath,
  expandPortableValue,
  portableText,
  prepareValueReplacement,
  projectDefaultValue,
  projectRuntimeValue,
  type TypedValueEnvelope,
} from "@mechane/domain/value-transfer";
import { describe, expect, it } from "vitest";
import {
  countLogicalRecords,
  decodeValueHandoff,
  encodeValue,
  parseValueJson,
} from "./value-codec";

const person: Shape = {
  id: "person",
  name: "Person",
  fields: [
    { id: "name", name: "Name", type: "text", required: true, defaultValue: "Guest" },
    { id: "score", name: "Score", type: "number", required: true, defaultValue: 0 },
    { id: "nickname", name: "Nickname", type: "text", required: false, defaultValue: "Inherited" },
  ],
};
const personType = { kind: "shape", shapeId: person.id } as const;
const peopleType = { kind: "array", of: personType } as const;
const typed = (type: Type, root: TypedValueEnvelope["root"]): TypedValueEnvelope => ({
  format: SOURCE_VALUE_FORMAT,
  version: 1,
  origin: { showId: "origin", plane: "default" },
  type,
  root,
  shapes: [],
  records: [],
});
const decode = (value: unknown) =>
  decodeValueHandoff([{ mediaType: "text/plain", text: portableText(value) }]);
const replace = (
  value: unknown,
  type: Type = personType,
  shapes: readonly Shape[] = [person],
  allowsAbsence = false,
) => prepareValueReplacement(decode(value), { type, shapes, allowsAbsence });
const reason = (run: () => unknown) => {
  try {
    run();
    throw new Error("Expected refusal");
  } catch (error) {
    if (!(error instanceof ValueTransferError)) throw error;
    return error.diagnostic.code;
  }
};

function sharedPeople(): TypedValueEnvelope {
  return {
    ...typed(peopleType, { ref: "list" }),
    shapes: [
      {
        id: person.id,
        name: person.name,
        fields: person.fields.map(({ id, name, type, required }) => ({ id, name, type, required })),
      },
    ],
    records: [
      { id: "list", kind: "array", type: peopleType, items: [{ ref: "A" }, { ref: "A" }] },
      {
        id: "A",
        kind: "shape",
        type: personType,
        fields: { name: "Ada", score: 12, nickname: null },
      },
    ],
  };
}

describe("strict portable Source value intake", () => {
  it.each([
    ['""', ""],
    ['"  café \\n"', "  café \n"],
    ["0", 0],
    ["false", false],
    ["null", null],
  ])("retains scalar JSON %s without coercion", (text, value) => {
    expect(decodeValueHandoff([{ mediaType: "text/plain", text }])).toMatchObject({
      kind: "plain",
      value,
    });
  });
  it.each(["text", "date", "datetime", "color"] as const)(
    "preserves %s strings exactly",
    (type) => {
      const value = "  not normalized  ";
      expect(replace(typed(type, value), type, []).value).toBe(value);
    },
  );
  it("rejects a typed scalar mismatch and non-finite numeric input", () => {
    expect(reason(() => replace(typed("text", "12"), "number", []))).toBe("incompatible-type");
    expect(reason(() => parseValueJson("1e999"))).toBe("non-finite-number");
  });
  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"__proto__":1,"__proto__":2}',
    '{"a":0,}',
    "[1,]",
    "01",
    "true false",
    '"\\x00"',
  ])("rejects ambiguous or malformed JSON %s", (text) => {
    expect(() => parseValueJson(text)).toThrow(ValueTransferError);
  });
  it("retains prototype-looking keys as ordinary own data", () => {
    const value = parseValueJson('{"__proto__":{"polluted":true},"constructor":3}');
    expect(Object.getPrototypeOf(value)).toBeNull();
    expect(value).toEqual({ ["__proto__"]: { polluted: true }, constructor: 3 });
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
  it("reserves exact recognized identifiers without malformed-envelope fallback", () => {
    expect(reason(() => decode({ format: "mechane/show-graph" }))).toBe("wrong-kind");
    expect(reason(() => decode({ ...typed("number", 0), version: 2 }))).toBe("unsupported-version");
    expect(reason(() => decode({ ...typed("number", 0), instruction: "execute" }))).toBe(
      "unknown-field",
    );
    expect(decode({ format: "my-data", value: 12 })).toMatchObject({ kind: "plain" });
  });
  it("compares only one exposed handoff, ignoring keys and record-table order", () => {
    const envelope = sharedPeople();
    const other = {
      records: [...envelope.records].reverse(),
      shapes: envelope.shapes,
      root: envelope.root,
      type: envelope.type,
      origin: envelope.origin,
      version: 1,
      format: SOURCE_VALUE_FORMAT,
    };
    expect(
      decodeValueHandoff([
        { mediaType: "text/plain", text: portableText(envelope) },
        { mediaType: "web application/vnd.mechane.source-value+json", text: portableText(other) },
      ]).kind,
    ).toBe("typed");
    expect(
      reason(() =>
        decodeValueHandoff([
          { mediaType: "text/plain", text: "0" },
          { mediaType: "application/vnd.mechane.source-value+json", text: "1" },
        ]),
      ),
    ).toBe("conflicting-representations");
  });
  it("enforces inclusive UTF-8 limits before JSON parsing", () => {
    const exact = '"' + "é".repeat((VALUE_MAX_BYTES - 2) / 2) + '"';
    expect(new TextEncoder().encode(exact).byteLength).toBe(VALUE_MAX_BYTES);
    expect(typeof parseValueJson(exact)).toBe("string");
    expect(reason(() => parseValueJson(exact + " "))).toBe("byte-limit");
    expect(reason(() => parseValueJson("x".repeat(VALUE_MAX_BYTES + 1)))).toBe("byte-limit");
  });
  it("applies the inclusive byte limit to typed Copy producers", () => {
    const overhead = new TextEncoder().encode(portableText(typed("text", ""))).byteLength;
    const exact = typed("text", "x".repeat(VALUE_MAX_BYTES - overhead));
    expect(encodeValue(exact, "typed").bytes).toBe(VALUE_MAX_BYTES);
    expect(
      reason(() => encodeValue(typed("text", "x".repeat(VALUE_MAX_BYTES - overhead + 1)), "typed")),
    ).toBe("byte-limit");
  });
  it("counts typed shared records once at the inclusive record boundary", () => {
    const leafType = { kind: "shape", shapeId: "empty" } satisfies Type;
    const arrayType = { kind: "array", of: leafType } satisfies Type;
    const records: TypedValueEnvelope["records"][number][] = [];
    const items: { ref: string }[] = [];
    for (let index = 0; index < VALUE_MAX_LOGICAL_RECORDS - 2; index += 1) {
      const id = String(index);
      records.push({ id, kind: "shape", type: leafType, fields: {} });
      items.push({ ref: id });
    }
    const envelope: TypedValueEnvelope = {
      ...typed(arrayType, { ref: "root" }),
      shapes: [{ id: "empty", name: "", fields: [] }],
      records: [{ id: "root", kind: "array", type: arrayType, items }, ...records],
    };
    items.push({ ref: "0" });
    const encoded = encodeValue(envelope, "typed");
    expect(encoded.records).toBe(VALUE_MAX_LOGICAL_RECORDS);
    expect(
      countLogicalRecords(decodeValueHandoff([{ mediaType: "text/plain", text: encoded.text }])),
    ).toBe(VALUE_MAX_LOGICAL_RECORDS);
    const excess: TypedValueEnvelope = {
      ...envelope,
      records: [...envelope.records, { id: "excess", kind: "shape", type: leafType, fields: {} }],
    };
    items.push({ ref: "excess" });
    expect(reason(() => encodeValue(excess, "typed"))).toBe("limit-exceeded");
  }, 30_000);
  it("accepts 100,000 occurrences and rejects the next without a nesting cap", () => {
    const exact = "[" + "{}" + ",{}".repeat(VALUE_MAX_LOGICAL_RECORDS - 2) + "]";
    expect(
      countLogicalRecords(decodeValueHandoff([{ mediaType: "text/plain", text: exact }])),
    ).toBe(VALUE_MAX_LOGICAL_RECORDS);
    expect(
      reason(() =>
        decodeValueHandoff([{ mediaType: "text/plain", text: exact.slice(0, -1) + ",{}]" }]),
      ),
    ).toBe("record-limit");
    const depth = 6000;
    const value = decodeValueHandoff([
      { mediaType: "text/plain", text: "[".repeat(depth) + "0" + "]".repeat(depth) },
    ]);
    let type: Type = "number";
    for (let i = 0; i < depth; i += 1) type = { kind: "array", of: type };
    const replacement = prepareValueReplacement(value, { type, shapes: [], allowsAbsence: false });
    expect(Object.keys(replacement.structuredValues)).toHaveLength(depth);
    let current = replacement.template;
    for (let i = 0; i < depth; i += 1) {
      if (!isArrayStructuredValueTemplate(current)) throw new Error("Lost nested array");
      current = current.items[0]!;
    }
    expect(current).toBe(0);
  });
});

describe("structured exchange compatibility and identity", () => {
  it("preserves typed sharing with one fresh clone per token and fresh closure per paste", () => {
    const first = replace(sharedPeople(), peopleType);
    const second = replace(sharedPeople(), peopleType);
    if (
      !isArrayStructuredValueTemplate(first.template) ||
      !isArrayStructuredValueTemplate(second.template)
    )
      throw new Error("Expected lists");
    expect(first.template.items[0]).toBe(first.template.items[1]);
    expect(first.template.id).not.toBe(second.template.id);
    expect(first.template.items[0]).not.toEqual(second.template.items[0]);
    expect(Object.keys(first.structuredValues)).toHaveLength(2);
    expect(encodeValue(sharedPeople(), "plain").text).toBe(
      '[{"Name":"Ada","Score":12,"Nickname":null},{"Name":"Ada","Score":12,"Nickname":null}]',
    );
    const plain = replace(expandPortableValue(sharedPeople()), peopleType);
    if (!isArrayStructuredValueTemplate(plain.template)) throw new Error("Expected list");
    expect(plain.template.items[0]).not.toEqual(plain.template.items[1]);
    expect(Object.keys(plain.structuredValues)).toHaveLength(3);
  });
  it("checks declared compatibility for empty arrays and absent roots", () => {
    const envelope = sharedPeople();
    const empty = {
      ...envelope,
      records: [{ id: "list", kind: "array", type: peopleType, items: [] }],
    };
    const incompatible: Shape = {
      ...person,
      fields: person.fields.map((field) =>
        field.id === "score" ? { ...field, type: "text" } : field,
      ),
    };
    expect(reason(() => replace(empty, peopleType, [incompatible]))).toBe("incompatible-type");
    expect(
      reason(() =>
        replace(
          { ...envelope, type: personType, root: null, records: [] },
          personType,
          [{ ...person, fields: person.fields.map((field) => ({ ...field, required: true })) }],
          true,
        ),
      ),
    ).toBe("optional-to-required");
    expect(
      reason(() =>
        replace(
          {
            ...empty,
            records: [
              { id: "list", kind: "array", type: { kind: "array", of: "number" }, items: [] },
            ],
          },
          peopleType,
        ),
      ),
    ).toBe("incompatible-type");
  });
  it("maps exact names into destination IDs, gives extra optional Fields absence and rejects extras", () => {
    const destination: Shape = {
      id: "destination",
      name: "Destination",
      fields: [
        ...person.fields.map((field) => ({ ...field, id: `destination_${field.id}` })),
        { id: "extra", name: "Extra", type: "text", required: false, defaultValue: "Do not fill" },
      ],
    };
    const result = replace(
      {
        ...sharedPeople(),
        type: personType,
        root: { ref: "A" },
        records: [sharedPeople().records[1]!],
      },
      { kind: "shape", shapeId: destination.id },
      [destination],
    );
    if (!isShapeStructuredValueTemplate(result.template)) throw new Error("Expected person");
    expect(result.template.fields).toEqual({
      destination_name: "Ada",
      destination_score: 12,
      destination_nickname: null,
      extra: null,
    });
    expect(reason(() => replace({ Name: "Ada", Score: 12, Extra: true }))).toBe(
      "extra-source-field",
    );
    expect(reason(() => replace({ name: "Ada", Score: 12 }))).toBe("extra-source-field");
    expect(reason(() => replace({ Name: "Ada" }))).toBe("missing-required-field");
  });
  it("validates malformed unused records and metadata, all references and cycles", () => {
    const envelope = sharedPeople();
    expect(() =>
      decode({
        ...envelope,
        records: [
          ...envelope.records,
          { id: "unused", kind: "array", type: { kind: "array", of: "number" }, items: ["bad"] },
        ],
      }),
    ).toThrow(ValueTransferError);
    expect(
      reason(() =>
        decode({
          ...envelope,
          records: [
            ...envelope.records,
            { id: "unused", kind: "array", type: { kind: "array", of: "number" }, items: [] },
          ],
        }),
      ),
    ).toBe("unused-record");
    expect(reason(() => decode({ ...envelope, root: { ref: "unknown" } }))).toBe(
      "unresolved-reference",
    );
    expect(
      reason(() =>
        decode({
          ...typed("number", 0),
          shapes: [
            {
              id: "unused",
              name: "Unused",
              fields: [
                {
                  id: "child",
                  name: "Child",
                  required: false,
                  type: { kind: "shape", shapeId: "missing" },
                },
              ],
            },
          ],
        }),
      ),
    ).toBe("unresolved-reference");
    expect(
      reason(() =>
        decode({
          ...typed("number", 0),
          shapes: [
            {
              id: "cycle",
              name: "Cycle",
              fields: [
                {
                  id: "child",
                  name: "Child",
                  required: false,
                  type: { kind: "shape", shapeId: "cycle" },
                },
              ],
            },
          ],
        }),
      ),
    ).toBe("cycle");
  });
  it("accepts only exact image pairs and never resolved URL objects", () => {
    expect(replace({ assetId: "asset", revision: "revision" }, "image", []).images).toEqual([
      { assetId: "asset", revision: "revision" },
    ]);
    expect(() =>
      replace(
        { assetId: "asset", revision: "revision", url: "https://example.com/image.png" },
        "image",
        [],
      ),
    ).toThrow(ValueTransferError);
  });
  it("refuses an absent ancestor and preserves sparse overrides and untouched aliases", () => {
    const wrapper: Shape = {
      id: "wrapper",
      name: "Wrapper",
      fields: [
        { id: "child", name: "Child", type: personType, required: false, defaultValue: null },
      ],
    };
    const graph: ShowGraph = {
      nodes: [
        {
          id: "source",
          name: "Source",
          kind: "source",
          parentId: null,
          position: { x: 0, y: 0 },
          type: { kind: "shape", shapeId: wrapper.id },
        },
      ],
      shapes: [wrapper, person],
      edges: [],
    };
    expect(() => defaultReplacementEntries(graph, "source", ["child", "nickname"], null)).toThrow(
      ValueTransferError,
    );
    expect(() =>
      projectDefaultValue({
        graph,
        sourceId: "source",
        showId: "show",
        fieldPath: ["child", "nickname"],
      }),
    ).toThrow(ValueTransferError);
    const shared = {
      id: generateId("structuredValue"),
      kind: "shape" as const,
      fields: { name: "Ada", score: 12, nickname: "Before" },
    };
    const root = {
      id: generateId("structuredValue"),
      kind: "shape" as const,
      fields: { child: shared },
    };
    const populated = {
      ...graph,
      sourceFieldDefaults: [{ nodeId: "source", fieldPath: [], value: root }],
    };
    const entries = defaultReplacementEntries(populated, "source", ["child", "nickname"], null);
    expect(entries[0]).toEqual(populated.sourceFieldDefaults[0]);
    const value = defaultTemplateAtPath({ ...populated, sourceFieldDefaults: entries }, "source", [
      "child",
    ]);
    if (!isShapeStructuredValueTemplate(value)) throw new Error("Expected child");
    expect(value.id).not.toBe(shared.id);
    expect(value.fields).toEqual({ name: "Ada", score: 12, nickname: null });
    expect(root.fields.child.fields.nickname).toBe("Before");
  });
  it("copies Current storage only and refuses unavailable or corrupt values", () => {
    expect(() =>
      projectRuntimeValue({
        showId: "show",
        plane: "current",
        type: "number",
        shapes: [],
        allowsAbsence: false,
        value: undefined,
        structuredValues: {},
      }),
    ).toThrow(ValueTransferError);
    const graph: ShowGraph = {
      nodes: [
        {
          id: "source",
          kind: "source",
          name: "Source",
          parentId: null,
          position: { x: 0, y: 0 },
          type: personType,
        },
      ],
      edges: [],
      shapes: [person],
    };
    expect(
      expandPortableValue(
        projectDefaultValue({ showId: "show", graph, sourceId: "source", fieldPath: [] }),
      ),
    ).toEqual({ Name: "Guest", Score: 0, Nickname: "Inherited" });
  });
});
