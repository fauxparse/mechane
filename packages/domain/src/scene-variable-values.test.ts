import { describe, expect, it } from "vitest";

import type { SceneNode, ShowGraph, SourceNode } from "./graph";
import { defaultSourceValues } from "./source-defaults";
import { sceneVariableValues } from "./scene-variable-values";

const at = { x: 0, y: 0 };

function source(id: string, type: SourceNode["type"]): SourceNode {
  return {
    id,
    kind: "source",
    name: id,
    position: at,
    parentId: null,
    type,
  };
}

function scene(): SceneNode {
  return {
    id: "scene",
    kind: "scene",
    name: "Scene",
    position: at,
    parentId: null,
    variables: [{ id: "values", name: "Values", type: { kind: "array", of: "number" } }],
  };
}

describe("sceneVariableValues", () => {
  it("assembles scalar and array inputs into an array Source", () => {
    const graph: ShowGraph = {
      nodes: [
        source("one", "number"),
        source("many", { kind: "array", of: "number" }),
        source("array", { kind: "array", of: "number" }),
        scene(),
      ],
      edges: [
        {
          id: "one-to-array",
          kind: "wiring",
          sourceId: "one",
          targetId: "array",
          sourcePath: [],
          targetPath: [],
        },
        {
          id: "many-to-array",
          kind: "wiring",
          sourceId: "many",
          targetId: "array",
          sourcePath: [],
          targetPath: [],
        },
        {
          id: "array-to-scene",
          kind: "wiring",
          sourceId: "array",
          targetId: "scene",
          sourcePath: [],
          targetPath: ["values"],
        },
      ],
      sourceFieldDefaults: [
        { nodeId: "one", fieldPath: [], value: 1 },
        { nodeId: "many", fieldPath: [], value: [2, 3] },
      ],
    };

    const defaults = defaultSourceValues(graph);
    expect(defaults.one).toBe(1);
    expect(defaults.many).toEqual([2, 3]);
    expect(sceneVariableValues(graph, "scene", defaults)).toEqual({
      values: [1, 2, 3],
    });
  });
});
