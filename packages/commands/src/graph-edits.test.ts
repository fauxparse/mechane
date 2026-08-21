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

import type { Command } from "./command";
import { deleteGraphElements } from "./graph-cascade";
import {
  addEdge,
  addNode,
  addSceneVariable,
  moveNode,
  moveNodesIntoFlow,
  moveNodesOutOfFlow,
  removeEdge,
  removeNode,
  removeSceneVariable,
  renameNode,
  renameSceneVariable,
  reparentNode,
  setDevicePairingCode,
  setDevicePerConnection,
  setFlowDefaultScene,
  setSceneVariableType,
} from "./graph-commands";
import type { GraphEdit } from "./graph-edits";
import {
  applyGraphEdits,
  coalesceGraphEdits,
  commandForEdit,
  UnknownGraphEditError,
} from "./graph-edits";
import { CommandStack } from "./stack";

// The same shape of Show as ./graph-commands.test.ts: a Flow with two Scenes
// and a Navigate edge, a Source wired into one of them, a Device the Flow
// drives, and a top-level Scene. Everything below is about one question —
// does the graph the *edits* produce match the graph the *command* produced?
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

/**
 * A graph as the *server* sees it: nodes and edges by id, in id order.
 *
 * Graph order is client-side data (see ./graph-edits): apps/api reads its
 * rows back ordered by id, so an edit list that restores a node "in the wrong
 * place" is restoring it exactly where the server would have put it. Comparing
 * this way is what the assertion should actually be about, and comparing
 * arrays directly would fail on a difference nothing can observe.
 */
function stored(graph: ShowGraph) {
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  return {
    nodes: [...graph.nodes].sort(byId),
    edges: [...graph.edges].sort(byId),
  };
}

/**
 * The one property that matters: replaying a command's edits against the graph
 * it was applied to lands on the same graph. Checked in both directions, so
 * an undo is proven to transmit as faithfully as the edit it reverses.
 */
function expectEditsReproduce(command: Command<ShowGraph, GraphEdit>, graph: ShowGraph = GRAPH) {
  const applied = command.apply(graph);
  expect(applied.edits ?? []).not.toHaveLength(0);
  expect(stored(applyGraphEdits(graph, applied.edits ?? []))).toEqual(stored(applied.state));

  const undone = applied.inverse.apply(applied.state);
  expect(stored(applyGraphEdits(applied.state, undone.edits ?? []))).toEqual(stored(undone.state));
  expect(stored(undone.state)).toEqual(stored(graph));
  return applied;
}

it("has a valid fixture graph", () => {
  expect(() => assertValidShowGraph(GRAPH)).not.toThrow();
});

describe("every primitive command's edits reproduce it", () => {
  it("addNode", () => {
    expectEditsReproduce(addNode(scene("scene_new", null)));
  });

  it("removeNode", () => {
    expectEditsReproduce(removeNode(TALLY.id));
  });

  it("removeNode of a Flow's default Scene", () => {
    // The awkward one: the removal clears the Flow's `defaultSceneId` as a
    // side effect, so the undo has to transmit the Scene *and* the pointer
    // back to it — the small case of a snapshot-carrying delete (#28).
    const applied = expectEditsReproduce(removeNode(VOTING.id));
    const flow = applied.state.nodes.find((node) => node.id === VOTE_FLOW.id);
    expect(flow).toMatchObject({ kind: "flow", defaultSceneId: null });
  });

  it("moveNode", () => {
    expectEditsReproduce(moveNode(LOBBY.id, { x: 500, y: 600 }));
  });

  it("renameNode", () => {
    expectEditsReproduce(renameNode(LOBBY.id, "Foyer"));
  });

  it("setDevicePerConnection", () => {
    expectEditsReproduce(setDevicePerConnection(PHONE.id, false));
  });

  it("reparentNode", () => {
    expectEditsReproduce(reparentNode(TALLY.id, VOTE_FLOW.id, { x: 5, y: 5 }));
  });

  it("addEdge", () => {
    expectEditsReproduce(
      addEdge({
        id: "edge_new",
        kind: "navigate",
        sourceId: RESULTS.id,
        targetId: VOTING.id,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      }),
    );
  });

  it("removeEdge", () => {
    expectEditsReproduce(removeEdge(NAVIGATE.id));
  });

  it("setFlowDefaultScene", () => {
    expectEditsReproduce(setFlowDefaultScene(VOTE_FLOW.id, RESULTS.id));
  });

  it("addSceneVariable", () => {
    expectEditsReproduce(addSceneVariable(RESULTS.id, { id: "variable_new", name: "total" }));
  });

  it("renameSceneVariable", () => {
    expectEditsReproduce(renameSceneVariable(VOTING.id, "variable_prompt", "question"));
  });

  it("setSceneVariableType", () => {
    expectEditsReproduce(setSceneVariableType(VOTING.id, "variable_prompt", "text"));
  });

  it("removeSceneVariable", () => {
    // Takes the wiring edge that fed it, so the undo transmits both.
    const applied = expectEditsReproduce(removeSceneVariable(VOTING.id, "variable_prompt"));
    expect(applied.state.edges.map((edge) => edge.id)).not.toContain(WIRE.id);
  });
});

