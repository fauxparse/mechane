// A stand-in Show graph for Storybook, in the shape the API returns.
//
// It's the same shape as the seeded "Hamlet" — an audience vote — because a
// camera can only be judged against a graph a human recognises: something
// with a Flow to zoom into, nodes spread far enough apart to need panning,
// and edges that cross. A pile of representative nodes wouldn't show whether
// the minimap is useful.
//
// Between them the nodes and edges cover all five node kinds and all three
// edge kinds, so the placeholder bodies and the mapper are both exercised.
import type { ShowGraph } from "@mechane/graphql-schema";

type Graph = Pick<ShowGraph, "nodes" | "edges">;
type ShowGraphNodeShape = Graph["nodes"][number];
type ShowGraphEdgeShape = Graph["edges"][number];

const VOTE_FLOW = "flow_vote";
const WAITING = "scene_waiting";
const VOTING = "scene_voting";
const RESULTS = "scene_results";
const LOBBY = "scene_lobby";
const TALLY = "source_tally";
const WINNER = "transformer_winner";
const PHONE = "device_phone";
const FOYER = "device_foyer";
const PROMPT_VARIABLE = "variable_prompt";
const LEADER_VARIABLE = "variable_leader";
const HOUSE_VARIABLE = "variable_house";

/** The nodes inside the vote Flow — a set worth framing on its own. */
export const VOTE_FLOW_NODE_IDS = [VOTE_FLOW, WAITING, VOTING, RESULTS];

function node(overrides: Partial<ShowGraphNodeShape> & Pick<ShowGraphNodeShape, "id" | "kind">) {
  return {
    name: overrides.id,
    parentId: null,
    defaultSceneId: null,
    position: { x: 0, y: 0 },
    variables: [],
    perConnection: false,
    pairingCode: null,
    ...overrides,
  } as Graph["nodes"][number];
}

function edge(overrides: Partial<ShowGraphEdgeShape> & Pick<ShowGraphEdgeShape, "id" | "kind">) {
  return {
    sourcePath: [],
    targetPath: [],
    targetVariableId: null,
    cueId: null,
    actionId: null,
    ...overrides,
  } as Graph["edges"][number];
}

export const SAMPLE_GRAPH: Graph = {
  nodes: [
    node({
      id: VOTE_FLOW,
      kind: "flow",
      name: "Audience vote",
      defaultSceneId: WAITING,
      position: { x: 0, y: 0 },
    }),
    // Positions inside a Flow are relative to it (see ./graph-to-flow).
    node({
      id: WAITING,
      kind: "scene",
      name: "Waiting for the house",
      parentId: VOTE_FLOW,
      position: { x: 32, y: 64 },
      variables: [{ id: PROMPT_VARIABLE, name: "prompt" }],
    }),
    node({
      id: VOTING,
      kind: "scene",
      name: "Cast your vote",
      parentId: VOTE_FLOW,
      position: { x: 296, y: 64 },
    }),
    node({
      id: RESULTS,
      kind: "scene",
      name: "The house has spoken",
      parentId: VOTE_FLOW,
      position: { x: 560, y: 64 },
      variables: [{ id: LEADER_VARIABLE, name: "leader" }],
    }),
    node({
      id: TALLY,
      kind: "source",
      name: "Vote tally",
      parentId: VOTE_FLOW,
      position: { x: 296, y: 196 },
    }),
    node({
      id: LOBBY,
      kind: "scene",
      name: "Foyer holding slide",
      position: { x: -360, y: 320 },
      variables: [{ id: HOUSE_VARIABLE, name: "message" }],
    }),
    node({ id: WINNER, kind: "transformer", name: "Winning option", position: { x: 40, y: 480 } }),
    node({
      id: PHONE,
      kind: "device",
      name: "Audience phones",
      position: { x: 900, y: 300 },
      // The per-connection kind (#45): every phone its own instance.
      perConnection: true,
      pairingCode: "V9BEZ",
    }),
    // Deliberately code-less, so the state between creating a Device and
    // the first save coming back is one Storybook can actually show — it's
    // otherwise only ever seen against a live server.
    node({ id: FOYER, kind: "device", name: "Foyer screen", position: { x: 900, y: 460 } }),
  ],
  edges: [
    // The Flow's state machine: three Scenes in a loop, each transition
    // carrying the Cue that causes it (#20).
    edge({
      id: "edge_open",
      kind: "navigate",
      sourceId: WAITING,
      targetId: VOTING,
      cueId: "cue_1",
    }),
    edge({
      id: "edge_close",
      kind: "navigate",
      sourceId: VOTING,
      targetId: RESULTS,
      cueId: "cue_2",
    }),
    edge({
      id: "edge_again",
      kind: "navigate",
      sourceId: RESULTS,
      targetId: WAITING,
      cueId: "cue_3",
    }),
    edge({
      id: "edge_leader",
      kind: "wiring",
      sourceId: TALLY,
      targetId: RESULTS,
      sourcePath: ["leader"],
      targetPath: [LEADER_VARIABLE],
      targetVariableId: LEADER_VARIABLE,
    }),
    edge({
      id: "edge_house",
      kind: "wiring",
      sourceId: WINNER,
      targetId: LOBBY,
      targetPath: [HOUSE_VARIABLE],
      targetVariableId: HOUSE_VARIABLE,
    }),
    edge({ id: "edge_phones", kind: "device", sourceId: VOTE_FLOW, targetId: PHONE }),
    edge({ id: "edge_foyer", kind: "device", sourceId: LOBBY, targetId: FOYER }),
  ],
};
