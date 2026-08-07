import { assertValidShowGraph } from "@mechane/domain";
import type { FlowNode, NavigateEdge, SceneNode, WiringEdge } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { toEditInput, toShowGraph } from "./api-graph";
import type { ApiGraph } from "./api-graph";

type ApiNode = ApiGraph["nodes"][number];
type ApiEdge = ApiGraph["edges"][number];

/** A node as GraphQL returns it: every kind's fields present, most of them null. */
function apiNode(overrides: Pick<ApiNode, "id" | "kind"> & Partial<ApiNode>): ApiNode {
  return {
    name: overrides.id,
    parentId: null,
    defaultSceneId: null,
    position: { x: 0, y: 0 },
    variables: [],
    perConnection: false,
    pairingCode: null,
    ...overrides,
  };
}

function apiEdge(overrides: Pick<ApiEdge, "id" | "kind" | "sourceId" | "targetId">): ApiEdge {
  return {
    sourcePath: [],
    targetPath: [],
    targetVariableId: null,
    cueId: null,
    actionId: null,
    ...overrides,
  };
}

const GRAPH: ApiGraph = {
  nodes: [
    apiNode({ id: "flow_vote", kind: "flow", name: "Vote", defaultSceneId: "scene_voting" }),
    apiNode({
      id: "scene_voting",
      kind: "scene",
      parentId: "flow_vote",
      position: { x: 24, y: 48 },
      variables: [{ id: "variable_prompt", name: "prompt" }],
    }),
    apiNode({ id: "source_tally", kind: "source", position: { x: 300, y: 0 } }),
    apiNode({ id: "transformer_winner", kind: "transformer" }),
    apiNode({ id: "device_phone", kind: "device" }),
  ],
  edges: [
    {
      ...apiEdge({
        id: "edge_wire",
        kind: "wiring",
        sourceId: "source_tally",
        targetId: "scene_voting",
      }),
      targetPath: ["variable_prompt"],
      targetVariableId: "variable_prompt",
    },
    apiEdge({
      id: "edge_navigate",
      kind: "navigate",
      sourceId: "scene_voting",
      targetId: "scene_voting",
    }),
    apiEdge({ id: "edge_device", kind: "device", sourceId: "flow_vote", targetId: "device_phone" }),
  ],
};

describe("toShowGraph", () => {
  it("converts every node kind", () => {
    const graph = toShowGraph(GRAPH);
    expect(graph.nodes.map((node) => node.kind)).toEqual([
      "flow",
      "scene",
      "source",
      "transformer",
      "device",
    ]);
  });

  it("keeps names, positions, containment, and Variables", () => {
    const graph = toShowGraph(GRAPH);
    const voting = graph.nodes.find((node) => node.id === "scene_voting") as SceneNode;
    expect(voting.name).toBe("scene_voting");
    expect(voting.position).toEqual({ x: 24, y: 48 });
    expect(voting.parentId).toBe("flow_vote");
    expect(voting.variables).toEqual([{ id: "variable_prompt", name: "prompt" }]);
  });

  it("keeps a Flow's default Scene", () => {
    const flow = toShowGraph(GRAPH).nodes.find((node) => node.id === "flow_vote") as FlowNode;
    expect(flow.defaultSceneId).toBe("scene_voting");
  });

  // The point of the conversion: fields that don't belong to a kind are gone,
  // not carried along as nulls, so the commands act on the domain's union.
  it("drops fields that don't belong to a kind", () => {
    const graph = toShowGraph(GRAPH);
    const source = graph.nodes.find((node) => node.id === "source_tally");
    expect(source).not.toHaveProperty("defaultSceneId");
    expect(source).not.toHaveProperty("variables");
    expect(graph.nodes.find((node) => node.id === "device_phone")).not.toHaveProperty("variables");
  });

  it("converts every edge kind, keeping paths and Cue/Action ids", () => {
    const graph = toShowGraph(GRAPH);
    const wire = graph.edges.find((edge) => edge.id === "edge_wire") as WiringEdge;
    expect(wire.targetPath).toEqual(["variable_prompt"]);
    const navigate = graph.edges.find((edge) => edge.id === "edge_navigate") as NavigateEdge;
    expect(navigate.cueId).toBeNull();
    expect(navigate.actionId).toBeNull();
    expect(graph.edges.map((edge) => edge.kind)).toEqual(["wiring", "navigate", "device"]);
  });

  it("produces a graph the domain accepts", () => {
    // The fixture's Navigate edge is a self-loop, which is structurally legal;
    // what matters is that nothing about the conversion invents a violation.
    expect(() => assertValidShowGraph(toShowGraph(GRAPH))).not.toThrow();
  });

  it("treats a missing graph as the empty graph", () => {
    expect(toShowGraph(null)).toEqual({ nodes: [], edges: [] });
    expect(toShowGraph(undefined)).toEqual({ nodes: [], edges: [] });
  });

  it("refuses a kind this build doesn't know", () => {
    expect(() =>
      toShowGraph({ nodes: [apiNode({ id: "x", kind: "hologram" })], edges: [] }),
    ).toThrow(/Unknown Show graph node kind/);
    expect(() =>
      toShowGraph({
        nodes: [],
        edges: [apiEdge({ id: "e", kind: "telepathy", sourceId: "a", targetId: "b" })],
      }),
    ).toThrow(/Unknown Show graph edge kind/);
  });
});

