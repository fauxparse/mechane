import type { GraphEdge, SceneNode, Shape, ShowGraph, SourceNode } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { planSourceTypeChange } from "./source-type-change";

const OLD_SHAPE: Shape = {
  id: "shape_old",
  name: "Old",
  fields: [{ id: "field_old", name: "old", type: "number", required: true, defaultValue: 0 }],
};
const NEW_SHAPE: Shape = {
  id: "shape_new",
  name: "New",
  fields: [{ id: "field_new", name: "new", type: "text", required: true, defaultValue: "" }],
};
const TARGET_SHAPE: Shape = {
  id: "shape_target",
  name: "Target",
  fields: [{ id: "field_target", name: "target", type: "text", required: true, defaultValue: "" }],
};

function source(type: SourceNode["type"]): SourceNode {
  return {
    id: "source_one",
    kind: "source",
    name: "Source one",
    parentId: null,
    position: { x: 0, y: 0 },
    type,
  };
}

function scene(variableType?: SceneNode["variables"][number]["type"]): SceneNode {
  return {
    id: "scene_one",
    kind: "scene",
    name: "Scene one",
    parentId: null,
    position: { x: 100, y: 0 },
    variables: [{ id: "variable_one", name: "Value", type: variableType }],
  };
}

function wiring(
  overrides: Partial<Extract<GraphEdge, { kind: "wiring" }>> = {},
): Extract<GraphEdge, { kind: "wiring" }> {
  return {
    id: "edge_one",
    kind: "wiring",
    sourceId: "source_one",
    targetId: "scene_one",
    sourcePath: [],
    targetPath: ["variable_one"],
    ...overrides,
  };
}

describe("planSourceTypeChange", () => {
  it("plans removal of invalid paths and defaults", () => {
    const graph: ShowGraph = {
      nodes: [source({ kind: "shape", shapeId: OLD_SHAPE.id }), scene()],
      edges: [wiring({ sourcePath: ["field_old"] })],
      shapes: [OLD_SHAPE, NEW_SHAPE],
      sourceFieldDefaults: [{ nodeId: "source_one", fieldPath: ["field_old"], value: 4 }],
    };
    const plan = planSourceTypeChange(graph, "source_one", {
      kind: "shape",
      shapeId: NEW_SHAPE.id,
    });
    expect(plan?.edgeRemovals.map((impact) => impact.edge.id)).toEqual(["edge_one"]);
    expect(plan?.defaultImpacts.map((impact) => impact.fieldPath)).toEqual([["field_old"]]);
    expect(plan?.edits).toEqual([
      {
        type: "graph.setSourceType",
        nodeId: "source_one",
        sourceType: { kind: "shape", shapeId: NEW_SHAPE.id },
      },
      {
        type: "graph.setSourceFieldDefault",
        nodeId: "source_one",
        fieldPath: ["field_old"],
        value: null,
      },
      { type: "graph.removeEdge", edgeId: "edge_one" },
    ]);
  });

  it("plans pruning invalid stable field mappings while keeping a compatible edge", () => {
    const graph: ShowGraph = {
      nodes: [
        source({ kind: "shape", shapeId: OLD_SHAPE.id }),
        scene({ kind: "shape", shapeId: TARGET_SHAPE.id }),
      ],
      edges: [wiring({ fieldMapping: { field_old: "field_target" } })],
      shapes: [OLD_SHAPE, NEW_SHAPE, TARGET_SHAPE],
    };
    const plan = planSourceTypeChange(graph, "source_one", {
      kind: "shape",
      shapeId: NEW_SHAPE.id,
    });
    expect(plan?.edgeRemovals).toHaveLength(0);
    expect(plan?.mappingChanges).toEqual([
      {
        edgeId: "edge_one",
        mapping: null,
        sourcePath: "Value",
        targetPath: "variable_one",
      },
    ]);
  });

  it("migrates a lossless default without treating it as data loss", () => {
    const graph: ShowGraph = {
      nodes: [source("number"), scene()],
      edges: [],
      sourceFieldDefaults: [{ nodeId: "source_one", fieldPath: [], value: 42 }],
    };
    const plan = planSourceTypeChange(graph, "source_one", "text");
    expect(plan?.defaultImpacts).toHaveLength(0);
    expect(plan?.migratedDefaults).toEqual([{ fieldPath: [], value: "42", losses: [] }]);
  });

  it("ignores dormant defaults when a compatible incoming connection drives the Source", () => {
    const input = { ...source("number"), id: "source_input", name: "Input" };
    const graph: ShowGraph = {
      nodes: [input, source("number")],
      edges: [
        {
          id: "edge_input",
          kind: "wiring",
          sourceId: input.id,
          targetId: "source_one",
          sourcePath: [],
          targetPath: [],
        },
      ],
      sourceFieldDefaults: [{ nodeId: "source_one", fieldPath: [], value: 42 }],
    };
    const plan = planSourceTypeChange(graph, "source_one", "text");
    expect(plan?.edgeRemovals).toHaveLength(0);
    expect(plan?.defaultImpacts).toHaveLength(0);
    expect(plan?.migratedDefaults).toHaveLength(0);
    expect(plan?.edits).toEqual([
      { type: "graph.setSourceType", nodeId: "source_one", sourceType: "text" },
    ]);
  });
});
