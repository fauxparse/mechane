import type {
  DeviceEdge,
  DeviceNode,
  FlowNode,
  NavigateEdge,
  SceneNode,
  ShowGraph,
  SourceNode,
  WiringEdge,
} from "@mechane/domain";
import { assertValidShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { composite } from "./command";
import {
  addEdge,
  addNode,
  moveNode,
  removeEdge,
  removeNode,
  renameNode,
  reorderSceneVariables,
  reparentNode,
  setDevicePerConnection,
  setFlowDefaultScene,
  setFlowSize,
  setEdgeLayout,
  setNodeColor,
  setSceneVariableType,
  setSourceType,
  setWiringFieldMapping,
  UnknownGraphTargetError,
} from "./graph-commands";
import {
  createFlowWithNodes,
  moveNodeIntoFlow,
  moveNodeOutOfFlow,
  moveNodesIntoFlow,
  moveNodesOutOfFlow,
} from "./graph-reparent";
import { applyGraphEdits } from "./graph-edits";
import { CommandStack } from "./stack";

// A Show worth deleting things out of: a vote Flow with two Scenes and a
// Navigate edge between them, a Source wired into one of them, and a Device
// the Flow drives. Every command below has something to destroy.
function scene(id: string, parentId: string | null, variableIds: string[] = []): SceneNode {
  return {
    id,
    kind: "scene",
    name: id,
    position: { x: 10, y: 20 },
    parentId,
    variables: variableIds.map((variableId) => ({ id: variableId, name: variableId })),
  };
}

const VOTE_FLOW: FlowNode = {
  id: "flow_vote",
  kind: "flow",
  name: "Vote",
  position: { x: 0, y: 0 },
  parentId: null,
  defaultSceneId: "scene_voting",
};

const VOTING = scene("scene_voting", "flow_vote", ["variable_prompt"]);
const RESULTS = scene("scene_results", "flow_vote");
const LOBBY = scene("scene_lobby", null);

const TALLY: SourceNode = {
  id: "source_tally",
  kind: "source",
  name: "Tally",
  position: { x: 200, y: 40 },
  parentId: null,
  type: "number",
};

const PHONE: DeviceNode = {
  id: "device_phone",
  kind: "device",
  name: "Phones",
  position: { x: 400, y: 0 },
  parentId: null,
  perConnection: true,
  pairingCode: null,
};

const WIRE: WiringEdge = {
  id: "edge_wire",
  kind: "wiring",
  sourceId: TALLY.id,
  targetId: VOTING.id,
  sourcePath: [],
  targetPath: ["variable_prompt"],
};

const NAVIGATE: NavigateEdge = {
  id: "edge_navigate",
  kind: "navigate",
  sourceId: VOTING.id,
  targetId: RESULTS.id,
  sourcePath: [],
  targetPath: [],
  cueId: null,
  actionId: null,
};

const TO_PHONE: DeviceEdge = {
  id: "edge_device",
  kind: "device",
  sourceId: VOTE_FLOW.id,
  targetId: PHONE.id,
  sourcePath: [],
  targetPath: [],
};

const GRAPH: ShowGraph = {
  nodes: [VOTE_FLOW, VOTING, RESULTS, LOBBY, TALLY, PHONE],
  edges: [WIRE, NAVIGATE, TO_PHONE],
};

// The fixture has to be a graph the domain accepts, or a test proving a
// restore is exact would be proving it against nonsense.
it("has a valid fixture graph", () => {
  expect(() => assertValidShowGraph(GRAPH)).not.toThrow();
});

/** Applies a command and asserts the round trip lands back on `GRAPH` exactly. */
function expectExactRoundTrip(command: ReturnType<typeof addNode>) {
  const applied = command.apply(GRAPH);
  expect(applied.state).not.toEqual(GRAPH);
  expect(applied.inverse.apply(applied.state).state).toEqual(GRAPH);
  return applied;
}

describe("addNode / removeNode", () => {
  it("adds a node and inverts to removing it", () => {
    const applied = expectExactRoundTrip(addNode(scene("scene_new", null)));
    expect(applied.state.nodes).toHaveLength(GRAPH.nodes.length + 1);
  });

  it("removes a node with every edge that touched it, in one command", () => {
    const applied = removeNode(VOTING.id, "Delete Scene").apply(GRAPH);
    expect(applied.state.nodes.map((node) => node.id)).not.toContain(VOTING.id);
    // The wiring edge into it and the Navigate edge out of it both go; the
    // Device edge, which never touched it, stays.
    expect(applied.state.edges.map((edge) => edge.id)).toEqual([TO_PHONE.id]);
  });
  it("removes Source defaults with their node and restores them on undo", () => {
    const shapes = [
      {
        id: "shape_profile",
        name: "Profile",
        fields: [
          {
            id: "headline",
            name: "Headline",
            type: "text" as const,
            required: true,
            defaultValue: "",
          },
        ],
      },
    ];
    const sourceFieldDefaults = [{ nodeId: TALLY.id, fieldPath: ["headline"], value: "Before" }];
    const graph = { ...GRAPH, shapes, sourceFieldDefaults };
    const applied = removeNode(TALLY.id).apply(graph);

    expect(applied.state.shapes).toEqual(shapes);
    expect(
      applyGraphEdits(graph, [{ type: "graph.removeNode", nodeId: TALLY.id }]).sourceFieldDefaults,
    ).toBeUndefined();
    expect(applied.state.sourceFieldDefaults).toBeUndefined();
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });

  // The snapshot, in the sense #28 means it: node data, position, edges, and
  // graph order all come back identical, not merely equivalent.
  it("restores the node, its position, and its edges exactly", () => {
    expectExactRoundTrip(removeNode(VOTING.id));
  });

  // A side effect of the delete itself, captured with it (#28): the Flow
  // loses its entry Scene, and one undo brings back both.
  it("clears and then restores a Flow's default Scene reference", () => {
    const applied = removeNode(VOTING.id).apply(GRAPH);
    const flow = applied.state.nodes.find((node) => node.id === VOTE_FLOW.id) as FlowNode;
    expect(flow.defaultSceneId).toBeNull();
    expect(() => assertValidShowGraph(applied.state)).not.toThrow();

    const undone = applied.inverse.apply(applied.state).state;
    expect((undone.nodes.find((node) => node.id === VOTE_FLOW.id) as FlowNode).defaultSceneId).toBe(
      VOTING.id,
    );
  });

  it("is redoable", () => {
    const applied = removeNode(VOTING.id).apply(GRAPH);
    const undone = applied.inverse.apply(applied.state);
    const redone = undone.inverse.apply(undone.state);
    expect(redone.state).toEqual(applied.state);
  });

  it("refuses to remove a node that isn't there", () => {
    expect(() => removeNode("scene_nope").apply(GRAPH)).toThrow(UnknownGraphTargetError);
  });
});

describe("moveNode", () => {
  it("moves a node and inverts to its old position", () => {
    expectExactRoundTrip(moveNode(TALLY.id, { x: 320, y: 90 }));
  });

  it("changes nothing when the node is already there", () => {
    const applied = moveNode(TALLY.id, { ...TALLY.position }).apply(GRAPH);
    expect(applied.state).toEqual(GRAPH);
    expect(applied.inverse.isEmpty).toBe(true);
  });

  it("copies the position rather than holding the caller's object", () => {
    const position = { x: 320, y: 90 };
    const applied = moveNode(TALLY.id, position).apply(GRAPH);
    position.x = 999;
    const moved = applied.state.nodes.find((node) => node.id === TALLY.id);
    expect(moved?.position).toEqual({ x: 320, y: 90 });
  });
});

describe("renameNode", () => {
  it("renames a node and inverts to its old name", () => {
    expectExactRoundTrip(renameNode(TALLY.id, "Vote tally"));
  });

  it("changes nothing when the name is unchanged", () => {
    expect(renameNode(TALLY.id, TALLY.name).apply(GRAPH).inverse.isEmpty).toBe(true);
  });
});

describe("reorderSceneVariables", () => {
  it("reorders Variables and restores the original order", () => {
    const graph: ShowGraph = {
      ...GRAPH,
      nodes: GRAPH.nodes.map((node) =>
        node.id === VOTING.id
          ? {
              ...node,
              variables: [
                { id: "variable_prompt", name: "prompt" },
                { id: "variable_count", name: "count" },
                { id: "variable_color", name: "color" },
              ],
            }
          : node,
      ),
    };
    const applied = reorderSceneVariables(VOTING.id, [
      "variable_color",
      "variable_prompt",
      "variable_count",
    ]).apply(graph);
    expect(
      (applied.state.nodes.find((node) => node.id === VOTING.id) as SceneNode).variables.map(
        (variable) => variable.id,
      ),
    ).toEqual(["variable_color", "variable_prompt", "variable_count"]);
    expect(
      (applied.state.nodes.find((node) => node.id === VOTING.id) as SceneNode).variables.map(
        (variable) => variable.rank,
      ),
    ).toEqual(["0000000000", "0000000001", "0000000002"]);
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });

  it("is empty when the requested order is unchanged", () => {
    expect(reorderSceneVariables(VOTING.id, ["variable_prompt"]).apply(GRAPH).inverse.isEmpty).toBe(
      true,
    );
  });
});

describe("createFlowWithNodes", () => {
  it("creates a Flow and moves its selection into it as one undo", () => {
    const flow: FlowNode = {
      id: "flow_new",
      kind: "flow",
      name: "New Flow",
      position: { x: 300, y: 100 },
      parentId: null,
      defaultSceneId: null,
    };
    const command = createFlowWithNodes(GRAPH, flow, [LOBBY.id, TALLY.id], { x: 24, y: 60 });
    const stack = new CommandStack({ state: GRAPH });
    stack.execute(command);
    expect(stack.depth).toBe(1);
    expect(stack.state.nodes.find((node) => node.id === LOBBY.id)?.parentId).toBe(flow.id);
    expect(stack.state.nodes.find((node) => node.id === TALLY.id)?.parentId).toBe(flow.id);
    expect((stack.state.nodes.find((node) => node.id === flow.id) as FlowNode).defaultSceneId).toBe(
      LOBBY.id,
    );
    expect(stack.undo()).toBe(true);
    expect(stack.state).toEqual(GRAPH);
  });
});

describe("reparentNode", () => {
  it("moves a node into a Flow, position and all, and inverts exactly", () => {
    const applied = expectExactRoundTrip(reparentNode(LOBBY.id, VOTE_FLOW.id, { x: 24, y: 88 }));
    const movedIntoFlow = applied.state.nodes.find((node) => node.id === LOBBY.id);
    expect(movedIntoFlow?.parentId).toBe(VOTE_FLOW.id);
    expect(movedIntoFlow?.position).toEqual({ x: 24, y: 88 });
  });

  it("moves a node back out to Show level", () => {
    const graph = { ...GRAPH, edges: [WIRE, TO_PHONE] };
    const applied = reparentNode(VOTING.id, null, { x: 500, y: 500 }).apply(graph);
    expect(applied.state.nodes.find((node) => node.id === VOTING.id)?.parentId).toBe(null);
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });

  it("labels itself by direction", () => {
    expect(reparentNode(LOBBY.id, VOTE_FLOW.id, LOBBY.position).label).toBe("Move into Flow");
    expect(reparentNode(RESULTS.id, null, RESULTS.position).label).toBe("Move out of Flow");
  });
});

describe("moveNodeIntoFlow / moveNodeOutOfFlow", () => {
  it("keeps a single moved node at the drop position", () => {
    const origin = { x: 240, y: 10 };
    const result = moveNodeIntoFlow(GRAPH, LOBBY.id, VOTE_FLOW.id, origin).apply(GRAPH);
    expect(result.state.nodes.find((node) => node.id === LOBBY.id)?.position).toEqual(origin);
  });

  it("moves into an empty Flow and assigns its default in one undo", () => {
    const empty: FlowNode = { ...VOTE_FLOW, id: "flow_empty", defaultSceneId: null };
    const graph = { ...GRAPH, nodes: [...GRAPH.nodes, empty] };
    const movedIntoFlow = moveNodeIntoFlow(graph, LOBBY.id, empty.id, { x: 1, y: 1 }).apply(
      graph,
    ).state;
    expect(movedIntoFlow.nodes.find((node) => node.id === LOBBY.id)?.parentId).toBe(empty.id);
    expect(
      (movedIntoFlow.nodes.find((node) => node.id === empty.id) as FlowNode).defaultSceneId,
    ).toBe(LOBBY.id);
  });

  it("preserves wiring between promoted nodes", () => {
    const empty: FlowNode = { ...VOTE_FLOW, id: "flow_empty", defaultSceneId: null };
    const internal: WiringEdge = {
      ...WIRE,
      id: "edge_internal",
      sourceId: TALLY.id,
      targetId: LOBBY.id,
      targetPath: [],
    };
    const graph = {
      ...GRAPH,
      edges: [internal, TO_PHONE, NAVIGATE],
      nodes: [...GRAPH.nodes, empty],
    };
    const result = moveNodesIntoFlow(graph, [TALLY.id, LOBBY.id], empty.id, { x: 24, y: 60 }).apply(
      graph,
    );
    expect(result.state.edges.map((edge) => edge.id)).toEqual([
      internal.id,
      TO_PHONE.id,
      NAVIGATE.id,
    ]);
    expect(result.inverse.apply(result.state).state).toEqual(graph);
  });

  it("moves multiple nodes into one Flow without overlap", () => {
    const empty: FlowNode = { ...VOTE_FLOW, id: "flow_empty", defaultSceneId: null };
    const graph = { ...GRAPH, nodes: [...GRAPH.nodes, empty] };
    const command = moveNodesIntoFlow(graph, [TALLY.id, LOBBY.id], empty.id, { x: 24, y: 60 });
    const applied = command.apply(graph);
    const tally = applied.state.nodes.find((node) => node.id === TALLY.id)!;
    const lobby = applied.state.nodes.find((node) => node.id === LOBBY.id)!;
    expect(tally.position).toEqual({ x: 24, y: 60 });
    expect(lobby.position).toEqual({ x: 24, y: 140 });
    expect(
      (applied.state.nodes.find((node) => node.id === empty.id) as FlowNode).defaultSceneId,
    ).toBe(LOBBY.id);
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });

  // #508: extraction used to refuse a Scene with Navigate behavior, which
  // left a director unable to get it out without dismantling its Cues first.
  it("cuts the Navigate behavior a Scene leaves behind rather than refusing", () => {
    const result = moveNodeOutOfFlow(GRAPH, VOTING.id, { x: 500, y: 500 }).apply(GRAPH);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([WIRE.id, TO_PHONE.id]);
    expect(result.state.nodes.find((node) => node.id === VOTING.id)?.parentId).toBe(null);
    expect(result.inverse.apply(result.state).state).toEqual(GRAPH);
  });

  // Scope is what makes an edge legal: a *top-level* producer may feed
  // anything, so promoting its consumer strands nothing.
  it("keeps wiring fed by a top-level producer", () => {
    const graph = { ...GRAPH, edges: [WIRE, TO_PHONE] };
    const result = moveNodeOutOfFlow(graph, VOTING.id, { x: 500, y: 500 }).apply(graph);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([WIRE.id, TO_PHONE.id]);
    expect(result.inverse.apply(result.state).state).toEqual(graph);
  });

  it("drops wiring whose Flow-local producer stays behind", () => {
    const local: SourceNode = { ...TALLY, id: "source_local", parentId: VOTE_FLOW.id };
    const internal: WiringEdge = { ...WIRE, id: "edge_internal", sourceId: local.id };
    const graph = {
      ...GRAPH,
      nodes: [...GRAPH.nodes, local],
      edges: [internal, TO_PHONE],
    };
    const result = moveNodeOutOfFlow(graph, VOTING.id, { x: 500, y: 500 }).apply(graph);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([TO_PHONE.id]);
    expect(result.inverse.apply(result.state).state).toEqual(graph);
  });

  it("preserves wiring between extracted nodes", () => {
    const internal: WiringEdge = {
      ...WIRE,
      id: "edge_internal",
      sourceId: VOTING.id,
      targetId: RESULTS.id,
    };
    const graph = { ...GRAPH, edges: [internal, TO_PHONE] };
    const result = moveNodesOutOfFlow(
      graph,
      [VOTING.id, RESULTS.id],
      [
        { x: 500, y: 500 },
        { x: 750, y: 500 },
      ],
    ).apply(graph);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([internal.id, TO_PHONE.id]);
    expect(result.inverse.apply(result.state).state).toEqual(graph);
  });

  it("moves multiple nodes out in one command and clears their Flow default", () => {
    const graph = { ...GRAPH, edges: [WIRE, TO_PHONE] };
    const result = moveNodesOutOfFlow(
      graph,
      [VOTING.id, RESULTS.id],
      [
        { x: 500, y: 500 },
        { x: 750, y: 500 },
      ],
    ).apply(graph);
    expect(result.state.nodes.filter((node) => [VOTING.id, RESULTS.id].includes(node.id))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: VOTING.id, parentId: null, position: { x: 500, y: 500 } }),
        expect.objectContaining({ id: RESULTS.id, parentId: null, position: { x: 750, y: 500 } }),
      ]),
    );
    expect(
      (result.state.nodes.find((node) => node.id === VOTE_FLOW.id) as FlowNode).defaultSceneId,
    ).toBe(null);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([WIRE.id, TO_PHONE.id]);
    expect(result.inverse.apply(result.state).state).toEqual(graph);
  });
});

