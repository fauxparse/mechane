import { describe, expect, it } from "vitest";

import type { StructuredValueTemplate } from "./structured-values";
import type { ShowGraph } from "./graph";
import { assertValidId, isId } from "./id";
import { expandSlotInstances } from "./slots";
import {
  assertValidRunState,
  computedStructuredValueId,
  eventStructuredValueId,
  InvalidStructuredValueError,
  isArrayStructuredValueTemplate,
  isComputedStructuredValueId,
  isEventStructuredValueId,
  isShapeStructuredValueTemplate,
  isStructuredValueReference,
  materializeRunState,
  normalizeStructuredValueTemplate,
  materializeStructuredValue,
  preserveStructuredValueTemplateIds,
  resolveRuntimeValue,
} from "./structured-values";
import type { Shape, Type } from "./shapes";

const person: Shape = {
  id: "person",
  name: "Person",
  fields: [{ id: "name", name: "Name", type: "text", required: true, defaultValue: "" }],
};
const people: Type = { kind: "array", of: { kind: "shape", shapeId: person.id } };
const graph: ShowGraph = {
  shapes: [person],
  nodes: [
    {
      id: "people",
      kind: "source",
      name: "People",
      parentId: null,
      position: { x: 0, y: 0 },
      type: people,
    },
  ],
  edges: [],
};

function item(name: string) {
  return { name };
}

describe("Structured Value identity", () => {
  it("adds stable identity to every structured template node", () => {
    const template = normalizeStructuredValueTemplate([item("Ada"), item("Grace")], people, [
      person,
    ]);
    if (!isArrayStructuredValueTemplate(template)) throw new Error("Expected an array template.");
    const [ada, grace] = template.items;
    if (!isShapeStructuredValueTemplate(ada) || !isShapeStructuredValueTemplate(grace)) {
      throw new Error("Expected Shape templates.");
    }
    const normalizedAgain = normalizeStructuredValueTemplate(template, people, [person]);

    expect(normalizedAgain).toEqual(template);
    expect(ada).toMatchObject({ kind: "shape" });
    expect(grace).toMatchObject({ kind: "shape" });
    expect(new Set([template.id, ada.id, grace.id]).size).toBe(3);
  });

  it("materializes references and one canonical record per instance", () => {
    const template = normalizeStructuredValueTemplate([item("Ada"), item("Grace")], people, [
      person,
    ]);
    if (!isArrayStructuredValueTemplate(template)) throw new Error("Expected an array template.");
    const [ada, grace] = template.items;
    if (!isShapeStructuredValueTemplate(ada) || !isShapeStructuredValueTemplate(grace)) {
      throw new Error("Expected Shape templates.");
    }
    const state = materializeRunState(graph, { people: template });
    const root = state.sourceValues.people;

    expect(root).toMatchObject({ ref: expect.any(String) });
    expect(Object.keys(state.structuredValues)).toHaveLength(3);
    expect(resolveRuntimeValue(root!, state.structuredValues)).toEqual([
      { name: "Ada" },
      { name: "Grace" },
    ]);
    expect(expandSlotInstances(root, undefined, state.structuredValues).instances).toEqual([
      { id: ada.id, index: 0, item: item("Ada") },
      { id: grace.id, index: 1, item: item("Grace") },
    ]);
  });
  it("preserves compatible parent and child identities during reconciliation", () => {
    const original = normalizeStructuredValueTemplate([item("Ada")], people, [person]);
    const state = materializeRunState(graph, { people: original });
    const currentRoot = state.sourceValues.people;
    const changed = normalizeStructuredValueTemplate([item("Ada Lovelace")], people, [person]);
    const reconciled = preserveStructuredValueTemplateIds(
      changed,
      people,
      currentRoot,
      state.structuredValues,
      [person],
    );
    const next = materializeStructuredValue(reconciled, people, [person]);

    expect(next.value).toEqual(currentRoot);
    if (!isStructuredValueReference(currentRoot)) throw new Error("Expected an array reference.");
    const before = state.structuredValues[currentRoot.ref];
    const after = next.structuredValues[currentRoot.ref];
    expect(after).toMatchObject({ id: currentRoot.ref, kind: "array" });
    if (before?.kind !== "array" || after?.kind !== "array") {
      throw new Error("Expected array records.");
    }
    expect(after.items[0]).toEqual(before.items[0]);
    expect(resolveRuntimeValue(next.value, next.structuredValues)).toEqual([item("Ada Lovelace")]);
  });

  it("supports absent structured Source roots without materializing records", () => {
    const shapeGraph: ShowGraph = {
      ...graph,
      nodes: [
        {
          id: "selected",
          kind: "source",
          name: "Selected",
          parentId: null,
          position: { x: 0, y: 0 },
          type: { kind: "shape", shapeId: person.id },
        },
      ],
    };
    const absent = materializeRunState(shapeGraph, { selected: null });
    expect(absent.structuredValues).toEqual({});
    expect(absent.sourceValues.selected).toBeNull();
    expect(() => assertValidRunState(absent, shapeGraph)).not.toThrow();

    const empty = materializeStructuredValue([] as unknown as StructuredValueTemplate, people, [
      person,
    ]);
    expect(empty.structuredValues).not.toEqual({});
    expect(expandSlotInstances(null, undefined, {}).instances).toEqual([]);
    expect(expandSlotInstances(empty.value, undefined, empty.structuredValues).instances).toEqual(
      [],
    );
  });

  it("rejects dangling references and cycles", () => {
    const template = normalizeStructuredValueTemplate([item("Ada")], people, [person]);
    const state = materializeRunState(graph, { people: template });
    const root = state.sourceValues.people;
    if (!isStructuredValueReference(root)) throw new Error("Expected a reference.");
    const record = state.structuredValues[root.ref];
    if (!record || record.kind !== "array") throw new Error("Expected an array record.");

    expect(() =>
      assertValidRunState(
        {
          ...state,
          structuredValues: {
            ...state.structuredValues,
            [record.id]: { ...record, items: [{ ref: record.id }] },
          },
        },
        graph,
      ),
    ).toThrow(InvalidStructuredValueError);
    expect(() =>
      assertValidRunState(
        {
          ...state,
          sourceValues: { people: { ref: assertValidId("structuredValue", "x2345678") } },
        },
        graph,
      ),
    ).toThrow(/dangling reference/);
  });
});

