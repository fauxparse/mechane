import { describe, expect, it } from "vitest";

import {
  assertValidInteractions,
  InvalidInteractionError,
  navigateEdgeId,
  projectNavigateEdges,
  type Action,
  type Cue,
  type EventBinding,
} from "./interactions";

const nodes = [
  { id: "flow_navigation", kind: "flow", parentId: null },
  { id: "scene_red", kind: "scene", parentId: "flow_navigation" },
  { id: "scene_green", kind: "scene", parentId: "flow_navigation" },
  { id: "scene_blue", kind: "scene", parentId: "flow_navigation" },
];

const cues: Cue[] = [
  {
    id: "cue_red_green",
    name: "Go to Green",
    sceneId: "scene_red",
    actionIds: ["action_red_green"],
  },
  {
    id: "cue_red_blue",
    name: "Go to Blue",
    sceneId: "scene_red",
    actionIds: ["action_red_blue"],
  },
];

const actions: Action[] = [
  {
    id: "action_red_green",
    cueId: "cue_red_green",
    kind: "navigate",
    targetSceneId: "scene_green",
  },
  {
    id: "action_red_blue",
    cueId: "cue_red_blue",
    kind: "navigate",
    targetSceneId: "scene_blue",
  },
];

const eventBindings: EventBinding[] = [
  {
    id: "binding_red_green",
    canvasId: "canvas_red",
    elementId: "button_green",
    eventKind: "tap",
    cueId: "cue_red_green",
  },
  {
    id: "binding_red_blue",
    canvasId: "canvas_red",
    elementId: "button_blue",
    eventKind: "tap",
    cueId: "cue_red_blue",
  },
];
const redGreenCue = cues[0];
const redGreenAction = actions[0];
const redGreenBinding = eventBindings[0];
if (!redGreenCue || !redGreenAction || !redGreenBinding) throw new Error("Fixture is incomplete.");

describe("interaction aggregate", () => {
  it("accepts owned ordered interactions and projects Navigate edges", () => {
    const graph = { nodes, cues, actions, eventBindings };
    expect(assertValidInteractions(graph)).toEqual({ cues, actions, eventBindings });
    expect(projectNavigateEdges(graph)).toEqual([
      {
        id: navigateEdgeId("action_red_green"),
        kind: "navigate",
        sourceId: "scene_red",
        targetId: "scene_green",
        sourcePath: [],
        targetPath: [],
        cueId: "cue_red_green",
        actionId: "action_red_green",
      },
      {
        id: navigateEdgeId("action_red_blue"),
        kind: "navigate",
        sourceId: "scene_red",
        targetId: "scene_blue",
        sourcePath: [],
        targetPath: [],
        cueId: "cue_red_blue",
        actionId: "action_red_blue",
      },
    ]);
  });

  it("rejects a Cue that references a missing Action", () => {
    expect(() =>
      assertValidInteractions({
        nodes,
        cues: [{ ...redGreenCue, actionIds: ["missing_action"] }],
        actions: [],
        eventBindings: [],
      }),
    ).toThrowError(InvalidInteractionError);
  });

  it("rejects a Navigate target outside the owning Flow", () => {
    expect(() =>
      assertValidInteractions({
        nodes: [...nodes, { id: "scene_other", kind: "scene", parentId: "other_flow" }],
        cues: [
          { id: "cue_cross", name: "Cross", sceneId: "scene_red", actionIds: ["action_cross"] },
        ],
        actions: [
          {
            id: "action_cross",
            cueId: "cue_cross",
            kind: "navigate",
            targetSceneId: "scene_other",
          },
        ],
        eventBindings: [],
      }),
    ).toThrowError(InvalidInteractionError);
  });

  it("rejects duplicate bindings for an Element and Event kind", () => {
    expect(() =>
      assertValidInteractions({
        nodes,
        cues: [redGreenCue],
        actions: [redGreenAction],
        eventBindings: [redGreenBinding, { ...redGreenBinding, id: "binding_duplicate" }],
      }),
    ).toThrowError(InvalidInteractionError);
  });
});