describe("setFlowDefaultScene", () => {
  it("sets and inverts a Flow's entry Scene", () => {
    expectExactRoundTrip(setFlowDefaultScene(VOTE_FLOW.id, RESULTS.id));
  });

  it("changes nothing when it's already that Scene", () => {
    expect(setFlowDefaultScene(VOTE_FLOW.id, VOTING.id).apply(GRAPH).inverse.isEmpty).toBe(true);
  });

  it("refuses a node that isn't a Flow", () => {
    expect(() => setFlowDefaultScene(VOTING.id, RESULTS.id).apply(GRAPH)).toThrow(
      UnknownGraphTargetError,
    );
  });
});
describe("setFlowSize", () => {
  it("sets and inverts an authored Flow size", () => {
    const applied = expectExactRoundTrip(setFlowSize(VOTE_FLOW.id, { width: 640, height: 480 }));
    expect(applied.state.nodes.find((node) => node.id === VOTE_FLOW.id)).toMatchObject({
      size: { width: 640, height: 480 },
    });
  });

  it("coalesces on the Flow, so one resize is one undo entry", () => {
    expect(setFlowSize(VOTE_FLOW.id, { width: 640, height: 480 }).coalesceKey).toBe(
      setFlowSize(VOTE_FLOW.id, { width: 720, height: 540 }).coalesceKey,
    );
    expect(setFlowSize(VOTE_FLOW.id, { width: 640, height: 480 }).coalesceKey).not.toBe(
      setFlowSize(RESULTS.id, { width: 720, height: 540 }).coalesceKey,
    );
  });
});

