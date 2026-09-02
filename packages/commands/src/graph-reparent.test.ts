import { assertValidShowGraph, navigateEdgeId } from "@mechane/domain";
import type {
  DeviceEdge,
  DeviceNode,
  FlowNode,
  SceneNode,
  ShowGraph,
  SourceNode,
  WiringEdge,
} from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { addCue, addNavigateAction } from "./interaction-commands";
import { moveNodeIntoFlow, moveNodeOutOfFlow, moveNodesIntoFlow } from "./graph-reparent";

// Two Flows and something to strand: a Cue-driven Navigate edge inside the
// first, a Source feeding one of its Scenes, and a Device the loose Scene
// drives. Every move below breaks at least one of them.
function scene(id: string, parentId: string | null, variableIds: string[] = []): SceneNode {
  return {
    id,
    kind: "scene",
    name: id,
    position: { x: 20, y: 20 },
    parentId,
    variables: variableIds.map((variableId) => ({ id: variableId, name: variableId })),
  };
}

const VOTE: FlowNode = {
  id: "flow_vote",
  kind: "flow",
  name: "Vote",
  position: { x: 0, y: 0 },
  parentId: null,
  defaultSceneId: "scene_voting",
};

const ENCORE: FlowNode = {
  id: "flow_encore",
  kind: "flow",
  name: "Encore",
  position: { x: 800, y: 0 },
  parentId: null,
  defaultSceneId: null,
};

const VOTING = scene("scene_voting", VOTE.id);
const RESULTS = scene("scene_results", VOTE.id, ["variable_total"]);
const LOBBY = scene("scene_lobby", null);

const TALLY: SourceNode = {
  id: "source_tally",
  kind: "source",
  name: "Tally",
  position: { x: 40, y: 200 },
  parentId: VOTE.id,
  type: "number",
};

const WIRE: WiringEdge = {
  id: "edge_wire",
  kind: "wiring",
  sourceId: TALLY.id,
  targetId: RESULTS.id,
  sourcePath: [],
  targetPath: ["variable_total"],
};

const PHONES: DeviceNode = {
  id: "device_phones",
  kind: "device",
  name: "Phones",
  position: { x: 400, y: 400 },
  parentId: null,
  perConnection: true,
  pairingCode: null,
};

const TO_PHONES: DeviceEdge = {
  id: "edge_device",
  kind: "device",
  sourceId: LOBBY.id,
  targetId: PHONES.id,
  sourcePath: [],
  targetPath: [],
};

const CUE = {
  id: "cue_go",
  name: "Go",
  owner: { kind: "scene" as const, sceneId: VOTING.id },
  actionIds: ["action_go"],
};

const ACTION = {
  id: "action_go",
  cueId: CUE.id,
  kind: "navigate" as const,
  targetSceneId: RESULTS.id,
};

const BASE: ShowGraph = {
  nodes: [VOTE, ENCORE, VOTING, RESULTS, TALLY, LOBBY, PHONES],
  edges: [WIRE, TO_PHONES],
  cues: [],
  actions: [],
  eventBindings: [],
};

/** The fixture with `VOTING —Go→ RESULTS` wired up through a Cue. */
const NAVIGATING = addNavigateAction(ACTION).apply(addCue(CUE).apply(BASE).state).state;

describe("the fixtures", () => {
  it("are valid graphs", () => {
    expect(() => assertValidShowGraph(BASE)).not.toThrow();
    expect(() => assertValidShowGraph(NAVIGATING)).not.toThrow();
  });
});

