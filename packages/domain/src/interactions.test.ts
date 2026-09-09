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
  type SlotEventBinding,
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

/**
 * A Slot on `scene_red`'s Canvas holding a Block whose own Cue relays up. The
 * Block's tap Binding names the Block Canvas, which is what makes a Scene
 * Canvas match impossible and the relay necessary.
 */
const relayBlocks = [{ id: "block_swatch", canvas: { id: "canvas_swatch" } }];

const relayCues: Cue[] = [
  ...cues,
  {
    id: "cue_swatch_picked",
    name: "Picked",
    owner: { kind: "block", blockId: "block_swatch" },
    actionIds: [],
    parameters: [{ id: "swatch", name: "Swatch", type: "text", position: 0 }],
  },
  {
    id: "cue_red_pick",
    name: "Pick a swatch",
    owner: { kind: "scene", sceneId: "scene_red" },
    actionIds: ["action_red_pick"],
    parameters: [{ id: "picked", name: "Picked", type: "text", position: 0 }],
  },
];

const relayActions: Action[] = [
  ...actions,
  {
    id: "action_red_pick",
    cueId: "cue_red_pick",
    kind: "navigate",
    targetSceneId: "scene_blue",
  },
];

const relayEventBindings: EventBinding[] = [
  ...eventBindings,
  {
    id: "binding_swatch_tap",
    canvasId: "canvas_swatch",
    elementId: "swatch_root",
    eventKind: "tap",
    cueId: "cue_swatch_picked",
    position: 0,
    parameterMappings: [
      { parameterId: "swatch", source: { kind: "variable", variableId: "swatch_label" } },
    ],
  },
];

const relaySlotEventBindings: SlotEventBinding[] = [
  {
    id: "slot_binding_swatch",
    slotElementId: "swatch_slot",
    sourceCueId: "cue_swatch_picked",
    targetCueId: "cue_red_pick",
    position: 0,
    parameterMappings: [{ sourceParameterId: "swatch", targetParameterId: "picked" }],
  },
];

const relayGraph = {
  nodes,
  blocks: relayBlocks,
  cues: relayCues,
  actions: relayActions,
  eventBindings: relayEventBindings,
  slotEventBindings: relaySlotEventBindings,
};