describe("Event-derived Structured Value identity", () => {
  it("encodes Event, Action, and path reversibly with no delimiter collisions", () => {
    // The wire format is the contract: both planning sides and every stored
    // row agree on it, so it is pinned once, exactly.
    expect(eventStructuredValueId("evt_1", "act_1", ["f_candidates", "0"])).toBe(
      "x:evt_1:act_1:f_candidates/0",
    );
    // The root node's empty path is its own key, not a missing part.
    expect(eventStructuredValueId("evt_1", "act_1", [])).toBe("x:evt_1:act_1:");

    // Delimiter-bearing parts encode, so no triple can alias another by
    // splitting differently.
    expect(eventStructuredValueId("evt:1", "act", ["a/b"])).not.toBe(
      eventStructuredValueId("evt", "1:act", ["a", "b"]),
    );
    expect(eventStructuredValueId("a:b", "c", [])).not.toBe(eventStructuredValueId("a", "b:c", []));
    expect(eventStructuredValueId("e", "a", ["x/y"])).not.toBe(
      eventStructuredValueId("e", "a", ["x", "y"]),
    );

    // Distinct triples stay distinct, and the guard recognizes every id the
    // builder can produce.
    const ids = [
      eventStructuredValueId("evt_1", "act_1", []),
      eventStructuredValueId("evt_2", "act_1", []),
      eventStructuredValueId("evt_1", "act_2", []),
      eventStructuredValueId("evt_1", "act_1", ["0"]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isEventStructuredValueId(id)).toBe(true);
  });

  it("keeps the stored namespace disjoint from computed and random ids", () => {
    const stored = eventStructuredValueId("evt_1", "act_1", ["0"]);
    expect(isComputedStructuredValueId(stored)).toBe(false);
    expect(isId("structuredValue", stored)).toBe(false);
    expect(isEventStructuredValueId(computedStructuredValueId("t_1", people, []))).toBe(false);
    expect(isEventStructuredValueId(assertValidId("structuredValue", "x2345678"))).toBe(false);
    // Missing path part, empty Event part, and trailing extra part.
    expect(isEventStructuredValueId("x:evt_1:act_1")).toBe(false);
    expect(isEventStructuredValueId("x::act_1:")).toBe(false);
    expect(isEventStructuredValueId("x:evt_1:act_1:0:1")).toBe(false);
  });

  it("recognizes Event-derived templates and stores their ids as record keys", () => {
    const derive = (path: readonly string[]) => eventStructuredValueId("evt_1", "act_1", path);
    const template = normalizeStructuredValueTemplate(
      [item("Ada"), item("Grace")],
      people,
      [person],
      derive,
    );
    if (!isArrayStructuredValueTemplate(template)) throw new Error("Expected an array template.");
    const [ada, grace] = template.items;
    if (!isShapeStructuredValueTemplate(ada) || !isShapeStructuredValueTemplate(grace)) {
      throw new Error("Expected Shape templates.");
    }

    expect(template.id).toBe(derive([]));
    expect(ada.id).toBe(derive(["0"]));
    expect(grace.id).toBe(derive(["1"]));

    // Re-normalizing without a derivation keeps every Event-derived id, so
    // materialization never re-mints over a seed.
    expect(normalizeStructuredValueTemplate(template, people, [person])).toEqual(template);

    const materialized = materializeStructuredValue(template, people, [person]);
    expect(Object.keys(materialized.structuredValues).sort()).toEqual(
      [derive([]), derive(["0"]), derive(["1"])].sort(),
    );
    expect(materialized.value).toEqual({ ref: derive([]) });
    expect(isStructuredValueReference(materialized.value)).toBe(true);

    // A run state holding only Event-derived records validates, while a key
    // that is neither random nor Event-derived — computed, here — still
    // does not.
    const state = {
      sourceValues: { people: materialized.value },
      structuredValues: materialized.structuredValues,
    };
    assertValidRunState(state, graph);
    const computed = computedStructuredValueId("t_1", people, []);
    expect(() =>
      assertValidRunState(
        {
          ...state,
          structuredValues: {
            ...state.structuredValues,
            [computed]: { id: computed, kind: "array", type: people, items: [] },
          },
        },
        graph,
      ),
    ).toThrow(InvalidStructuredValueError);
  });

  it("keeps authored normalization random", () => {
    const template = normalizeStructuredValueTemplate([item("Ada")], people, [person]);
    if (!isArrayStructuredValueTemplate(template)) throw new Error("Expected an array template.");
    const [ada] = template.items;
    if (!isShapeStructuredValueTemplate(ada)) throw new Error("Expected a Shape template.");
    for (const id of [template.id, ada.id]) {
      expect(isId("structuredValue", id)).toBe(true);
      expect(isEventStructuredValueId(id)).toBe(false);
    }
  });
});

describe("deep clipboard-backed structured values", () => {
  it("materializes and expands a finite nested array without a call-stack depth limit", () => {
    const depth = 6000;
    let type: Type = "number";
    let input: unknown = 12;
    for (let index = 0; index < depth; index += 1) {
      type = { kind: "array", of: type };
      input = [input];
    }
    const template = normalizeStructuredValueTemplate(input, type);
    const stored = materializeStructuredValue(template, type);
    assertValidRunState(
      { sourceValues: { nested: stored.value }, structuredValues: stored.structuredValues },
      {
        nodes: [
          {
            id: "nested",
            kind: "source",
            name: "Nested",
            parentId: null,
            position: { x: 0, y: 0 },
            type,
          },
        ],
        edges: [],
      },
    );
    let expanded = resolveRuntimeValue(stored.value, stored.structuredValues);
    for (let index = 0; index < depth; index += 1) {
      if (!Array.isArray(expanded) || expanded.length !== 1)
        throw new Error("Lost nested array content.");
      expanded = expanded[0];
    }
    expect(expanded).toBe(12);
  });

  it("keeps prototype-looking Field IDs as own data in stored and expanded values", () => {
    const shape: Shape = {
      id: "prototype-fields",
      name: "Fields",
      fields: [
        {
          id: "__proto__",
          name: "__proto__",
          type: "text",
          required: true,
          defaultValue: "own value",
        },
      ],
    };
    const type: Type = { kind: "shape", shapeId: shape.id };
    const stored = materializeStructuredValue(
      normalizeStructuredValueTemplate({}, type, [shape]),
      type,
      [shape],
    );
    const expanded = resolveRuntimeValue(stored.value, stored.structuredValues);
    expect(Object.getPrototypeOf(expanded)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(expanded, "__proto__")?.value).toBe("own value");
  });
});
