import { assertValidShowGraph } from "@mechane/domain";
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
import { describe, expect, it } from "vitest";

import { composite } from "./command";
import {
  addEdge,
  addNode,
  moveNode,
  removeEdge,
  removeNode,
  renameNode,
  extractNode,
  promoteNode,
  InvalidReparentError,
  reparentNode,
  setFlowDefaultScene,
  UnknownGraphTargetError,
} from "./graph-commands";
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
};

const PHONE: DeviceNode = {
  id: "device_phone",
  kind: "device",
  name: "Phones",
  position: { x: 400, y: 0 },
  parentId: null,
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

describe("reparentNode", () => {
  it("moves a node into a Flow, position and all, and inverts exactly", () => {
    const applied = expectExactRoundTrip(reparentNode(LOBBY.id, VOTE_FLOW.id, { x: 24, y: 88 }));
    const promoted = applied.state.nodes.find((node) => node.id === LOBBY.id);
    expect(promoted?.parentId).toBe(VOTE_FLOW.id);
    expect(promoted?.position).toEqual({ x: 24, y: 88 });
  });

  it("moves a node back out to Show level", () => {
    expectExactRoundTrip(reparentNode(RESULTS.id, null, { x: 500, y: 500 }));
  });

  it("labels itself by direction", () => {
    expect(reparentNode(LOBBY.id, VOTE_FLOW.id, LOBBY.position).label).toBe("Promote");
    expect(reparentNode(RESULTS.id, null, RESULTS.position).label).toBe("Extract");
  });
});

describe("promoteNode / extractNode", () => {
  it("promotes into an empty Flow and assigns its default in one undo", () => {
    const empty: FlowNode = { ...VOTE_FLOW, id: "flow_empty", defaultSceneId: null };
    const graph = { ...GRAPH, nodes: [...GRAPH.nodes, empty] };
    const promoted = promoteNode(graph, LOBBY.id, empty.id, { x: 1, y: 1 }).apply(graph).state;
    expect(promoted.nodes.find((node) => node.id === LOBBY.id)?.parentId).toBe(empty.id);
    expect((promoted.nodes.find((node) => node.id === empty.id) as FlowNode).defaultSceneId).toBe(
      LOBBY.id,
    );
  });

  it("refuses extraction while a Navigate edge is attached", () => {
    expect(() => extractNode(GRAPH, VOTING.id, { x: 0, y: 0 })).toThrow(InvalidReparentError);
  });

  it("extracts and drops wiring, while restoring both on undo", () => {
    // Use a scene without Navigate edges for the extraction case.
    const graph = { ...GRAPH, edges: [WIRE, TO_PHONE] };
    const result = extractNode(graph, VOTING.id, { x: 500, y: 500 }).apply(graph);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([TO_PHONE.id]);
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

// The other half of #28: a promote's side effect undoes with it.
describe("a promote with its side effect, composed", () => {
  const EMPTY_FLOW: FlowNode = {
    id: "flow_empty",
    kind: "flow",
    name: "Interval",
    position: { x: 0, y: 300 },
    parentId: null,
    defaultSceneId: null,
  };
  const graph: ShowGraph = { ...GRAPH, nodes: [...GRAPH.nodes, EMPTY_FLOW] };

  // Promoting into an *empty* Flow also makes the promoted Scene that Flow's
  // default, because a Flow always has one — a side effect of the same
  // action, so it lives in the same entry.
  const promote = composite({
    label: "Promote to Flow",
    commands: [
      reparentNode(LOBBY.id, EMPTY_FLOW.id, { x: 24, y: 24 }),
      setFlowDefaultScene(EMPTY_FLOW.id, LOBBY.id),
    ],
  });

  it("applies membership and side effect together", () => {
    const after = promote.apply(graph).state;
    expect(after.nodes.find((node) => node.id === LOBBY.id)?.parentId).toBe(EMPTY_FLOW.id);
    expect((after.nodes.find((node) => node.id === EMPTY_FLOW.id) as FlowNode).defaultSceneId).toBe(
      LOBBY.id,
    );
    expect(() => assertValidShowGraph(after)).not.toThrow();
  });

  it("reverts both in one undo", () => {
    const commands = new CommandStack<ShowGraph>({ state: graph });
    commands.execute(promote);
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