describe("Slot Event Binding relay", () => {
  it("relays a tap inside a Block instance to the Scene Cue that handles it", () => {
    const plan = resolveRuntimeEvent(relayGraph, {
      sceneId: "scene_red",
      canvasId: "canvas_red",
      elementId: "swatch_root",
      eventKind: "tap",
      slotInstancePath: [{ slotElementId: "swatch_slot", index: 2 }],
    });
    expect(plan).toEqual({
      kind: "planned",
      sceneId: "scene_red",
      cue: relayCues[3],
      actions: [relayActions[2]],
      parameters: {
        instancePath: [{ slotElementId: "swatch_slot", index: 2 }],
        bindingMappings: [
          { parameterId: "swatch", source: { kind: "variable", variableId: "swatch_label" } },
        ],
        hops: [[{ sourceParameterId: "swatch", targetParameterId: "picked" }]],
      },
    });
  });

  it("leaves the same Element unbound without the Slot instance path", () => {
    expect(
      resolveRuntimeEvent(relayGraph, {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "swatch_root",
        eventKind: "tap",
      }),
    ).toEqual({ kind: "unbound", reason: "unbound-event" });
  });

  it("treats an unrelayed Block Cue as inert", () => {
    const plan = resolveRuntimeEvent(
      { ...relayGraph, slotEventBindings: [] },
      {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "swatch_root",
        eventKind: "tap",
        slotInstancePath: [{ slotElementId: "swatch_slot", index: 0 }],
      },
    );
    expect(plan).toEqual({ kind: "unbound", reason: "unbound-event" });
  });

  it("rejects a relay that leaves a Block Cue unhandled at the outermost Slot", () => {
    const graph = {
      ...relayGraph,
      cues: relayCues.map((cue) =>
        cue.id === "cue_red_pick"
          ? { ...cue, owner: { kind: "block" as const, blockId: "block_swatch" }, actionIds: [] }
          : cue,
      ),
      actions,
    };
    expect(() =>
      resolveRuntimeEvent(graph, {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "swatch_root",
        eventKind: "tap",
        slotInstancePath: [{ slotElementId: "swatch_slot", index: 0 }],
      }),
    ).toThrow(InvalidInteractionError);
  });

  it("does not let a Scene Canvas Binding answer a tap observed inside a Slot", () => {
    expect(
      resolveRuntimeEvent(relayGraph, {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "button_green",
        eventKind: "tap",
        slotInstancePath: [{ slotElementId: "swatch_slot", index: 0 }],
      }),
    ).toEqual({ kind: "unbound", reason: "unbound-event" });
  });

  it("rejects a Block Canvas Binding that names a Scene Cue directly", () => {
    const graph = {
      ...relayGraph,
      eventBindings: [
        ...eventBindings,
        {
          id: "binding_swatch_tap",
          canvasId: "canvas_swatch",
          elementId: "swatch_root",
          eventKind: "tap" as const,
          cueId: "cue_red_pick",
          position: 0,
          parameterMappings: [
            {
              parameterId: "picked",
              source: { kind: "variable" as const, variableId: "swatch_label" },
            },
          ],
        },
      ],
    };
    expect(() =>
      resolveRuntimeEvent(graph, {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "swatch_root",
        eventKind: "tap",
        slotInstancePath: [{ slotElementId: "swatch_slot", index: 0 }],
      }),
    ).toThrow(InvalidInteractionError);
  });
});

