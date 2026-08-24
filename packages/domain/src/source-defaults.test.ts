import { describe, expect, it } from "vitest";

import { defaultSourceValues } from "./source-defaults";

const graph = {
  shapes: [
    {
      id: "shape_vote",
      name: "Vote",
      fields: [
        {
          id: "field_count",
          name: "Count",
          type: "number" as const,
          required: true,
          defaultValue: 12,
        },
        {
          id: "field_label",
          name: "Label",
          type: "text" as const,
          required: false,
          defaultValue: null,
        },
      ],
    },
  ],
  sourceFieldDefaults: [{ nodeId: "source_votes", fieldPath: ["field_count"], value: 3 }],
  nodes: [
    {
      id: "source_votes",
      kind: "source" as const,
      name: "Votes",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape" as const, shapeId: "shape_vote" },
      fieldDefaults: [
        { nodeId: "source_votes", fieldPath: ["field_count"], value: 99 },
        { nodeId: "source_votes", fieldPath: ["field_label"], value: "votes" },
      ],
    },
    {
      id: "source_count",
      kind: "source" as const,
      name: "Count",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "number" as const,
    },
  ],
  edges: [],
};

describe("defaultSourceValues", () => {
  it("materialises Shape defaults and sparse Source overrides", () => {
    expect(defaultSourceValues(graph)).toEqual({
      source_votes: { field_count: 3, field_label: "votes" },
      source_count: 0,
    });
  });
});
