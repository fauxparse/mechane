// Seed data for the local Voting demo. The graph is intentionally small and
// legible: three Candidate Sources feed a projected tally and an Audience flow.
import type { Canvas, FrameElement, PropertyConnection, ShowGraph, TextElement } from "@mechane/domain";

export const CANDIDATE_SHAPE_ID = "shape_candidate";
export const CANDIDATE_NAME_FIELD_ID = "field_candidate_name";
export const CANDIDATE_VOTES_FIELD_ID = "field_candidate_votes";
export const CANDIDATE_AVATAR_FIELD_ID = "field_candidate_avatar";

export const CANDIDATE_SOURCE_IDS = ["source_alice", "source_beatrix", "source_clarissa"] as const;
export const TALLY_VARIABLE_IDS = ["variable_tally_alice", "variable_tally_beatrix", "variable_tally_clarissa"] as const;
export const AUDIENCE_VARIABLE_IDS = ["variable_audience_alice", "variable_audience_beatrix", "variable_audience_clarissa"] as const;

const PROJECTOR_ID = "device_projector";
const TALLY_SCENE_ID = "scene_vote_tally";
const AUDIENCE_FLOW_ID = "flow_audience";
const AUDIENCE_SCENE_ID = "scene_audience_vote";

const candidateType = { kind: "shape" as const, shapeId: CANDIDATE_SHAPE_ID };

function candidateFieldDefaults(name: string, votes: number) {
  return [
    { nodeId: "", fieldPath: [CANDIDATE_NAME_FIELD_ID], value: name },
    { nodeId: "", fieldPath: [CANDIDATE_VOTES_FIELD_ID], value: votes },
  ];
}

export function votingGraph(): ShowGraph {
  const [alice, beatrix, clarissa] = CANDIDATE_SOURCE_IDS;
  const [tallyAlice, tallyBeatrix, tallyClarissa] = TALLY_VARIABLE_IDS;
  const [audienceAlice, audienceBeatrix, audienceClarissa] = AUDIENCE_VARIABLE_IDS;
  const candidateShape = {
    id: CANDIDATE_SHAPE_ID,
    name: "Candidate",
    fields: [
      { id: CANDIDATE_NAME_FIELD_ID, name: "name", type: "text" as const, required: true, defaultValue: "" },
      { id: CANDIDATE_VOTES_FIELD_ID, name: "votes", type: "number" as const, required: true, defaultValue: 0 },
      { id: CANDIDATE_AVATAR_FIELD_ID, name: "avatar", type: "image" as const, required: false, defaultValue: null },
    ],
  };
  const sources = [
    { id: alice, name: "Alice", fieldDefaults: candidateFieldDefaults("Alice", 12), position: { x: 0, y: 0 } },
    { id: beatrix, name: "Beatrix", fieldDefaults: candidateFieldDefaults("Beatrix", 8), position: { x: 0, y: 180 } },
    { id: clarissa, name: "Clarissa", fieldDefaults: candidateFieldDefaults("Clarissa", 5), position: { x: 0, y: 360 } },
  ];
  const sourceNodes = sources.map((source) => ({
    id: source.id,
    kind: "source" as const,
    name: source.name,
    parentId: null,
    position: source.position,
    type: candidateType,
    fieldDefaults: source.fieldDefaults.map((defaultValue) => ({ ...defaultValue, nodeId: source.id })),
  }));
  const tallyVariables = [tallyAlice, tallyBeatrix, tallyClarissa].map((id, index) => ({
    id,
    name: ["Alice", "Beatrix", "Clarissa"][index] ?? id,
    type: candidateType,
  }));
  const audienceVariables = [audienceAlice, audienceBeatrix, audienceClarissa].map((id, index) => ({
    id,
    name: ["Alice", "Beatrix", "Clarissa"][index] ?? id,
    type: candidateType,
  }));
  const sourceEdges = sources.flatMap((source, index) => [
    {
      id: `edge_${source.id}_tally`,
      kind: "wiring" as const,
      sourceId: source.id,
      targetId: TALLY_SCENE_ID,
      sourcePath: [],
      targetPath: [TALLY_VARIABLE_IDS[index] ?? tallyAlice],
    },
    {
      id: `edge_${source.id}_audience`,
      kind: "wiring" as const,
      sourceId: source.id,
      targetId: AUDIENCE_SCENE_ID,
      sourcePath: [],
      targetPath: [AUDIENCE_VARIABLE_IDS[index] ?? audienceAlice],
    },
  ]);

  return {
    shapes: [candidateShape],
    nodes: [
      ...sourceNodes,
      {
        id: TALLY_SCENE_ID,
        kind: "scene",
        name: "Vote tally",
        parentId: null,
        position: { x: 460, y: 0 },
        variables: tallyVariables,
      },
      {
        id: AUDIENCE_FLOW_ID,
        kind: "flow",
        name: "Audience",
        parentId: null,
        position: { x: 460, y: 420 },
        defaultSceneId: AUDIENCE_SCENE_ID,
      },
      {
        id: AUDIENCE_SCENE_ID,
        kind: "scene",
        name: "Choose a candidate",
        parentId: AUDIENCE_FLOW_ID,
        position: { x: 460, y: 560 },
        variables: audienceVariables,
      },
      {
        id: PROJECTOR_ID,
        kind: "device",
        name: "Projector",
        parentId: null,
        position: { x: 900, y: 120 },
        perConnection: false,
        pairingCode: null,
      },
    ],
    edges: [
      ...sourceEdges,
      {
        id: "edge_tally_projector",
        kind: "device",
        sourceId: TALLY_SCENE_ID,
        targetId: PROJECTOR_ID,
        sourcePath: [],
        targetPath: [],
      },
    ],
  };
}