describe("composed commands", () => {
  it("transmits a cascading delete as the atoms it was composed from", () => {
    // Deleting the Flow destroys both Scenes, the Variable, and three edges —
    // one undo entry, but a batch of edits, and the server is told each atom
    // rather than "delete recursively".
    expectEditsReproduce(deleteGraphElements(GRAPH, [VOTE_FLOW.id]));
  });

  it("transmits a move into a Flow with its default-Scene side effect", () => {
    const emptied: ShowGraph = {
      nodes: GRAPH.nodes.map((node) =>
        node.id === VOTE_FLOW.id ? { ...(node as FlowNode), defaultSceneId: null } : node,
      ),
      edges: GRAPH.edges,
    };
    const applied = expectEditsReproduce(
      moveNodesIntoFlow(emptied, [LOBBY.id], VOTE_FLOW.id, { x: 0, y: 100 }),
      emptied,
    );
    expect(applied.state.nodes.find((node) => node.id === VOTE_FLOW.id)).toMatchObject({
      defaultSceneId: LOBBY.id,
    });
  });

  it("transmits a move out of a Flow with the edges it discarded", () => {
    expectEditsReproduce(moveNodesOutOfFlow(GRAPH, [RESULTS.id], [{ x: 900, y: 0 }]));
  });
});

describe("a gesture", () => {
  it("transmits where a drag ended, not every frame of it", () => {
    const batches: GraphEdit[][] = [];
    const stack = new CommandStack<ShowGraph, GraphEdit>({
      state: GRAPH,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });

    const drag = stack.beginGesture({ key: "drag", label: "Move" });
    drag.update(moveNode(LOBBY.id, { x: 1, y: 1 }));
    drag.update(moveNode(LOBBY.id, { x: 2, y: 2 }));
    drag.update(moveNode(LOBBY.id, { x: 3, y: 3 }));
    drag.commit();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      { type: "graph.moveNode", nodeId: LOBBY.id, position: { x: 3, y: 3 } },
    ]);
    expect(stored(applyGraphEdits(GRAPH, batches[0] as GraphEdit[]))).toEqual(stored(stack.state));
  });

  it("dispatches an undo as edits of its own", () => {
    const batches: GraphEdit[][] = [];
    const stack = new CommandStack<ShowGraph, GraphEdit>({
      state: GRAPH,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });

    stack.execute(removeNode(TALLY.id));
    stack.undo();

    expect(batches).toHaveLength(2);
    // A server that applied both batches in order is where the client is:
    // back at the start, without ever being told "undo".
    expect(stored(applyGraphEdits(GRAPH, batches.flat()))).toEqual(stored(GRAPH));
  });
});