describe("toEditInput", () => {
  it("sends a whole node for an add, ready to be restored by an undo", () => {
    // The awkward one: an undone delete arrives back as `graph.addNode`
    // carrying the node the delete destroyed, Variables and all, so the
    // server rebuilds it rather than being told to remember it.
    expect(
      toEditInput({
        type: "graph.addNode",
        node: {
          id: "scene_lobby",
          kind: "scene",
          name: "Lobby",
          parentId: "flow_vote",
          position: { x: 3, y: 4 },
          variables: [{ id: "variable_prompt", name: "prompt" }],
        },
      }),
    ).toEqual({
      type: "graph.addNode",
      node: {
        id: "scene_lobby",
        kind: "scene",
        name: "Lobby",
        parentId: "flow_vote",
        defaultSceneId: null,
        position: { x: 3, y: 4 },
        variables: [{ id: "variable_prompt", name: "prompt" }],
        perConnection: false,
      },
    });
  });

  it("sends only what an edit's type is about", () => {
    expect(toEditInput({ type: "graph.removeNode", nodeId: "scene_lobby" })).toEqual({
      type: "graph.removeNode",
      nodeId: "scene_lobby",
    });
    expect(
      toEditInput({ type: "graph.renameSceneVariable", sceneId: "s", variableId: "v", name: "n" }),
    ).toEqual({ type: "graph.renameSceneVariable", sceneId: "s", variableId: "v", name: "n" });
  });

  it("carries the nulls that mean something", () => {
    // "Out to Show level" and "no entry Scene" are values, not omissions.
    expect(
      toEditInput({
        type: "graph.reparentNode",
        nodeId: "scene_lobby",
        parentId: null,
        position: { x: 0, y: 0 },
      }),
    ).toMatchObject({ parentId: null });
    expect(
      toEditInput({ type: "graph.setFlowDefaultScene", flowId: "flow_vote", sceneId: null }),
    ).toMatchObject({ sceneId: null });
  });

  it("doesn't send a pairing code, which is the server's to mint (#45)", () => {
    const input = toEditInput({
      type: "graph.addNode",
      node: {
        id: "device_phone",
        kind: "device",
        name: "Phones",
        parentId: null,
        position: { x: 0, y: 0 },
        perConnection: true,
        pairingCode: "AB12C",
      },
    });
    expect(input.node).not.toHaveProperty("pairingCode");
    expect(input.node).toMatchObject({ perConnection: true });
  });
});
