import { describe, expect, it } from "vitest";

import { sceneVariableValues } from "./scene-variable-values";
import type { ShowGraph, WiringEdge } from "./graph";
const graph: ShowGraph = {
  shapes: [
    {
      id: "shape_source",
      name: "Source Shape",
      fields: [
        { id: "source_title", name: "Title", type: "text", required: true, defaultValue: "" },
      ],
    },
    {
      id: "shape_target",
      name: "Target Shape",
      fields: [
        { id: "target_heading", name: "Heading", type: "text", required: true, defaultValue: "" },
      ],
    },
  ],
  nodes: [
    {
      id: "source",
      kind: "source",
      name: "Source",
      position: { x: 0, y: 0 },
      parentId: null,
      type: { kind: "shape", shapeId: "shape_source" },
    },
    {
      id: "scene",
      kind: "scene",
      name: "Scene",
      position: { x: 0, y: 0 },
      parentId: null,
      variables: [
        { id: "variable", name: "Variable", type: { kind: "shape", shapeId: "shape_target" } },
      ],
    },
  ],
  edges: [
    {
      id: "edge",
      kind: "wiring",
      sourceId: "source",
      targetId: "scene",
      sourcePath: [],
      targetPath: ["variable"],
      fieldMapping: { source_title: "target_heading" },
    },
  ],
};

describe("sceneVariableValues", () => {
  it("propagates values through a value-handle Shape field mapping", () => {
    expect(
      sceneVariableValues(graph, "scene", {
        source: { source_title: "From the value handle" },
      }),
    ).toEqual({ variable: { target_heading: "From the value handle" } });
  });

  it("still propagates a direct field handle without a mapping", () => {
    const directGraph: ShowGraph = {
      ...graph,
      edges: [
        {
          id: "edge",
          kind: "wiring",
          sourceId: "source",
          targetId: "scene",
          sourcePath: ["source_title"],
          targetPath: ["variable"],
        } satisfies WiringEdge,
      ],
      nodes: graph.nodes.map((node) =>
        node.kind === "scene"
          ? { ...node, variables: [{ id: "variable", name: "Variable", type: "text" }] }
          : node,
      ),
    };

    expect(
      sceneVariableValues(directGraph, "scene", {
        source: { source_title: "Direct field" },
      }),
    ).toEqual({ variable: "Direct field" });
  });
});
