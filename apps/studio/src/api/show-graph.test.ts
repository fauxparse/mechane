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
  cues: [],
  actions: [],
  eventBindings: [],
} as unknown as ShowGraph;

const reorder: GraphEdit = {
  type: "graph.reorderSceneVariables",
  sceneId: "scene-a",
  variableIds: ["variable-b", "variable-a"],
};

const cachedCue = {
  id: "cue-old",
  name: "Old cue",
  ownerKind: "scene",
  sceneId: "scene-a",
  blockId: null,
  actionIds: ["action-old"],
  parameters: [],
};
const interactionGraph = {
  ...graph,
  cues: [cachedCue],
  actions: [
    {
      __typename: "NavigateAction",
      id: "action-old",
      cueId: "cue-old",
      kind: "navigate",
      targetSceneId: "scene-b",
      layout: null,
    },
  ],
  eventBindings: [
    {
      id: "binding-old",
      canvasId: "canvas-a",
      elementId: "button-a",
      eventKind: "tap",
      params: null,
      cueId: "cue-old",
      position: 0,
    },
  ],
} as unknown as ShowGraph;

const newCue: GraphEdit = {
  type: "graph.addCue",
  cue: {
    id: "cue-new",
    name: "New cue",
    owner: { kind: "scene", sceneId: "scene-a" },
    actionIds: [],
  },
};
const removeCachedCue: GraphEdit = {
  type: "graph.removeCue",
  cueId: "cue-old",
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
  it("adds a newly-created Cue to the cached graph", () => {
    const patched = patchShowGraphQueryData(graph, [newCue]);

    expect(patched?.cues.map((cue) => cue.id)).toEqual(["cue-new"]);
    expect(patched?.cues[0]).toMatchObject({
      id: "cue-new",
      name: "New cue",
      ownerKind: "scene",
      sceneId: "scene-a",
      blockId: null,
      actionIds: [],
      parameters: [],
    });
  });

  it("removes a Cue and its dependent interactions from the cache", () => {
    const patched = patchShowGraphQueryData(interactionGraph, [removeCachedCue]);

    expect(patched?.cues).toEqual([]);
    expect(patched?.actions).toEqual([]);
    expect(patched?.eventBindings).toEqual([]);
  });
});
