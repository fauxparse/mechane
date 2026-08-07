import { assertValidShowGraph } from "@mechane/domain";
import type { FlowNode, NavigateEdge, SceneNode, WiringEdge } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { toEditInput, toGraphEdit, toShowGraph } from "./api-graph";
import type { ApiGraph } from "./api-graph";

type ApiNode = ApiGraph["nodes"][number];
type ApiEdge = ApiGraph["edges"][number];

/** A node fixture using the domain kind vocabulary as a shorthand for __typename. */
function apiNode(overrides: { id: string; kind: string } & Partial<ApiNode>): ApiNode {
  const { kind, ...rest } = overrides;
  const typeName =
    { scene: "SceneNode", flow: "FlowNode", source: "SourceNode", transformer: "TransformerNode", device: "DeviceNode" }[
      kind
    ] ?? kind;
  return {
    __typename: typeName,
    name: overrides.id,
    parentId: null,
    defaultSceneId: null,
    sourceType: kind === "source" ? { kind: "text", shapeId: null, of: null } : undefined,
    transformerType: kind === "transformer" ? null : undefined,
    fieldDefaults: [],
    position: { x: 0, y: 0 },
    variables: [],
    perConnection: false,
    pairingCode: null,
    ...rest,
  } as ApiNode;
}

function apiEdge(
  overrides: { id: string; kind: string; sourceId: string; targetId: string } & Partial<ApiEdge>,
): ApiEdge {
  const { kind, ...rest } = overrides;
  const typeName = { wiring: "WiringEdge", navigate: "NavigateEdge", device: "DeviceEdge" }[kind] ?? kind;
  return {
    __typename: typeName,
    sourcePath: [],
    targetPath: [],
    targetVariableId: null,
    fieldMapping: null,
    cueId: null,
    actionId: null,
    ...rest,
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
      variables: [{ id: "variable_prompt", name: "prompt", type: null }],
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
    expect(voting.variables).toEqual([{ id: "variable_prompt", name: "prompt", type: null }]);
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
    expect(toShowGraph(null)).toEqual({ shapes: [], nodes: [], edges: [] });
    expect(toShowGraph(undefined)).toEqual({ shapes: [], nodes: [], edges: [] });
  });

  it("refuses a kind this build doesn't know", () => {
    expect(() =>
      toShowGraph({ nodes: [apiNode({ id: "x", kind: "hologram" })], edges: [] }),
    ).toThrow(/Unknown Show graph node typename/);
    expect(() =>
      toShowGraph({
        nodes: [],
        edges: [apiEdge({ id: "e", kind: "telepathy", sourceId: "a", targetId: "b" })],
      }),
    ).toThrow(/Unknown Show graph edge typename/);
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
          variables: [{ id: "variable_prompt", name: "prompt", type: null }],
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
        type: null,
        position: { x: 3, y: 4 },
        variables: [{ id: "variable_prompt", name: "prompt", type: null }],
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

describe("toGraphEdit", () => {
  it("reads a minted pairing code back as an edit the editor can apply", () => {
    expect(
      toGraphEdit({
        type: "graph.setDevicePairingCode",
        nodeId: "device_phone",
        pairingCode: "AB12C",
      }),
    ).toEqual({
      type: "graph.setDevicePairingCode",
      nodeId: "device_phone",
      pairingCode: "AB12C",
    });
  });

  it("refuses an amendment this build doesn't understand", () => {
    // A server ahead of this client. Applying half of what it sent would put
    // the editor on a graph neither of them believes in.
    expect(() => toGraphEdit({ type: "graph.explode", nodeId: null, pairingCode: null })).toThrow(
      /Unknown Show graph amendment/,
    );
  });

  it("won't send a pairing code back the other way", () => {
    expect(() =>
      toEditInput({
        type: "graph.setDevicePairingCode",
        nodeId: "device_phone",
        pairingCode: "AB12C",
      }),
    ).toThrow(/server's to mint/);
  });
});