function variable(variableId: string, fieldId?: string): PropertyConnection {
  return { kind: "variable", variableId, ...(fieldId ? { fieldPath: [fieldId] } : {}) };
}

function text(id: string, rank: string, content: string | PropertyConnection, name: string): TextElement {
  return {
    id,
    type: "text",
    rank,
    name,
    content,
    sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
  };
}

function button(id: string, rank: string, variableId: string, label: string) {
  return {
    id,
    type: "frame" as const,
    rank,
    name: `${label} button`,
    fill: "#2f2f2f",
    cornerRadius: 10,
    sizing: { width: { mode: "fill" as const }, height: { mode: "fixed" as const, value: 72 } },
    children: [text(`${id}_label`, "a", variable(variableId, CANDIDATE_NAME_FIELD_ID), `${label} name`)],
  };
}

function root(name: string, children: readonly NonNullable<FrameElement["children"]>[number][]): FrameElement {
  return {
    id: `${name.toLowerCase().replaceAll(" ", "-")}-root`,
    type: "frame",
    name,
    rank: "a",
    layoutMode: "auto",
    direction: "vertical",
    gap: 20,
    padding: 32,
    sizing: { width: { mode: "fixed", value: 720 }, height: { mode: "hug" } },
    children,
  };
}

export function votingCanvases(): Record<string, Canvas> {
  const tallyRows = TALLY_VARIABLE_IDS.map((variableId, index) => {
    const label = ["Alice", "Beatrix", "Clarissa"][index] ?? "Candidate";
    return {
      id: `tally-row-${index}`,
      type: "frame" as const,
      rank: String.fromCharCode(98 + index),
      name: `${label} tally row`,
      layoutMode: "auto" as const,
      direction: "horizontal" as const,
      gap: 16,
      sizing: { width: { mode: "fill" as const }, height: { mode: "hug" as const } },
      children: [
        text(`tally-name-${index}`, "a", variable(variableId, CANDIDATE_NAME_FIELD_ID), `${label} name`),
        text(`tally-votes-${index}`, "b", variable(variableId, CANDIDATE_VOTES_FIELD_ID), `${label} votes`),
      ],
    };
  });
  return {
    [TALLY_SCENE_ID]: { kind: "scene", root: root("Vote tally", [text("tally-title", "a", "Vote tally", "Title"), ...tallyRows]) },
    [AUDIENCE_SCENE_ID]: {
      kind: "scene",
      root: root("Choose a candidate", [
        text("audience-title", "a", "Choose a candidate", "Title"),
        ...AUDIENCE_VARIABLE_IDS.map((variableId, index) => button(`candidate-button-${index}`, String.fromCharCode(98 + index), variableId, ["Alice", "Beatrix", "Clarissa"][index] ?? "Candidate")),
      ]),
    },
  };
}

export type SeedGraph = ShowGraph;
export type SeedCanvases = Record<string, Canvas>;
export type SeedGraphBuilder = () => SeedGraph;
export type SeedCanvasBuilder = () => SeedCanvases;

export const SEED_GRAPHS: Record<string, SeedGraphBuilder> = {
  "Voting demo": votingGraph,
};

export const SEED_CANVASES: Record<string, SeedCanvasBuilder> = {
  "Voting demo": votingCanvases,
};
