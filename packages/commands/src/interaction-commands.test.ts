import { describe, expect, it } from "vitest";
import type { ShowGraph } from "@mechane/domain";

import {
  addEventBinding,
  addNavigateAction,
  addCue,
  removeCue,
  renameSceneAndCue,
  setCueActionOrder,
  setEventBindingKey,
  setEventBindingOrder,
} from "./interaction-commands";
import { deleteGraphElements } from "./graph-cascade";

const baseGraph: ShowGraph = {
  nodes: [
    {
      id: "flow",
      kind: "flow",
      name: "Flow",
      parentId: null,
      position: { x: 0, y: 0 },
      defaultSceneId: "red",
    },
    {
      id: "red",
      kind: "scene",
      name: "Red",
      parentId: "flow",
      position: { x: 0, y: 0 },
      variables: [],
    },
    {
      id: "green",
      kind: "scene",
      name: "Green",
      parentId: "flow",
      position: { x: 300, y: 0 },
      variables: [],
    },
  ],
  edges: [],
  cues: [],
  actions: [],
  eventBindings: [],
};

const cue = {
  id: "cue-red-green",
  name: "Go to Green",
  owner: { kind: "scene" as const, sceneId: "red" },
  actionIds: ["action-red-green"],
};
const action = {
  id: "action-red-green",
  cueId: cue.id,
  kind: "navigate" as const,
  targetSceneId: "green",
};
const binding = {
  id: "binding-red-green",
  canvasId: "canvas-red",
  elementId: "button-green",
  eventKind: "tap" as const,
  cueId: cue.id,
  position: 0,
};

describe("interaction commands", () => {
  it("projects a Cue-owned Navigate Action from its Cue row", () => {
    const withCue = addCue(cue).apply(baseGraph).state;
    const withAction = addNavigateAction(action).apply(withCue).state;
    const withBinding = addEventBinding(binding).apply(withAction).state;

    expect(withBinding.cues).toEqual([cue]);
    expect(withBinding.actions).toEqual([action]);
    expect(withBinding.eventBindings).toEqual([binding]);
    expect(withBinding.edges).toEqual([
      {
        id: "navigate:action-red-green",
        kind: "navigate",
        sourceId: "red",
        targetId: "green",
        sourcePath: [],
        targetPath: [],
        cueId: cue.id,
        actionId: action.id,
      },
    ]);
  });

  it("renames a newly-created Scene and generated Cue together", () => {
    const graph = addNavigateAction(action).apply(addCue(cue).apply(baseGraph).state).state;
    const applied = renameSceneAndCue("red", cue.id, "Lobby").apply(graph);

    expect(applied.state.nodes.find((node) => node.id === "red")?.name).toBe("Lobby");
    expect(applied.state.cues?.find((item) => item.id === cue.id)?.name).toBe("Go to Lobby");
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });

  it("reorders bindings for one Element without changing their identities", () => {
    const secondBinding = { ...binding, id: "binding-red-green-fallback", position: 1 };
    const graph = addEventBinding(secondBinding).apply(
      addEventBinding(binding).apply(baseGraph).state,
    ).state;
    const applied = setEventBindingOrder([secondBinding.id, binding.id]).apply(graph);

    expect(applied.state.eventBindings).toEqual([
      { ...binding, position: 1 },
      { ...secondBinding, position: 0 },
    ]);
    expect(applied.inverse.apply(applied.state).state.eventBindings).toEqual(graph.eventBindings);
  });
  it("removes a Cue with its Bindings and Actions as one undoable operation", () => {
    const graph = addEventBinding(binding).apply(
      addNavigateAction(action).apply(addCue(cue).apply(baseGraph).state).state,
    ).state;
    const applied = removeCue(cue.id).apply(graph);

    expect(applied.state.cues).toEqual([]);
    expect(applied.state.actions).toEqual([]);
    expect(applied.state.eventBindings).toEqual([]);
    expect(applied.state.edges).toEqual([]);
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });

  it("keeps an empty Cue valid while reordering its owned Actions", () => {
    const graph = addCue({ ...cue, actionIds: [] }).apply(baseGraph).state;
    const applied = setCueActionOrder(cue.id, []).apply(graph);
    expect(applied.state.cues?.[0]?.actionIds).toEqual([]);
    expect(applied.inverse.apply(applied.state).state.cues?.[0]?.actionIds).toEqual([]);
  });
  it("removes Scene-owned interactions when deleting their Scene", () => {
    const graph = addEventBinding(binding).apply(
      addNavigateAction(action).apply(addCue(cue).apply(baseGraph).state).state,
    ).state;
    const applied = deleteGraphElements(graph, ["red"]).apply(graph);

    expect(applied.state.cues).toEqual([]);
    expect(applied.state.actions).toEqual([]);
    expect(applied.state.eventBindings).toEqual([]);
    expect(applied.state.nodes.some((node) => node.id === "red")).toBe(false);
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });
  it("removes a Navigate Action when deleting its target Scene", () => {
    const graph = addEventBinding(binding).apply(
      addNavigateAction(action).apply(addCue(cue).apply(baseGraph).state).state,
    ).state;
    const applied = deleteGraphElements(graph, ["green"]).apply(graph);

    expect(applied.state.cues).toEqual([{ ...cue, actionIds: [] }]);
    expect(applied.state.actions).toEqual([]);
    expect(applied.state.eventBindings).toEqual([binding]);
    expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  });
});

describe("setEventBindingKey", () => {
  const keypressGraph = (key: string | null): ShowGraph => ({
    nodes: [
      {
        id: "flow",
        kind: "flow",
        name: "Flow",
        parentId: null,
        position: { x: 0, y: 0 },
        defaultSceneId: "scene_red",
      },
      {
        id: "scene_red",
        kind: "scene",
        name: "Red",
        parentId: "flow",
        position: { x: 0, y: 0 },
        variables: [],
      },
    ],
    edges: [],
    cues: [
      { id: "cue", name: "Go", owner: { kind: "scene", sceneId: "scene_red" }, actionIds: [] },
    ],
    actions: [],
    eventBindings: [
      {
        id: "binding",
        canvasId: "canvas",
        elementId: "root",
        eventKind: "keypress",
        params: { key },
        cueId: "cue",
        position: 0,
      },
    ],
  });

  const keyOf = (graph: ShowGraph) => {
    const binding = graph.eventBindings?.[0];
    return binding?.eventKind === "keypress" ? binding.params.key : undefined;
  };

  it("assigns a key and restores the previous one on undo", () => {
    const result = setEventBindingKey("binding", "r").apply(keypressGraph(null));
    expect(keyOf(result.state)).toBe("r");

    // An unset key is a real prior state, so undo must return to it rather
    // than to some default.
    expect(keyOf(result.inverse.apply(result.state).state)).toBeNull();
  });

  it("refuses a key outside the catalogue", () => {
    expect(() => setEventBindingKey("binding", "F5").apply(keypressGraph(null))).toThrow();
  });

  it("refuses a Binding that is not a keypress", () => {
    const graph = keypressGraph(null);
    const tapGraph: ShowGraph = {
      ...graph,
      eventBindings: [
        {
          id: "binding",
          canvasId: "canvas",
          elementId: "root",
          eventKind: "tap",
          cueId: "cue",
          position: 0,
        },
      ],
    };

    expect(() => setEventBindingKey("binding", "r").apply(tapGraph)).toThrow();
  });
});
