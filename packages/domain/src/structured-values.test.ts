import { describe, expect, it } from "vitest";

import type { ShowGraph } from "./graph";
import { assertValidId } from "./id";
import { expandSlotInstances } from "./slots";
import {
  assertValidRunState,
  InvalidStructuredValueError,
  isArrayStructuredValueTemplate,
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
