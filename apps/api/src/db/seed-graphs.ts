import type {
  Block,
  Canvas,
  FrameElement,
  Position,
  PropertyConnection,
  ShowGraph,
  SlotElement,
  TextAlign,
  TextElement,
} from "@mechane/domain";

export const CANDIDATE_SHAPE_ID = "shape_candidate";
export const CANDIDATE_NAME_FIELD_ID = "field_candidate_name";
export const CANDIDATE_VOTES_FIELD_ID = "field_candidate_votes";
export const CANDIDATE_IMAGE_FIELD_ID = "field_candidate_image";

export const CANDIDATE_SOURCE_ID = "source_candidates";
export const TALLY_VARIABLE_ID = "variable_tally_candidates";
export const AUDIENCE_VARIABLE_ID = "variable_audience_candidates";
export const CANDIDATE_BUTTON_VARIABLE_ID = "candidate_button_candidate";
export const TALLY_ROW_VARIABLE_ID = "tally_row_candidate";

export const AUDIENCE_FLOW_ID = "flow_audience";
export const CANDIDATE_LIST_SCENE_ID = "scene_candidate_list";
export const CONFIRMATION_SCENE_ID = "scene_confirmation";
export const THANK_YOU_SCENE_ID = "scene_thank_you";
export const TALLY_SCENE_ID = "scene_vote_tally";
export const PROJECTOR_ID = "device_projector";
export const AUDIENCE_DEVICE_ID = "device_audience";

export const CANDIDATE_IMAGE_REVISION = "seed-v1";

export const CANDIDATES = [
  { name: "Alice", imageAssetId: "image_asset_alice", imageFile: "alice.png" },
  { name: "Beatrix", imageAssetId: "image_asset_beatrix", imageFile: "beatrix.png" },
  { name: "Clarissa", imageAssetId: "image_asset_clarissa", imageFile: "clarissa.png" },
] as const;

const candidateType = { kind: "shape" as const, shapeId: CANDIDATE_SHAPE_ID };
const candidateArrayType = { kind: "array" as const, of: candidateType };

function text(
  id: string,
  rank: string,
  content: string | PropertyConnection,
  name: string,
  fontSize = 28,
  align: TextAlign = "left",
): TextElement {
  return {
    id,
    type: "text",
    rank,
    name,
    content,
    fontSize,
    sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
    textAlign: align,
    textVerticalAlign: "center",
  };
}

function button(
  id: string,
  rank: string,
  label: string | PropertyConnection,
  name: string,
  fill: string,
): FrameElement {
  return {
    id,
    type: "frame",
    rank,
    name,
    fill,
    cornerRadius: 16,
    layoutMode: "auto",
    direction: "horizontal",
    padding: 8,
    alignCounter: "center",
    sizing: { width: { mode: "fill" }, height: { mode: "fixed", value: 72 } },
    children: [text(`${id}-label`, "a", label, `${name} label`, 26, "center")],
  };
}

function root(
  id: string,
  name: string,
  width: number,
  height: number,
  children: readonly NonNullable<FrameElement["children"]>[number][],
): FrameElement {
  return {
    id,
    type: "frame",
    name,
    rank: "a",
    layoutMode: "auto",
    direction: "vertical",
    gap: 24,
    padding: 32,
    sizing: {
      width: { mode: "fixed", value: width },
      height: { mode: "fixed", value: height },
    },
    children,
  };
}

function repeatedSlot(
  id: string,
  rank: string,
  blockId: string,
  variableId: string,
  assignments: SlotElement["assignments"],
): SlotElement {
  return {
    id,
    type: "slot",
    rank,
    blockId,
    layoutMode: "auto",
    direction: "vertical",
    gap: 16,
    sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
    expansion: { source: { kind: "variable", variableId } },
    assignments,
  };
}