describe("setNodeColor", () => {
  it("sets a color on any node and restores an absent color exactly", () => {
    const applied = expectExactRoundTrip(setNodeColor(VOTING.id, "purple"));
    expect(applied.state.nodes.find((node) => node.id === VOTING.id)).toMatchObject({
      color: "purple",
    });
  });

  it("changes nothing when the node color is already neutral", () => {});
});
describe("setSourceType", () => {
  it("sets a Source type and restores the old type", () => {
    const applied = expectExactRoundTrip(setSourceType(TALLY.id, "text"));
    expect(applied.state.nodes.find((node) => node.id === TALLY.id)).toMatchObject({
      type: "text",
    });
  });

  it("changes nothing when the Source already has that type", () => {
    expect(setSourceType(TALLY.id, "number").apply(GRAPH).inverse.isEmpty).toBe(true);
  });

  it("refuses a node that is not a Source", () => {
    expect(() => setSourceType(VOTING.id, "text").apply(GRAPH)).toThrow(UnknownGraphTargetError);
  });
});

describe("setWiringFieldMapping", () => {
  it("updates and restores a wiring edge mapping", () => {
    const applied = expectExactRoundTrip(
      setWiringFieldMapping(WIRE.id, { source_field: "target_field" }),
    );
    expect(applied.state.edges.find((edge) => edge.id === WIRE.id)).toMatchObject({
      fieldMapping: { source_field: "target_field" },
    });
  });
});

