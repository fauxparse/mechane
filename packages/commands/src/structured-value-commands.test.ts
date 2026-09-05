import { describe, expect, it } from "vitest";

import type { Shape, ShowGraph } from "@mechane/domain";
import { isArrayStructuredValueTemplate, isShapeStructuredValueTemplate } from "@mechane/domain";
import { applyGraphEdits } from "./graph-edits";
import { setSourceFieldDefault } from "./graph-commands";

const person: Shape = {
  id: "person",
  name: "Person",
  fields: [{ id: "name", name: "Name", type: "text", required: true, defaultValue: "" }],
};
const graph: ShowGraph = {
  shapes: [person],
  nodes: [
    {
      id: "source_people",
      kind: "source",
      name: "People",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "array", of: { kind: "shape", shapeId: person.id } },
    },
  ],
  edges: [],
};

describe("Structured Value command boundary", () => {
  it("mints IDs once and keeps them in the undoable graph value", () => {
    const value = [{ name: "Ada" }, { name: "Grace" }];
    const applied = setSourceFieldDefault("source_people", [], value).apply(graph).state;
    const first = applied.sourceFieldDefaults?.[0]?.value;
    if (!isArrayStructuredValueTemplate(first)) {
      throw new Error("Expected a normalized array template.");
    }
    const ids = first.items.map((item) => {
      if (!isShapeStructuredValueTemplate(item)) throw new Error("Expected a Shape template.");
      return item.id;
    });
    expect(new Set([first.id, ...ids]).size).toBe(3);
    expect(
      applyGraphEdits(applied, [
        {
          type: "graph.setSourceFieldDefault",
          nodeId: "source_people",
          fieldPath: [],
          value: first,
        },
      ]),
    ).toEqual(applied);
  });
});