export function workflowBlocks(): Block[] {
  const candidateButton: Block = {
    id: "block_candidate_button",
    name: "CandidateButton",
    canvas: {
      id: "canvas_block_candidate_button",
      kind: "block",
      root: {
        id: "candidate-button-root",
        type: "frame",
        name: "CandidateButton",
        rank: "a",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 16,
        padding: 8,
        alignCounter: "center",
        fill: "#2D6CDF",
        cornerRadius: 16,
        sizing: { width: { mode: "fixed", value: 296 }, height: { mode: "hug" } },
        children: [
          {
            id: "candidate-button-image",
            type: "image",
            rank: "a",
            image: {
              kind: "variable",
              variableId: CANDIDATE_BUTTON_VARIABLE_ID,
              fieldPath: [CANDIDATE_IMAGE_FIELD_ID],
            },
            sizing: { width: { mode: "fixed", value: 56 }, height: { mode: "fixed", value: 56 } },
            cornerRadius: 8,
          },
          text(
            "candidate-button-name",
            "b",
            {
              kind: "variable",
              variableId: CANDIDATE_BUTTON_VARIABLE_ID,
              fieldPath: [CANDIDATE_NAME_FIELD_ID],
            },
            "Candidate name",
            26,
          ),
        ],
      },
    },
    variables: [
      {
        id: CANDIDATE_BUTTON_VARIABLE_ID,
        name: "Candidate",
        type: candidateType,
        required: true,
      },
    ],
    states: [],
  };
  const tallyRow: Block = {
    id: "block_tally_row",
    name: "TallyRow",
    canvas: {
      id: "canvas_block_tally_row",
      kind: "block",
      root: {
        id: "tally-row-root",
        type: "frame",
        name: "TallyRow",
        rank: "a",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 20,
        padding: 20,
        fill: "#172554",
        cornerRadius: 16,
        sizing: { width: { mode: "fill" }, height: { mode: "fixed", value: 84 } },
        children: [
          text(
            "tally-row-name",
            "a",
            {
              kind: "variable",
              variableId: TALLY_ROW_VARIABLE_ID,
              fieldPath: [CANDIDATE_NAME_FIELD_ID],
            },
            "Candidate name",
            32,
          ),
          text(
            "tally-row-votes",
            "b",
            {
              kind: "variable",
              variableId: TALLY_ROW_VARIABLE_ID,
              fieldPath: [CANDIDATE_VOTES_FIELD_ID],
            },
            "Vote count",
            32,
            "right",
          ),
        ],
      },
    },
    variables: [
      { id: TALLY_ROW_VARIABLE_ID, name: "Candidate", type: candidateType, required: true },
    ],
    states: [],
  };
  return [candidateButton, tallyRow];
}