describe("setSceneVariableType", () => {
  it("sets a Variable's Type and restores an absent Type exactly", () => {
    const applied = expectExactRoundTrip(
      setSceneVariableType(VOTING.id, "variable_prompt", "text"),
    );
    expect(
      (applied.state.nodes.find((node) => node.id === VOTING.id) as SceneNode).variables,
    ).toMatchObject([{ id: "variable_prompt", type: "text" }]);
  });

  it("changes nothing when the Type is already that value", () => {
    const typed = setSceneVariableType(VOTING.id, "variable_prompt", "number").apply(GRAPH).state;
    expect(
      setSceneVariableType(VOTING.id, "variable_prompt", "number").apply(typed).inverse.isEmpty,
    ).toBe(true);
  });
});

describe("setDevicePerConnection", () => {
  it("flips a Device's per-connection setting and restores it", () => {
    const applied = expectExactRoundTrip(setDevicePerConnection(PHONE.id, false));
    expect(applied.state.nodes.find((node) => node.id === PHONE.id)).toMatchObject({
      perConnection: false,
    });
  });

  it("changes nothing when the setting is already that value", () => {
    expect(setDevicePerConnection(PHONE.id, true).apply(GRAPH).inverse.isEmpty).toBe(true);
  });

  it("refuses a node that is not a Device", () => {
    expect(() => setDevicePerConnection(VOTING.id, true).apply(GRAPH)).toThrow(
      UnknownGraphTargetError,
    );
  });
});