describe("commandForEdit", () => {
  it("refuses an edit type it has never heard of", () => {
    expect(() => commandForEdit({ type: "graph.explode" } as unknown as GraphEdit)).toThrow(
      UnknownGraphEditError,
    );
  });

  it("fails the batch when an edit names something that isn't there", () => {
    expect(() =>
      applyGraphEdits(GRAPH, [{ type: "graph.removeNode", nodeId: "scene_missing" }]),
    ).toThrow();
  });

  it("leaves the graph it was given untouched", () => {
    const before = structuredClone(GRAPH);
    applyGraphEdits(GRAPH, [{ type: "graph.renameNode", nodeId: LOBBY.id, name: "Foyer" }]);
    expect(GRAPH).toEqual(before);
  });
});

describe("coalesceGraphEdits", () => {
  /** Coalescing may shorten a batch, but never change where it lands. */
  function expectSameOutcome(edits: GraphEdit[], graph: ShowGraph = GRAPH) {
    const coalesced = coalesceGraphEdits(edits);
    expect(stored(applyGraphEdits(graph, coalesced))).toEqual(
      stored(applyGraphEdits(graph, edits)),
    );
    return coalesced;
  }

  it("sends one position for a drag, not one per frame", () => {
    // The bug this exists for: a single node moved once was 150 edits.
    const frames = Array.from({ length: 150 }, (_, index) => ({
      type: "graph.moveNode" as const,
      nodeId: LOBBY.id,
      position: { x: index, y: index * 2 },
    }));
    const coalesced = expectSameOutcome(frames);
    expect(coalesced).toEqual([
      { type: "graph.moveNode", nodeId: LOBBY.id, position: { x: 149, y: 298 } },
    ]);
  });

  it("keeps one position per node when several are dragged at once", () => {
    // Interleaved, which is what a multi-node drag emits — so a rule that
    // only collapsed *consecutive* frames would collapse none of these.
    const frames: GraphEdit[] = [];
    for (let index = 0; index < 20; index += 1) {
      frames.push({ type: "graph.moveNode", nodeId: LOBBY.id, position: { x: index, y: 0 } });
      frames.push({ type: "graph.moveNode", nodeId: TALLY.id, position: { x: 0, y: index } });
    }
    expect(expectSameOutcome(frames)).toEqual([
      { type: "graph.moveNode", nodeId: LOBBY.id, position: { x: 19, y: 0 } },
      { type: "graph.moveNode", nodeId: TALLY.id, position: { x: 0, y: 19 } },
    ]);
  });

  it("sends one name for a rename typed a character at a time", () => {
    const typed = ["F", "Fo", "Foy", "Foye", "Foyer"].map((name) => ({
      type: "graph.renameNode" as const,
      nodeId: LOBBY.id,
      name,
    }));
    expect(expectSameOutcome(typed)).toEqual([
      { type: "graph.renameNode", nodeId: LOBBY.id, name: "Foyer" },
    ]);
  });

  it("keeps a real drag of a real gesture end to end", () => {
    const batches: GraphEdit[][] = [];
    const stack = new CommandStack<ShowGraph, GraphEdit>({
      state: GRAPH,
      dispatch: (_command, _state, edits) => batches.push(coalesceGraphEdits(edits)),
    });
    const drag = stack.beginGesture({ key: "drag", label: "Move" });
    for (let index = 1; index <= 60; index += 1) {
      drag.update(moveNode(LOBBY.id, { x: index, y: index }));
    }
    drag.commit();
    // One edit for the drag, one entry on the stack, and an undo that lands
    // back where the drag started rather than 59 pixels into it.
    expect(batches).toEqual([
      [{ type: "graph.moveNode", nodeId: LOBBY.id, position: { x: 60, y: 60 } }],
    ]);
    expect(stack.canUndo).toBe(true);
    stack.undo();
    expect(stored(stack.state)).toEqual(stored(GRAPH));
  });

  it("doesn't collapse across the destruction of what it names", () => {
    // Two moves of two different lifetimes of the same node. Dropping the
    // first would move a node that, at that point in the batch, is the one
    // about to be deleted.
    const edits: GraphEdit[] = [
      { type: "graph.moveNode", nodeId: LOBBY.id, position: { x: 1, y: 1 } },
      { type: "graph.removeNode", nodeId: LOBBY.id },
      { type: "graph.addNode", node: scene(LOBBY.id, null) },
      { type: "graph.moveNode", nodeId: LOBBY.id, position: { x: 9, y: 9 } },
    ];
    expect(expectSameOutcome(edits)).toHaveLength(4);
  });

  it("leaves steps alone — two connections are two connections", () => {
    const edits: GraphEdit[] = [
      { type: "graph.removeEdge", edgeId: NAVIGATE.id },
      { type: "graph.addEdge", edge: NAVIGATE },
      { type: "graph.removeEdge", edgeId: NAVIGATE.id },
    ];
    expect(expectSameOutcome(edits)).toHaveLength(3);
  });

  it("collapses the setters a gesture's undo produces too", () => {
    const stack = new CommandStack<ShowGraph, GraphEdit>({ state: GRAPH });
    const batches: GraphEdit[][] = [];
    const tracked = new CommandStack<ShowGraph, GraphEdit>({
      state: GRAPH,
      dispatch: (_command, _state, edits) => batches.push(coalesceGraphEdits(edits)),
    });
    void stack;
    const drag = tracked.beginGesture({ key: "drag", label: "Move" });
    drag.update(moveNode(LOBBY.id, { x: 1, y: 1 }));
    drag.update(moveNode(LOBBY.id, { x: 2, y: 2 }));
    drag.commit();
    tracked.undo();
    expect(batches.map((batch) => batch.length)).toEqual([1, 1]);
    // And the two together still put the server back where it started.
    expect(stored(applyGraphEdits(GRAPH, batches.flat()))).toEqual(stored(GRAPH));
  });
});