describe("moving between Flows (#508)", () => {
  it("moves a Scene straight from one Flow to another", () => {
    const result = moveNodeIntoFlow(BASE, RESULTS.id, ENCORE.id, { x: 24, y: 74 }).apply(BASE);
    const moved = result.state.nodes.find((node) => node.id === RESULTS.id);
    expect(moved?.parentId).toBe(ENCORE.id);
    expect(moved?.position).toEqual({ x: 24, y: 74 });
    expect(() => assertValidShowGraph(result.state)).not.toThrow();
    expect(result.inverse.apply(result.state).state).toEqual(BASE);
  });

  it("hands the destination Flow its entry Scene and takes the origin's away", () => {
    const result = moveNodeIntoFlow(BASE, VOTING.id, ENCORE.id, { x: 24, y: 74 }).apply(BASE);
    const flows = result.state.nodes.filter((node): node is FlowNode => node.kind === "flow");
    expect(flows.find((flow) => flow.id === VOTE.id)?.defaultSceneId).toBe(null);
    expect(flows.find((flow) => flow.id === ENCORE.id)?.defaultSceneId).toBe(VOTING.id);
    expect(result.inverse.apply(result.state).state).toEqual(BASE);
  });

  it("cuts the wiring the old Flow was feeding it", () => {
    const result = moveNodeIntoFlow(BASE, RESULTS.id, ENCORE.id, { x: 24, y: 74 }).apply(BASE);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([TO_PHONES.id]);
    expect(result.inverse.apply(result.state).state).toEqual(BASE);
  });

  it("removes the Navigate Action behind a stranded Navigate edge, not just the edge", () => {
    const result = moveNodeIntoFlow(NAVIGATING, RESULTS.id, ENCORE.id, { x: 24, y: 74 }).apply(
      NAVIGATING,
    );
    expect(result.state.actions).toEqual([]);
    expect(result.state.cues?.[0]?.actionIds).toEqual([]);
    expect(result.state.edges.map((edge) => edge.id)).not.toContain(navigateEdgeId(ACTION.id));
    expect(() => assertValidShowGraph(result.state)).not.toThrow();
    expect(result.inverse.apply(result.state).state).toEqual(NAVIGATING);
  });

  it("keeps a Navigate edge whose Scenes travel together", () => {
    const result = moveNodesIntoFlow(NAVIGATING, [VOTING.id, RESULTS.id], ENCORE.id, {
      x: 24,
      y: 74,
    }).apply(NAVIGATING);
    expect(result.state.actions).toEqual([ACTION]);
    expect(result.state.edges.map((edge) => edge.id)).toContain(navigateEdgeId(ACTION.id));
    expect(() => assertValidShowGraph(result.state)).not.toThrow();
  });

  it("still refuses to nest a Flow or a Device", () => {
    expect(() => moveNodeIntoFlow(BASE, ENCORE.id, VOTE.id, { x: 0, y: 0 })).toThrow(
      "Flows cannot be nested.",
    );
    expect(() => moveNodeIntoFlow(BASE, PHONES.id, VOTE.id, { x: 0, y: 0 })).toThrow(
      "Devices cannot be moved into a Flow.",
    );
  });
});

describe("moving into a Flow from Show level", () => {
  // Only a Flow or a *top-level* Scene drives a Device (#26), so nesting the
  // Scene that drives one has to let the Device go.
  it("cuts the Device edge a Scene can no longer drive from inside a Flow", () => {
    const result = moveNodeIntoFlow(BASE, LOBBY.id, ENCORE.id, { x: 24, y: 74 }).apply(BASE);
    expect(result.state.edges.map((edge) => edge.id)).toEqual([WIRE.id]);
    expect(() => assertValidShowGraph(result.state)).not.toThrow();
    expect(result.inverse.apply(result.state).state).toEqual(BASE);
  });
});

describe("moving out of a Flow", () => {
  it("cuts the Navigate Action a departing Scene leaves behind", () => {
    const result = moveNodeOutOfFlow(NAVIGATING, VOTING.id, { x: 900, y: 40 }).apply(NAVIGATING);
    expect(result.state.actions).toEqual([]);
    expect(result.state.nodes.find((node) => node.id === VOTING.id)?.parentId).toBe(null);
    expect(
      (result.state.nodes.find((node) => node.id === VOTE.id) as FlowNode).defaultSceneId,
    ).toBe(null);
    expect(() => assertValidShowGraph(result.state)).not.toThrow();
    expect(result.inverse.apply(result.state).state).toEqual(NAVIGATING);
  });
});
