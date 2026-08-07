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

import { deleteEdges, deleteGraphElements, deletionScope, describeDeletion } from "./graph-cascade";
import { addSceneVariable, removeSceneVariable, renameSceneVariable } from "./graph-commands";
import { CommandStack } from "./stack";

const at = { x: 0, y: 0 };

function scene(id: string, parentId: string | null, variableIds: string[] = []): SceneNode {
  return {
    id,
    kind: "scene",
    name: id,
    position: { x: 12, y: 34 },
    parentId,
    variables: variableIds.map((variableId) => ({ id: variableId, name: variableId })),
  };
}

const VOTE: FlowNode = {
  id: "flow_vote",
  kind: "flow",
  name: "Vote",
  position: at,
  parentId: null,
  defaultSceneId: "scene_voting",
};
const EMPTY_FLOW: FlowNode = {
  id: "flow_interval",
  kind: "flow",
  name: "Interval",
  position: at,
  parentId: null,
  defaultSceneId: null,
};
const VOTING = scene("scene_voting", VOTE.id, ["variable_prompt"]);
const RESULTS = scene("scene_results", VOTE.id);
const LOBBY = scene("scene_lobby", null);
const TALLY: SourceNode = {
  id: "source_tally",
  kind: "source",
  name: "Tally",
  position: at,
  parentId: null,
  type: "number",
};
const PHONE: DeviceNode = {
  id: "device_phone",
  kind: "device",
  name: "Phones",
  position: at,
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
  sourceId: VOTE.id,
  targetId: PHONE.id,
  sourcePath: [],
  targetPath: [],
};

const GRAPH: ShowGraph = {
  nodes: [VOTE, EMPTY_FLOW, VOTING, RESULTS, LOBBY, TALLY, PHONE],
  edges: [WIRE, NAVIGATE, TO_PHONE],
};

it("has a valid fixture graph", () => {
  expect(() => assertValidShowGraph(GRAPH)).not.toThrow();
});

describe("deletionScope", () => {
  it("sweeps a Flow's contents into the scope", () => {
    const scope = deletionScope(GRAPH, [VOTE.id]);
    expect(scope.nodes.map((node) => node.id)).toEqual([VOTE.id, VOTING.id, RESULTS.id]);
    expect(scope.requestedIds).toEqual([VOTE.id]);
    // Every edge touching the Flow or anything inside it.
    expect(scope.edgeIds).toEqual([WIRE.id, NAVIGATE.id, TO_PHONE.id]);
  });

  it("takes only its own edges for a node that contains nothing", () => {
    const scope = deletionScope(GRAPH, [TALLY.id]);
    expect(scope.nodes.map((node) => node.id)).toEqual([TALLY.id]);
    expect(scope.edgeIds).toEqual([WIRE.id]);
    expect(scope.needsConfirmation).toBe(false);
  });

  it("takes a Scene's Navigate and wiring edges with it", () => {
    expect(deletionScope(GRAPH, [VOTING.id]).edgeIds).toEqual([WIRE.id, NAVIGATE.id]);
  });

  // #27: the one deletion worth interrupting. An empty Flow isn't.
  it("needs confirmation only for a non-empty Flow", () => {
    expect(deletionScope(GRAPH, [VOTE.id]).needsConfirmation).toBe(true);
    expect(deletionScope(GRAPH, [EMPTY_FLOW.id]).needsConfirmation).toBe(false);
    expect(deletionScope(GRAPH, [LOBBY.id, TALLY.id]).needsConfirmation).toBe(false);
  });

  // #36: one dialog for the whole bulk delete, not one per Flow.
  it("confirms once for a bulk delete containing a non-empty Flow", () => {
    const scope = deletionScope(GRAPH, [LOBBY.id, VOTE.id, TALLY.id]);
    expect(scope.needsConfirmation).toBe(true);
    expect(scope.nonEmptyFlows.map((flow) => flow.id)).toEqual([VOTE.id]);
    expect(scope.nodes).toHaveLength(5);
  });

  it("ignores ids that aren't in the graph", () => {
    const scope = deletionScope(GRAPH, ["scene_ghost", LOBBY.id]);
    expect(scope.requestedIds).toEqual([LOBBY.id]);
  });

  it("includes edges deleted in their own right", () => {
    const scope = deletionScope(GRAPH, [], [NAVIGATE.id]);
    expect(scope.nodes).toEqual([]);
    expect(scope.edgeIds).toEqual([NAVIGATE.id]);
  });
});