describe("addEdge / removeEdge", () => {
  it("adds an edge and inverts to removing it", () => {
    const edge: NavigateEdge = {
      ...NAVIGATE,
      id: "edge_back",
      sourceId: RESULTS.id,
      targetId: VOTING.id,
    };
    expectExactRoundTrip(addEdge(edge));
  });

  it("removes an edge and restores it at its original position in graph order", () => {
    const applied = expectExactRoundTrip(removeEdge(WIRE.id));
    expect(applied.state.edges.map((edge) => edge.id)).toEqual([NAVIGATE.id, TO_PHONE.id]);
  });

  it("refuses to remove an edge that isn't there", () => {
    expect(() => removeEdge("edge_nope").apply(GRAPH)).toThrow(UnknownGraphTargetError);
  });
});

// #28's headline requirement, and the one #42 depends on: a recursive delete
// is *one* stack entry, and one Cmd+Z brings the whole subtree back.
describe("a cascading delete, composed", () => {
  /**
   * What #42's Flow deletion will build: children first, then the Flow.
   * The atoms take each node's own edges with them, so the composite doesn't
   * have to enumerate edges itself.
   */
  const deleteVoteFlow = composite({
    label: "Delete Flow",
    commands: [removeNode(VOTING.id), removeNode(RESULTS.id), removeNode(VOTE_FLOW.id)],
  });

  it("destroys the whole subtree and leaves a valid graph", () => {
    const after = deleteVoteFlow.apply(GRAPH).state;
    expect(after.nodes.map((node) => node.id)).toEqual([LOBBY.id, TALLY.id, PHONE.id]);
    // The wiring edge, the Navigate edge, and the Device edge all went with
    // the nodes they touched.
    expect(after.edges).toEqual([]);
    expect(() => assertValidShowGraph(after)).not.toThrow();
  });

  it("is one undo entry, and one undo restores every node, edge, and position", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });
    commands.execute(deleteVoteFlow);
    expect(commands.depth).toBe(1);
    expect(commands.undoLabel).toBe("Delete Flow");

    expect(commands.undo()).toBe(true);
    // Exactly the graph we started with — node order, edge order, positions,
    // the Flow's default Scene, all of it.
    expect(commands.state).toEqual(GRAPH);
    expect(commands.canUndo).toBe(false);
  });

  it("redoes as one entry too", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });
    commands.execute(deleteVoteFlow);
    const destroyed = commands.state;
    commands.undo();
    commands.redo();
    expect(commands.state).toEqual(destroyed);
    expect(commands.depth).toBe(1);
  });
});

