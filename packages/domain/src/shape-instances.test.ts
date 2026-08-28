import { describe, expect, it } from "vitest";

import {
  assertValueConformsToType,
  createShapeCollectionInstance,
  isShapeCollectionInstance,
  normalizeShapeCollectionInstances,
  type Shape,
  type Type,
} from "./shapes";
import { expandSlotInstances } from "./slots";

const person: Shape = {
  id: "person",
  name: "Person",
  fields: [{ id: "name", name: "Name", type: "text", required: true, defaultValue: "" }],
};
const people: Type = { kind: "array", of: { kind: "shape", shapeId: person.id } };

function item(name: string) {
  return { name };
}

describe("Shape collection instance identity", () => {
  it("mints IDs outside values and preserves them through reorder", () => {
    const normalized = normalizeShapeCollectionInstances([item("Ada"), item("Grace")], people, [
      person,
    ]);
    expect(normalized).toHaveLength(2);
    if (!Array.isArray(normalized)) throw new Error("Expected a collection.");
    const [ada, grace] = normalized;
    if (!isShapeCollectionInstance(ada) || !isShapeCollectionInstance(grace)) {
      throw new Error("Expected Shape collection envelopes.");
    }

    const reordered = normalizeShapeCollectionInstances([grace, ada], people, [person]);
    expect(reordered).toEqual([grace, ada]);
    expect(ada.value).toEqual(item("Ada"));
    expect(grace.value).toEqual(item("Grace"));
  });

  it("mints a new ID for inserted and duplicated items", () => {
    const original = createShapeCollectionInstance(item("Ada"));
    const normalized = normalizeShapeCollectionInstances(
      [original, original, item("Grace")],
      people,
      [person],
    );
    if (!Array.isArray(normalized)) throw new Error("Expected a collection.");
    const ids = normalized.map((value) => {
      if (!isShapeCollectionInstance(value))
        throw new Error("Expected Shape collection envelopes.");
      return value.id;
    });
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(original.id);
    expect(ids[1]).not.toBe(original.id);
  });

  it("validates and exposes the raw item to Slot expansion", () => {
    const first = createShapeCollectionInstance(item("Ada"));
    const second = createShapeCollectionInstance(item("Grace"));
    assertValueConformsToType([first, second], people, [person]);
    expect(expandSlotInstances([first, second]).instances).toEqual([
      { id: first.id, index: 0, item: item("Ada") },
      { id: second.id, index: 1, item: item("Grace") },
    ]);
  });
});