describe("amendments (#111)", () => {
  it("records a server-minted pairing code as an ordinary edit", () => {
    expectEditsReproduce(setDevicePairingCode(PHONE.id, "AB12C"));
  });

  it("refuses to set a pairing code on something that isn't a Device", () => {
    expect(() => setDevicePairingCode(LOBBY.id, "AB12C").apply(GRAPH)).toThrow(
      /Show graph has no Device/,
    );
  });

  it("applies to the editor's graph without touching undo or the wire", () => {
    // The whole point of `amend`: the Device on the canvas gains its code,
    // but "undo the server telling me the code" is not an operation, and the
    // client must not send it back to the server it came from.
    const batches: GraphEdit[][] = [];
    const stack = new CommandStack<ShowGraph, GraphEdit>({
      state: GRAPH,
      dispatch: (_command, _state, edits) => batches.push([...edits]),
    });

    stack.execute(renameNode(LOBBY.id, "Foyer"));
    expect(stack.depth).toBe(1);

    stack.amend(
      commandForEdit({
        type: "graph.setDevicePairingCode",
        nodeId: PHONE.id,
        pairingCode: "AB12C",
      }),
    );

    expect(stack.state.nodes.find((node) => node.id === PHONE.id)).toMatchObject({
      pairingCode: "AB12C",
    });
    expect(stack.depth).toBe(1);
    expect(batches).toHaveLength(1);
  });

  it("leaves an undo of the user's own edits landing where it should", () => {
    const stack = new CommandStack<ShowGraph, GraphEdit>({ state: GRAPH });
    stack.execute(renameNode(LOBBY.id, "Foyer"));
    stack.amend(setDevicePairingCode(PHONE.id, "AB12C"));
    stack.undo();

    const undone = stack.state;
    expect(undone.nodes.find((node) => node.id === LOBBY.id)?.name).toBe(LOBBY.name);
    // The amendment survives the undo — it was never part of that entry.
    expect(undone.nodes.find((node) => node.id === PHONE.id)).toMatchObject({
      pairingCode: "AB12C",
    });
  });
});