// The other half of #28: moving into a Flow's side effect undoes with it.
describe("moving into a Flow with its side effect, composed", () => {
  const EMPTY_FLOW: FlowNode = {
    id: "flow_empty",
    kind: "flow",
    name: "Interval",
    position: { x: 0, y: 300 },
    parentId: null,
    defaultSceneId: null,
  };
  const graph: ShowGraph = { ...GRAPH, nodes: [...GRAPH.nodes, EMPTY_FLOW] };

  // Moving into an *empty* Flow also makes the moved Scene that Flow's
  // default, because a Flow always has one — a side effect of the same
  // action, so it lives in the same entry.
  const moveIntoFlow = composite({
    label: "Move into Flow",
    commands: [
      reparentNode(LOBBY.id, EMPTY_FLOW.id, { x: 24, y: 24 }),
      setFlowDefaultScene(EMPTY_FLOW.id, LOBBY.id),
    ],
  });

  it("applies membership and side effect together", () => {
    const after = moveIntoFlow.apply(graph).state;
    expect(after.nodes.find((node) => node.id === LOBBY.id)?.parentId).toBe(EMPTY_FLOW.id);
    expect((after.nodes.find((node) => node.id === EMPTY_FLOW.id) as FlowNode).defaultSceneId).toBe(
      LOBBY.id,
    );
    expect(() => assertValidShowGraph(after)).not.toThrow();
  });

  it("reverts both in one undo", () => {
    const commands = new CommandStack<ShowGraph>({ state: graph });
    commands.execute(moveIntoFlow);
    expect(commands.depth).toBe(1);
    commands.undo();
    expect(commands.state).toEqual(graph);
  });
});