describe("interaction aggregate", () => {
  it("accepts owned ordered interactions and projects Navigate edges", () => {
    const graph = { nodes, cues, actions, eventBindings };
    expect(assertValidInteractions(graph)).toEqual({
      cues,
      actions,
      eventBindings,
      slotEventBindings: [],
    });
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
      parameters: { instancePath: [], bindingMappings: [], hops: [] },
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
it("accepts typed parameters and ordered actionless Block Cue relays", () => {
  const blockCue: Cue = {
    id: "cue_block_selected",
    name: "Selected",
    owner: { kind: "block", blockId: "block_candidate" },
    actionIds: [],
    parameters: [{ id: "candidate", name: "Candidate", type: "text", position: 0 }],
  };
  const sceneCue: Cue = {
    id: "cue_scene_selected",
    name: "Selected",
    owner: { kind: "scene", sceneId: "scene_red" },
    actionIds: [],
    parameters: [{ id: "candidate", name: "Candidate", type: "text", position: 0 }],
  };
  expect(
    assertValidInteractions({
      nodes,
      blocks: [{ id: "block_candidate" }],
      cues: [blockCue, sceneCue],
      actions: [],
      eventBindings: [],
      slotEventBindings: [
        {
          id: "slot_binding_selected",
          slotElementId: "slot_candidates",
          sourceCueId: blockCue.id,
          targetCueId: sceneCue.id,
          position: 0,
          parameterMappings: [
            {
              sourceParameterId: "candidate",
              targetParameterId: "candidate",
            },
          ],
        },
      ],
    }).slotEventBindings,
  ).toHaveLength(1);
});
it("validates Element Cue Parameter mappings", () => {
  const cue: Cue = {
    id: "cue_block_tap",
    name: "Tapped",
    owner: { kind: "block", blockId: "block_candidate" },
    actionIds: [],
    parameters: [{ id: "candidate", name: "Candidate", type: "text", position: 0 }],
  };
  const binding: EventBinding = {
    id: "binding_block_tap",
    canvasId: "canvas_block",
    elementId: "candidate_button",
    eventKind: "tap",
    cueId: cue.id,
    position: 0,
    parameterMappings: [{ parameterId: "candidate", source: { kind: "literal", value: "Alice" } }],
  };
  expect(
    assertValidInteractions({
      nodes,
      blocks: [{ id: "block_candidate" }],
      cues: [cue],
      eventBindings: [binding],
    }),
  ).toMatchObject({ eventBindings: [binding] });
  expect(() =>
    assertValidInteractions({
      nodes,
      blocks: [{ id: "block_candidate" }],
      cues: [cue],
      eventBindings: [{ ...binding, parameterMappings: [] }],
    }),
  ).toThrow(/every Cue Parameter exactly once/);
});

const keypress = (
  id: string,
  key: string | null,
  cueId: string,
  position: number,
): EventBinding => ({
  id,
  canvasId: "canvas_red",
  elementId: "scene_red_root",
  eventKind: "keypress",
  params: { key },
  cueId,
  position,
});

const keypressGraph = (bindings: EventBinding[]) => ({
  nodes,
  cues,
  actions,
  eventBindings: bindings,
});

const observeKey = (key: string) => ({
  sceneId: "scene_red",
  canvasId: "canvas_red",
  elementId: "scene_red_root",
  eventKind: "keypress" as const,
  params: { key },
});

describe("keypress resolution", () => {
  it("matches on the key, not on position order", () => {
    // Two keypresses on one Element never compete: they are different keys, so
    // position is only ever a tiebreak among *equal* matches.
    const graph = keypressGraph([
      keypress("binding_g", "g", "cue_red_green", 0),
      keypress("binding_b", "b", "cue_red_blue", 1),
    ]);

    const plan = resolveRuntimeEvent(graph, observeKey("b"));

    expect(plan.kind).toBe("planned");
    expect(plan.kind === "planned" && plan.cue.id).toBe("cue_red_blue");
  });

  it("falls through by position when two Bindings share a key", () => {
    const graph = keypressGraph([
      keypress("binding_second", "g", "cue_red_blue", 1),
      keypress("binding_first", "g", "cue_red_green", 0),
    ]);

    const plan = resolveRuntimeEvent(graph, observeKey("g"));

    expect(plan.kind === "planned" && plan.cue.id).toBe("cue_red_green");
  });

  it("never matches an unset key, so a half-authored Binding is inert", () => {
    const graph = keypressGraph([keypress("binding_unset", null, "cue_red_green", 0)]);

    expect(resolveRuntimeEvent(graph, observeKey("g")).kind).toBe("unbound");
  });

  it("does not let a tap answer a keypress on the same Element", () => {
    const graph = keypressGraph([
      {
        id: "binding_tap",
        canvasId: "canvas_red",
        elementId: "scene_red_root",
        eventKind: "tap",
        cueId: "cue_red_green",
        position: 0,
      },
    ]);

    expect(resolveRuntimeEvent(graph, observeKey("g")).kind).toBe("unbound");
  });
});

describe("Event params validation", () => {
  it("accepts an unset key as a valid, silent state", () => {
    expect(() =>
      assertValidInteractions(keypressGraph([keypress("binding_unset", null, "cue_red_green", 0)])),
    ).not.toThrow();
  });

  it("rejects a key outside the catalogue", () => {
    // The domain can see the catalogue (unlike Canvas roots), so it enforces
    // it — imported or hand-edited data is caught here.
    expect(() =>
      assertValidInteractions(keypressGraph([keypress("binding_f5", "F5", "cue_red_green", 0)])),
    ).toThrow(InvalidInteractionError);
  });

  it("rejects params on a tap, which takes none", () => {
    const binding = {
      id: "binding_tap",
      canvasId: "canvas_red",
      elementId: "scene_red_root",
      eventKind: "tap",
      params: { key: "r" },
      cueId: "cue_red_green",
      position: 0,
    } as unknown as EventBinding;

    expect(() => assertValidInteractions(keypressGraph([binding]))).toThrow(
      InvalidInteractionError,
    );
  });
});
