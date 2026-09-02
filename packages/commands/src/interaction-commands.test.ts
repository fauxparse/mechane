import { describe, expect, it } from "vitest";
import type { ShowGraph } from "@mechane/domain";

import {
  addEventBinding,
  addNavigateAction,
  addCue,
  removeCue,
  setCueActionOrder,
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