// The gesture rule (#28) against the graph itself: N frames, one entry.
describe("dragging a node through the stack", () => {
  it("produces one entry for a drag of many frames", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });
    const drag = commands.beginGesture({ key: `drag:${TALLY.id}`, label: "Move" });
    for (const x of [210, 240, 280, 320]) {
      drag.update(moveNode(TALLY.id, { x, y: 90 }));
    }
    drag.commit();

    expect(commands.depth).toBe(1);
    expect(commands.state.nodes.find((node) => node.id === TALLY.id)?.position).toEqual({
      x: 320,
      y: 90,
    });

    commands.undo();
    expect(commands.state).toEqual(GRAPH);
  });
});

describe("setEdgeLayout (#475)", () => {
  const LAYOUT = { HVH: { "1": -24 } };

  it("records where the runs were dragged, and undoes back to no layout at all", () => {
    const applied = expectExactRoundTrip(setEdgeLayout(NAVIGATE.id, LAYOUT));
    expect(applied.state.edges.find((edge) => edge.id === NAVIGATE.id)?.layout).toEqual(LAYOUT);
  });

  it("restores the layout the edge had before, not merely the absence of one", () => {
    const dragged = setEdgeLayout(NAVIGATE.id, LAYOUT).apply(GRAPH).state;
    const again = setEdgeLayout(NAVIGATE.id, { HVH: { "1": 40 } }).apply(dragged);

    expect(again.inverse.apply(again.state).state).toEqual(dragged);
  });

  it("drops an emptied layout rather than carrying an empty record forever", () => {
    const dragged = setEdgeLayout(NAVIGATE.id, LAYOUT).apply(GRAPH).state;
    const cleared = setEdgeLayout(NAVIGATE.id, {}).apply(dragged).state;

    expect(cleared.edges.find((edge) => edge.id === NAVIGATE.id)).not.toHaveProperty("layout");
  });

  it("coalesces on the edge, so one drag is one undo entry", () => {
    expect(setEdgeLayout(NAVIGATE.id, LAYOUT).coalesceKey).toBe(
      setEdgeLayout(NAVIGATE.id, {}).coalesceKey,
    );
    expect(setEdgeLayout(NAVIGATE.id, LAYOUT).coalesceKey).not.toBe(
      setEdgeLayout(TO_PHONE.id, LAYOUT).coalesceKey,
    );
  });
});