describe("describeDeletion", () => {
  it("describes the blast radius by kind", () => {
    expect(describeDeletion(deletionScope(GRAPH, [VOTE.id]))).toBe(
      "1 flow, 2 scenes and 3 connections",
    );
  });

  it("counts a single node and its single edge in the singular", () => {
    expect(describeDeletion(deletionScope(GRAPH, [TALLY.id]))).toBe("1 source and 1 connection");
  });

  it("says nothing of edges when there are none", () => {
    expect(describeDeletion(deletionScope(GRAPH, [EMPTY_FLOW.id]))).toBe("1 flow");
  });

  it("handles an empty scope", () => {
    expect(describeDeletion(deletionScope(GRAPH, []))).toBe("Nothing to delete.");
  });
});

describe("deleteGraphElements", () => {
  it("destroys a Flow and everything in it, leaving a valid graph", () => {
    const after = deleteGraphElements(GRAPH, [VOTE.id]).apply(GRAPH).state;
    expect(after.nodes.map((node) => node.id)).toEqual([
      EMPTY_FLOW.id,
      LOBBY.id,
      TALLY.id,
      PHONE.id,
    ]);
    expect(after.edges).toEqual([]);
    expect(() => assertValidShowGraph(after)).not.toThrow();
  });

  // The headline requirement (#28, #36): one entry, one press, exact restore.
  it("is one undo entry that restores every node, edge, and position", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });
    commands.execute(deleteGraphElements(GRAPH, [VOTE.id]));
    expect(commands.depth).toBe(1);
    expect(commands.undoLabel).toBe("Delete flow");

    commands.undo();
    expect(commands.state).toEqual(GRAPH);
  });

  it("is one entry for a bulk delete spanning cascades and loose nodes", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });
    commands.execute(deleteGraphElements(GRAPH, [VOTE.id, LOBBY.id, TALLY.id]));
    expect(commands.depth).toBe(1);
    expect(commands.undoLabel).toBe("Delete 3 nodes");
    expect(commands.state.nodes.map((node) => node.id)).toEqual([EMPTY_FLOW.id, PHONE.id]);

    commands.undo();
    expect(commands.state).toEqual(GRAPH);
  });

  it("leaves a consumer standing when its producer goes", () => {
    const after = deleteGraphElements(GRAPH, [TALLY.id]).apply(GRAPH).state;
    // The Scene survives with its Variable; only the feed is gone (#29, #46).
    const voting = after.nodes.find((node) => node.id === VOTING.id) as SceneNode;
    expect(voting.variables).toHaveLength(1);
    expect(after.edges.map((edge) => edge.id)).toEqual([NAVIGATE.id, TO_PHONE.id]);
  });

  it("is redoable", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });
    commands.execute(deleteGraphElements(GRAPH, [VOTE.id]));
    const destroyed = commands.state;
    commands.undo();
    commands.redo();
    expect(commands.state).toEqual(destroyed);
  });
});

describe("deleteEdges", () => {
  it("deletes edges without touching their endpoints", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });
    commands.execute(deleteEdges(GRAPH, [NAVIGATE.id]));
    expect(commands.state.nodes).toEqual(GRAPH.nodes);
    expect(commands.state.edges.map((edge) => edge.id)).toEqual([WIRE.id, TO_PHONE.id]);
    expect(commands.undoLabel).toBe("Delete connection");

    commands.undo();
    expect(commands.state).toEqual(GRAPH);
  });
});

// Variables are ports on a Scene (#20), so a wiring edge addresses one by id
// and can't outlive it.
describe("Scene Variables", () => {
  it("takes the wiring that fed a Variable with it, and brings both back", () => {
    const commands = new CommandStack<ShowGraph>({ state: GRAPH });

    commands.execute(removeSceneVariable(VOTING.id, "variable_prompt"));
    const scene = commands.state.nodes.find((node) => node.id === VOTING.id) as SceneNode;
    expect(scene.variables).toEqual([]);
    expect(commands.state.edges.map((edge) => edge.id)).toEqual([NAVIGATE.id, TO_PHONE.id]);
    expect(() => assertValidShowGraph(commands.state)).not.toThrow();

    commands.undo();
    expect(commands.state).toEqual(GRAPH);

    commands.execute(addSceneVariable(RESULTS.id, { id: "variable_winner", name: "winner" }));
    commands.execute(renameSceneVariable(RESULTS.id, "variable_winner", "Winner"));
    const results = commands.state.nodes.find((node) => node.id === RESULTS.id) as SceneNode;
    expect(results.variables).toEqual([{ id: "variable_winner", name: "Winner" }]);

    commands.undo();
    commands.undo();
    expect(commands.state).toEqual(GRAPH);
  });
});
