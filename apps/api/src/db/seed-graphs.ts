// Seed data for the local Voting demo. The graph is intentionally small and
// legible: three Candidate Sources feed a projected tally and an Audience flow.
import type {
  Block,
  Canvas,
  FrameElement,
  Position,
  PropertyConnection,
  ShowGraph,
  TextElement,
} from "@mechane/domain";

export const CANDIDATE_SHAPE_ID = "shape_candidate";
export const CANDIDATE_NAME_FIELD_ID = "field_candidate_name";
export const CANDIDATE_VOTES_FIELD_ID = "field_candidate_votes";
export const CANDIDATE_AVATAR_FIELD_ID = "field_candidate_avatar";

export const CANDIDATE_SOURCE_IDS = ["source_alice", "source_beatrix", "source_clarissa"] as const;
export const TALLY_VARIABLE_IDS = [
  "variable_tally_alice",
  "variable_tally_beatrix",
  "variable_tally_clarissa",
] as const;
export const AUDIENCE_VARIABLE_IDS = [
  "variable_audience_alice",
  "variable_audience_beatrix",
  "variable_audience_clarissa",
] as const;

const PROJECTOR_ID = "device_projector";
const AUDIENCE_DEVICE_ID = "device_audience";
const TALLY_SCENE_ID = "scene_vote_tally";
const AUDIENCE_FLOW_ID = "flow_audience";
const AUDIENCE_SCENE_ID = "scene_audience_vote";

const candidateType = { kind: "shape" as const, shapeId: CANDIDATE_SHAPE_ID };

function candidateFieldDefaults(nodeId: string, name: string, votes: number) {
  return [
    { nodeId, fieldPath: [CANDIDATE_NAME_FIELD_ID], value: name },
    { nodeId, fieldPath: [CANDIDATE_VOTES_FIELD_ID], value: votes },
  ];
}
export function workflowBlocks(): Block[] {
  const card: Block = {
    id: "block_card",
    name: "Candidate card",
    canvas: {
      id: "canvas_block_card",
      kind: "block",
      root: {
        id: "block_card_root",
        type: "frame",
        direction: "vertical",
        gap: 8,
        children: [
          { id: "block_card_title", type: "text", content: "Candidate" },
          { id: "block_card_votes", type: "text", content: "0" },
        ],
      },
    },
    variables: [
      { id: "block_card_name", name: "Name", type: "text", required: true },
      { id: "block_card_count", name: "Votes", type: "number", required: false, defaultValue: 0 },
      { id: "block_card_selector", name: "State", type: "text", required: false },
    ],
    states: [
      {
        id: "block_card_default",
        name: "Default",
        isDefault: true,
        overrides: [],
      },
      {
        id: "block_card_selected",
        name: "Selected",
        isDefault: false,
        overrides: [{ elementId: "block_card_title", property: "content", value: "Selected" }],
      },
    ],
    stateSelectorVariableId: "block_card_selector",
  };
  const nested: Block = {
    id: "block_nested",
    name: "Nested card",
    canvas: {
      id: "canvas_block_nested",
      kind: "block",
      root: {
        id: "block_nested_root",
        type: "frame",
        children: [
          {
            id: "block_nested_slot",
            type: "slot",
            blockId: card.id,
            assignments: [
              {
                variableId: "block_card_name",
                source: { kind: "runtimeItem", fieldPath: [CANDIDATE_NAME_FIELD_ID] },
              },
              {
                variableId: "block_card_count",
                source: { kind: "runtimeItem", fieldPath: [CANDIDATE_VOTES_FIELD_ID] },
              },
            ],
          },
        ],
      },
    },
    variables: [],
    states: [],
  };
  const repeated: Block = {
    id: "block_repeated",
    name: "Repeated card",
    canvas: {
      id: "canvas_block_repeated",
      kind: "block",
      root: {
        id: "block_repeated_root",
        type: "frame",
        children: [
          {
            id: "block_repeated_slot",
            type: "slot",
            blockId: card.id,
            expansion: {
              source: { kind: "variable", variableId: "block_repeated_items" },
            },
            assignments: [
              {
                variableId: "block_card_name",
                source: { kind: "runtimeItem", fieldPath: [CANDIDATE_NAME_FIELD_ID] },
              },
              {
                variableId: "block_card_count",
                source: { kind: "runtimeItem", fieldPath: [CANDIDATE_VOTES_FIELD_ID] },
              },
              {
                variableId: "block_card_selector",
                source: { kind: "literal", value: "Selected" },
              },
            ],
          },
        ],
      },
    },
    variables: [
      {
        id: "block_repeated_items",
        name: "Candidates",
        type: { kind: "array", of: candidateType },
        required: true,
      },
    ],
    states: [],
  };
  return [card, nested, repeated];
}

