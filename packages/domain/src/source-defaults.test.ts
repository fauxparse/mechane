import { describe, expect, it } from "vitest";

import { defaultSourceValues, sourceDefaultsFor } from "./source-defaults";

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
  sourceFieldDefaults: [
    { nodeId: "source_votes", fieldPath: ["field_count"], value: 3 },
    { nodeId: "source_votes", fieldPath: ["field_label"], value: "votes" },
  ],
  nodes: [
    {
      id: "source_votes",
      kind: "source" as const,
      name: "Votes",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape" as const, shapeId: "shape_vote" },
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
  it("returns only the requested Source's graph-owned defaults", () => {
    expect(sourceDefaultsFor(graph, "source_votes")).toEqual([
      { nodeId: "source_votes", fieldPath: ["field_count"], value: 3 },
      { nodeId: "source_votes", fieldPath: ["field_label"], value: "votes" },
    ]);
    expect(sourceDefaultsFor(graph, "source_count")).toEqual([]);
  });
  it("materialises Shape defaults and sparse Source overrides", () => {
    expect(defaultSourceValues(graph)).toEqual({
      source_votes: { field_count: 3, field_label: "votes" },
      source_count: 0,
    });
  });
  it("propagates a Shape field value along a wiring edge into a Source", () => {
    const wired = {
      ...graph,
      sourceFieldDefaults: [
        { nodeId: "source_votes", fieldPath: ["field_count"], value: 9 },
        { nodeId: "source_votes", fieldPath: ["field_label"], value: "votes" },
      ],
      edges: [
        {
          id: "edge_votes",
          kind: "wiring" as const,
          sourceId: "source_votes",
          targetId: "source_count",
          sourcePath: ["field_count"],
          targetPath: [],
        },
      ],
    };

    expect(defaultSourceValues(wired)).toMatchObject({
      source_votes: { field_count: 9, field_label: "votes" },
      source_count: 9,
    });
  });
  it("propagates a whole Shape output into a new Source", () => {
    const wired = {
      ...graph,
      sourceFieldDefaults: [
        { nodeId: "source_votes", fieldPath: ["field_count"], value: 9 },
        { nodeId: "source_votes", fieldPath: ["field_label"], value: "votes" },
      ],
      nodes: [
        ...graph.nodes,
        {
          id: "source_copy",
          kind: "source" as const,
          name: "Beatrix copy",
          parentId: null,
          position: { x: 0, y: 0 },
          type: { kind: "shape" as const, shapeId: "shape_vote" },
        },
      ],
      edges: [
        {
          id: "edge_copy",
          kind: "wiring" as const,
          sourceId: "source_votes",
          targetId: "source_copy",
          sourcePath: [],
          targetPath: [],
        },
      ],
    };
    expect(defaultSourceValues(wired)).toMatchObject({
      source_copy: { field_count: 9, field_label: "votes" },
    });
  });
});
