import { describe, expect, it } from "vitest";

import {
  assertValidInteractions,
  InvalidInteractionError,
  navigateEdgeId,
  projectNavigateEdges,
  resolveRuntimeEvent,
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
    owner: { kind: "scene", sceneId: "scene_red" },
    actionIds: ["action_red_green"],
  },
  {
    id: "cue_red_blue",
    name: "Go to Blue",
    owner: { kind: "scene", sceneId: "scene_red" },
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
    position: 0,
  },
  {
    id: "binding_red_blue",
    canvasId: "canvas_red",
    elementId: "button_blue",
    eventKind: "tap",
    cueId: "cue_red_blue",
    position: 0,
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
  it("resolves the first matching binding by position", () => {
    const fallback = {
      ...redGreenBinding,
      id: "binding_red_green_fallback",
      cueId: "cue_red_blue",
      position: 1,
    };
    expect(
      resolveRuntimeEvent(
        { nodes, cues, actions, eventBindings: [fallback, redGreenBinding] },
        {
          sceneId: "scene_red",
          canvasId: "canvas_red",
          elementId: "button_green",
          eventKind: "tap",
        },
      ),
    ).toMatchObject({ kind: "planned", cue: { id: "cue_red_green" } });
  });

  it("accepts empty Scene and Block Cues as no-op configuration", () => {
    expect(
      assertValidInteractions({
        nodes,
        blocks: [{ id: "block_card" }],
        cues: [
          {
            id: "cue_empty_scene",
            name: "No-op Scene",
            owner: { kind: "scene", sceneId: "scene_red" },
            actionIds: [],
          },
          {
            id: "cue_empty_block",
            name: "No-op Block",
            owner: { kind: "block", blockId: "block_card" },
            actionIds: [],
          },
        ],
        actions: [],
        eventBindings: [],
      }),
    ).toMatchObject({ cues: expect.any(Array), actions: [], eventBindings: [] });
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
          {
            id: "cue_cross",
            name: "Cross",
            owner: { kind: "scene", sceneId: "scene_red" },
            actionIds: ["action_cross"],
          },
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

  it("accepts multiple ordered bindings for an Element and Event kind", () => {
    const secondBinding = {
      ...redGreenBinding,
      id: "binding_red_green_fallback",
      cueId: "cue_red_blue",
      position: 1,
    };
    expect(
      assertValidInteractions({
        nodes,
        cues,
        actions,
        eventBindings: [redGreenBinding, secondBinding],
      }).eventBindings,
    ).toEqual([redGreenBinding, secondBinding]);
  });

  it("rejects duplicate binding positions for an Element", () => {
    expect(() =>
      assertValidInteractions({
        nodes,
        cues: [redGreenCue],
        actions: [redGreenAction],
        eventBindings: [redGreenBinding, { ...redGreenBinding, id: "binding_duplicate" }],
      }),
    ).toThrowError(InvalidInteractionError);
  });
  it("resolves an observed Event into the authored Action plan", () => {
    const graph = { nodes, cues, actions, eventBindings };

    expect(
      resolveRuntimeEvent(graph, {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "button_green",
        eventKind: "tap",
      }),
    ).toEqual({
      kind: "planned",
      sceneId: "scene_red",
      cue: redGreenCue,
      actions: [redGreenAction],
    });
  });

  it("returns data for stale and unbound runtime observations", () => {
    const graph = { nodes, cues, actions, eventBindings };

    expect(
      resolveRuntimeEvent(graph, {
        sceneId: "scene_missing",
        canvasId: "canvas_red",
        elementId: "button_green",
        eventKind: "tap",
      }),
    ).toEqual({ kind: "unbound", reason: "stale-scene" });
    expect(
      resolveRuntimeEvent(graph, {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "button_missing",
        eventKind: "tap",
      }),
    ).toEqual({ kind: "unbound", reason: "unbound-event" });
  });

  it("rejects a binding whose Cue belongs to another Scene", () => {
    expect(() =>
      resolveRuntimeEvent(
        {
          nodes,
          cues: [redGreenCue],
          actions: [redGreenAction],
          eventBindings: [redGreenBinding],
        },
        {
          sceneId: "scene_green",
          canvasId: "canvas_red",
          elementId: "button_green",
          eventKind: "tap",
        },
      ),
    ).toThrowError(InvalidInteractionError);
  });
});