export function votingGraph(): ShowGraph {
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
        id: CANDIDATE_IMAGE_FIELD_ID,
        name: "image",
        type: "image" as const,
        required: false,
        defaultValue: null,
      },
    ],
  };
  const candidateDefaults = CANDIDATES.map((candidate) => ({
    [CANDIDATE_NAME_FIELD_ID]: candidate.name,
    [CANDIDATE_VOTES_FIELD_ID]: 0,
    [CANDIDATE_IMAGE_FIELD_ID]: {
      assetId: candidate.imageAssetId,
      revision: CANDIDATE_IMAGE_REVISION,
    },
  }));
  const sourceFieldDefaults = [
    { nodeId: CANDIDATE_SOURCE_ID, fieldPath: [], value: candidateDefaults },
  ];
  const sourceNode = {
    id: CANDIDATE_SOURCE_ID,
    kind: "source" as const,
    name: "Candidates",
    parentId: null,
    position: { x: 0, y: 0 },
    type: candidateArrayType,
  };
  const tallyScene = {
    id: TALLY_SCENE_ID,
    kind: "scene" as const,
    name: "Projector tally",
    parentId: null,
    position: { x: 520, y: 0 },
    variables: [{ id: TALLY_VARIABLE_ID, name: "Candidates", type: candidateArrayType }],
  };
  const audienceFlow = {
    id: AUDIENCE_FLOW_ID,
    kind: "flow" as const,
    name: "Audience",
    parentId: null,
    position: { x: 520, y: 460 },
    defaultSceneId: CANDIDATE_LIST_SCENE_ID,
  };
  const candidateListScene = {
    id: CANDIDATE_LIST_SCENE_ID,
    kind: "scene" as const,
    name: "Candidate list",
    parentId: AUDIENCE_FLOW_ID,
    position: { x: 24, y: 74 },
    variables: [{ id: AUDIENCE_VARIABLE_ID, name: "Candidates", type: candidateArrayType }],
  };
  const confirmationScene = {
    id: CONFIRMATION_SCENE_ID,
    kind: "scene" as const,
    name: "Confirmation screen",
    parentId: AUDIENCE_FLOW_ID,
    position: { x: 340, y: 74 },
    variables: [],
  };
  const thankYouScene = {
    id: THANK_YOU_SCENE_ID,
    kind: "scene" as const,
    name: "Thank you screen",
    parentId: AUDIENCE_FLOW_ID,
    position: { x: 656, y: 74 },
    variables: [],
  };
  const projector = {
    id: PROJECTOR_ID,
    kind: "device" as const,
    name: "Projector",
    parentId: null,
    position: { x: 920, y: 120 },
    perConnection: false,
    pairingCode: null,
  };
  const audience = {
    id: AUDIENCE_DEVICE_ID,
    kind: "device" as const,
    name: "Audience",
    parentId: null,
    position: { x: 920, y: 560 },
    perConnection: true,
    pairingCode: null,
  };
  return {
    shapes: [candidateShape],
    sourceFieldDefaults,
    blocks: workflowBlocks(),
    nodes: [
      sourceNode,
      tallyScene,
      audienceFlow,
      candidateListScene,
      confirmationScene,
      thankYouScene,
      projector,
      audience,
    ],
    edges: [
      {
        id: "edge_candidates_tally",
        kind: "wiring",
        sourceId: CANDIDATE_SOURCE_ID,
        targetId: TALLY_SCENE_ID,
        sourcePath: [],
        targetPath: [TALLY_VARIABLE_ID],
      },
      {
        id: "edge_candidates_audience",
        kind: "wiring",
        sourceId: CANDIDATE_SOURCE_ID,
        targetId: CANDIDATE_LIST_SCENE_ID,
        sourcePath: [],
        targetPath: [AUDIENCE_VARIABLE_ID],
      },
      {
        id: "edge_candidate_list_confirmation",
        kind: "navigate",
        sourceId: CANDIDATE_LIST_SCENE_ID,
        targetId: CONFIRMATION_SCENE_ID,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
      {
        id: "edge_confirmation_list",
        kind: "navigate",
        sourceId: CONFIRMATION_SCENE_ID,
        targetId: CANDIDATE_LIST_SCENE_ID,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
      {
        id: "edge_confirmation_thank_you",
        kind: "navigate",
        sourceId: CONFIRMATION_SCENE_ID,
        targetId: THANK_YOU_SCENE_ID,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
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

const SCENE_CANVAS_WIDTH = 720;
const SCENE_CANVAS_GAP = 80;

export function seedCanvasPosition(index: number): Position {
  return { x: index * (SCENE_CANVAS_WIDTH + SCENE_CANVAS_GAP), y: 0 };
}

export function seedBlockCanvasPosition(index: number): Position {
  return { x: index * 420, y: 900 };
}

export function votingCanvases(): Record<string, Canvas> {
  const candidateListSlot = repeatedSlot(
    "candidate-list-slot",
    "b",
    "block_candidate_button",
    AUDIENCE_VARIABLE_ID,
    [{ variableId: CANDIDATE_BUTTON_VARIABLE_ID, source: { kind: "runtimeItem" } }],
  );
  const tallySlot = repeatedSlot("tally-row-slot", "b", "block_tally_row", TALLY_VARIABLE_ID, [
    { variableId: TALLY_ROW_VARIABLE_ID, source: { kind: "runtimeItem" } },
  ]);
  return {
    [CANDIDATE_LIST_SCENE_ID]: {
      kind: "scene",
      root: root(CANDIDATE_LIST_SCENE_ID, "Candidate list", 360, 720, [
        text("candidate-list-title", "a", "Choose a candidate", "Title", 36),
        candidateListSlot,
      ]),
    },
    [CONFIRMATION_SCENE_ID]: {
      kind: "scene",
      root: root(CONFIRMATION_SCENE_ID, "Confirmation screen", 360, 720, [
        text("confirmation-title", "a", "Confirm your choice", "Title", 36),
        text("confirmation-message", "b", "Are you sure?", "Message", 28),
        button("confirmation-yes", "c", "Yes", "Yes", "#16A34A"),
        button("confirmation-no", "d", "No", "No", "#DC2626"),
      ]),
    },
    [THANK_YOU_SCENE_ID]: {
      kind: "scene",
      root: root(THANK_YOU_SCENE_ID, "Thank you screen", 360, 720, [
        text("thank-you-title", "a", "Thanks for voting!", "Title", 36),
        text("thank-you-message", "b", "Your vote has been counted.", "Message", 28),
      ]),
    },
    [TALLY_SCENE_ID]: {
      kind: "scene",
      root: root(TALLY_SCENE_ID, "Projector tally", 1920, 1080, [
        text("tally-title", "a", "Vote tally", "Title", 56),
        tallySlot,
      ]),
    },
  };
}

export type SeedGraph = ShowGraph;
export type SeedCanvases = Record<string, Canvas>;
export type SeedGraphBuilder = () => SeedGraph;
export type SeedCanvasBuilder = () => SeedCanvases;

export const SEED_GRAPHS: Record<string, SeedGraphBuilder> = {
  Voting: votingGraph,
};

export const SEED_CANVASES: Record<string, SeedCanvasBuilder> = {
  Voting: votingCanvases,
};