export function votingGraph(): ShowGraph {
  const [alice, beatrix, clarissa] = CANDIDATE_SOURCE_IDS;
  const [tallyAlice, tallyBeatrix, tallyClarissa] = TALLY_VARIABLE_IDS;
  const [audienceAlice, audienceBeatrix, audienceClarissa] = AUDIENCE_VARIABLE_IDS;
  const candidateShape = {
    id: CANDIDATE_SHAPE_ID,
    name: "Candidate",
    fields: [
      {
        id: CANDIDATE_NAME_FIELD_ID,
        name: "name",
        type: "text" as const,
        required: true,
        defaultValue: "",
      },
      {
        id: CANDIDATE_VOTES_FIELD_ID,
        name: "votes",
        type: "number" as const,
        required: true,
        defaultValue: 0,
      },
      {
        id: CANDIDATE_AVATAR_FIELD_ID,
        name: "avatar",
        type: "image" as const,
        required: false,
        defaultValue: null,
      },
    ],
  };
  const sources = [
    {
      id: alice,
      name: "Alice",
      position: { x: 0, y: 0 },
    },
    {
      id: beatrix,
      name: "Beatrix",
      position: { x: 0, y: 180 },
    },
    {
      id: clarissa,
      name: "Clarissa",
      position: { x: 0, y: 360 },
    },
  ];
  const sourceFieldDefaults = [
    ...candidateFieldDefaults(alice, "Alice", 12),
    ...candidateFieldDefaults(beatrix, "Beatrix", 8),
    ...candidateFieldDefaults(clarissa, "Clarissa", 5),
  ];
  const sourceNodes = sources.map((source) => ({
    id: source.id,
    kind: "source" as const,
    name: source.name,
    parentId: null,
    position: source.position,
    type: candidateType,
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
    sourceFieldDefaults,
    blocks: workflowBlocks(),
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
        position: { x: 24, y: 74 },
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
      {
        id: AUDIENCE_DEVICE_ID,
        kind: "device",
        name: "Audience",
        parentId: null,
        position: { x: 900, y: 520 },
        perConnection: true,
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
      {
        id: "edge_audience_device",
        kind: "device",
        sourceId: AUDIENCE_FLOW_ID,
        targetId: AUDIENCE_DEVICE_ID,
        sourcePath: [],
        targetPath: [],
      },
    ],
  };
}
const SEEDED_CANVAS_WIDTH = 720;
const SEEDED_CANVAS_GAP = 80;

export function seedCanvasPosition(index: number): Position {
  return { x: index * (SEEDED_CANVAS_WIDTH + SEEDED_CANVAS_GAP), y: 0 };
}

function variable(variableId: string, fieldId: string): PropertyConnection {
  return { kind: "variable", variableId, fieldPath: [fieldId] };
}

function text(
  id: string,
  rank: string,
  content: string | PropertyConnection,
  name: string,
): TextElement {
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
    children: [
      text(`${id}_label`, "a", variable(variableId, CANDIDATE_NAME_FIELD_ID), `${label} name`),
    ],
  };
}

function root(
  name: string,
  children: readonly NonNullable<FrameElement["children"]>[number][],
): FrameElement {
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
        text(
          `tally-name-${index}`,
          "a",
          variable(variableId, CANDIDATE_NAME_FIELD_ID),
          `${label} name`,
        ),
        text(
          `tally-votes-${index}`,
          "b",
          variable(variableId, CANDIDATE_VOTES_FIELD_ID),
          `${label} votes`,
        ),
      ],
    };
  });
  return {
    [TALLY_SCENE_ID]: {
      kind: "scene",
      root: root("Vote tally", [text("tally-title", "a", "Vote tally", "Title"), ...tallyRows]),
    },
    [AUDIENCE_SCENE_ID]: {
      kind: "scene",
      root: root("Choose a candidate", [
        text("audience-title", "a", "Choose a candidate", "Title"),
        ...AUDIENCE_VARIABLE_IDS.map((variableId, index) =>
          button(
            `candidate-button-${index}`,
            String.fromCharCode(98 + index),
            variableId,
            ["Alice", "Beatrix", "Clarissa"][index] ?? "Candidate",
          ),
        ),
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
