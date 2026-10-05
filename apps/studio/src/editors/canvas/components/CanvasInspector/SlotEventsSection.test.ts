import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Cue, SlotEventBinding } from "@mechane/domain/interactions";
import type { Shape } from "@mechane/domain/shapes";
import type { CanvasArtboardDocument } from "../../../../api/canvas";

import type { CanvasInspectorProps } from "./canvas-inspector-types";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { SlotEventsSection } from "./SlotEventsSection";
import { useCanvasInspectorModel } from "./use-canvas-inspector-model";

/**
 * The saved Voting relay, as the seed stores it: a CandidateButton Block Cue
 * relayed through the candidate list Slot into the Scene's Choose candidate
 * Cue, one parameter crossing over.
 */
const CANDIDATE_LIST_SCENE_ID = "scene_candidate_list";
const CANDIDATE_BUTTON_CUE_ID = "cue_candidate_button_selected";
const CHOOSE_CANDIDATE_CUE_ID = "cue_choose_candidate";
const candidateType = { kind: "shape" as const, shapeId: "shape_candidate" };

const shapes: readonly Shape[] = [
  {
    id: "shape_candidate",
    name: "Candidate",
    fields: [
      {
        id: "field_candidate_name",
        name: "Name",
        type: "text",
        required: false,
        defaultValue: null,
      },
    ],
  },
];

const slot = {
  id: "candidate-list-slot",
  type: "slot" as const,
  name: "Candidate list",
  rank: "b",
  blockId: "block_candidate_button",
};

const focused: CanvasArtboardDocument = {
  canvasId: "canvas_voting_candidate_list",
  artId: CANDIDATE_LIST_SCENE_ID,
  kind: "scene",
  name: "Candidate list",
  canvas: {
    kind: "scene",
    root: {
      id: "candidate-list-root",
      type: "frame",
      name: "Candidate list",
      children: [slot, { id: "other", type: "rect" }],
    },
  },
  position: { x: 24, y: 74 },
};

const sourceCue: Cue = {
  id: CANDIDATE_BUTTON_CUE_ID,
  name: "Selected",
  owner: { kind: "block", blockId: "block_candidate_button" },
  actionIds: [],
  parameters: [{ id: "candidate", name: "Candidate", type: candidateType, position: 0 }],
};

const targetCue: Cue = {
  id: CHOOSE_CANDIDATE_CUE_ID,
  name: "Choose candidate",
  owner: { kind: "scene", sceneId: CANDIDATE_LIST_SCENE_ID },
  actionIds: [],
  parameters: [{ id: "selectedCandidate", name: "Candidate", type: candidateType, position: 0 }],
};

const savedRelay: SlotEventBinding = {
  id: "slot_binding_candidate_selected",
  slotElementId: "candidate-list-slot",
  sourceCueId: CANDIDATE_BUTTON_CUE_ID,
  targetCueId: CHOOSE_CANDIDATE_CUE_ID,
  position: 0,
  parameterMappings: [{ sourceParameterId: "candidate", targetParameterId: "selectedCandidate" }],
};

const props = (overrides?: Partial<CanvasInspectorProps>): CanvasInspectorProps => ({
  focused,
  artboards: [focused],
  selection: { artId: CANDIDATE_LIST_SCENE_ID, elementIds: ["candidate-list-slot"] },
  shapes,
  cues: [sourceCue, targetCue],
  slotEventBindings: [savedRelay],
  ...overrides,
});

function SlotEventsInspector(inspectorProps: CanvasInspectorProps) {
  const model = useCanvasInspectorModel(inspectorProps);
  if (!model) return null;
  return createElement(CanvasInspectorProvider, { value: model }, createElement(SlotEventsSection));
}

describe("SlotEventsSection", () => {
  it("shows the saved relay through the inspector model", () => {
    const html = renderToStaticMarkup(createElement(SlotEventsInspector, props()));

    // Both ends of the link read as authored: the Block's event name, and the
    // Scene Cue that handles it.
    expect(html).toContain("Selected");
    expect(html).toContain("Choose candidate");
    expect(html).toContain('aria-label="Cue handling Selected"');
    expect(html).toContain('aria-label="Delete Selected relay"');
    // The crossing parameter, by the names its Cues give it.
    expect(html).toContain("Maps");
    expect(html).toContain('title="Candidate → Candidate"');
  });

  it("renders nothing for a Slot with no saved links", () => {
    const html = renderToStaticMarkup(
      createElement(SlotEventsInspector, props({ slotEventBindings: [] })),
    );

    expect(html).toBe("");
  });

  it("renders nothing unless a single Slot is selected", () => {
    const multi = renderToStaticMarkup(
      createElement(
        SlotEventsInspector,
        props({ selection: { artId: CANDIDATE_LIST_SCENE_ID, elementIds: [slot.id, "other"] } }),
      ),
    );
    const nonSlot = renderToStaticMarkup(
      createElement(
        SlotEventsInspector,
        props({
          selection: { artId: CANDIDATE_LIST_SCENE_ID, elementIds: ["candidate-list-root"] },
        }),
      ),
    );

    expect(multi).toBe("");
    expect(nonSlot).toBe("");
  });

  it("shows every saved link in authored order with distinct picker names", () => {
    const secondSource: Cue = {
      id: "cue_candidate_long_press",
      name: "Long press",
      owner: { kind: "block", blockId: "block_candidate_button" },
      actionIds: [],
      parameters: [{ id: "candidate", name: "Candidate", type: candidateType, position: 0 }],
    };
    const laterRelay: SlotEventBinding = {
      id: "slot_binding_long_press",
      slotElementId: "candidate-list-slot",
      sourceCueId: "cue_candidate_long_press",
      targetCueId: CHOOSE_CANDIDATE_CUE_ID,
      // Stored out of order: position, not array order, decides.
      position: 1,
      parameterMappings: [
        { sourceParameterId: "candidate", targetParameterId: "selectedCandidate" },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(
        SlotEventsInspector,
        props({
          cues: [secondSource, sourceCue, targetCue],
          slotEventBindings: [laterRelay, savedRelay],
        }),
      ),
    );

    expect(html.indexOf("Selected")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Long press")).toBeGreaterThan(html.indexOf("Selected"));
    expect(html).toContain('aria-label="Cue handling Selected"');
    expect(html).toContain('aria-label="Cue handling Long press"');
    expect(html).toContain('aria-label="Delete Long press relay"');
  });
});
