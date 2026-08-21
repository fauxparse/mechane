import type { GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/graphql-schema";
import { describe, expect, it } from "vitest";

import { patchShowGraphQueryData } from "./show-graph";

const graph = {
  nodes: [
    {
      __typename: "SceneNode",
      id: "scene-a",
      variables: [
        { id: "variable-a", name: "A" },
        { id: "variable-b", name: "B" },
      ],
    },
    { __typename: "SourceNode", id: "source-a" },
  ],
  edges: [],
} as unknown as ShowGraph;

const reorder: GraphEdit = {
  type: "graph.reorderSceneVariables",
  sceneId: "scene-a",
  variableIds: ["variable-b", "variable-a"],
};

describe("patchShowGraphQueryData", () => {
  it("reorders the cached Scene Variables without refetching", () => {
    const patched = patchShowGraphQueryData(graph, [reorder]);
    const scene = patched?.nodes.find(
      (node): node is Extract<ShowGraph["nodes"][number], { __typename: "SceneNode" }> =>
        node.id === "scene-a" && node.__typename === "SceneNode",
    );

    expect(scene?.variables?.map((variable) => variable.id)).toEqual(["variable-b", "variable-a"]);
    expect(patched?.nodes.find((node) => node.id === "source-a")).toBe(graph.nodes[1]);
  });

  it("leaves the cache unchanged for an invalid cached order", () => {
    const patched = patchShowGraphQueryData(graph, [
      { ...reorder, variableIds: ["missing", "variable-a"] },
    ]);

    expect(patched).toBe(graph);
  });
});
