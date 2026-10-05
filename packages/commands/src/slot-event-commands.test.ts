import type { ShowGraph } from "@mechane/domain/graph";
import type { Cue, SlotEventBinding } from "@mechane/domain/interactions";
import { resolveRuntimeEvent } from "@mechane/domain/interactions";
import { describe, expect, it } from "vitest";
import { applyGraphEdits } from "./graph-edits";
import { encodeGraphEdit, decodeGraphEdit } from "./graph-edit-codec";
import { removeBlock } from "./graph-commands";
import { deleteGraphElements } from "./graph-cascade";
import { removeCue, removeSlotEventBinding, setSlotEventBinding } from "./interaction-commands";

const source: Cue = {
  id: "pressed",
  name: "Pressed",
  owner: { kind: "block", blockId: "button" },
  actionIds: [],
};
const target: Cue = {
  id: "handled",
  name: "Handled",
  owner: { kind: "scene", sceneId: "scene" },
  actionIds: [],
};
const alternative: Cue = { ...target, id: "alternative", name: "Alternative" };
const binding: SlotEventBinding = {
  id: "relay",
  slotElementId: "slot",
  sourceCueId: source.id,
  targetCueId: target.id,
  parameterMappings: [],
  position: 0,
};
const graph: ShowGraph = {
  nodes: [
    {
      id: "scene",
      kind: "scene",
      name: "Scene",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [],
    },
  ],
  edges: [],
  blocks: [
    {
      id: "button",
      name: "Button",
      variables: [],
      states: [],
      canvas: { id: "button-canvas", root: { id: "root", type: "frame" } },
    },
  ],
  cues: [source, target, alternative],
  actions: [],
  eventBindings: [
    {
      id: "tap",
      canvasId: "button-canvas",
      elementId: "root",
      eventKind: "tap",
      cueId: source.id,
      position: 0,
    },
  ],
  slotEventBindings: [
    { ...binding, id: "before", slotElementId: "other-slot" },
    binding,
    { ...binding, id: "after", slotElementId: "last-slot" },
  ],
};
const observation = {
  sceneId: "scene",
  canvasId: "scene-canvas",
  elementId: "root",
  eventKind: "tap" as const,
  slotInstancePath: [{ slotElementId: "slot", index: 0 }],
};

it("retargets a saved Slot event through wire replay and restores its previous handler on undo", () => {
  const applied = setSlotEventBinding({ ...binding, targetCueId: alternative.id }).apply(graph);
  if (!applied.edits) throw new Error("The Slot binding change must be saved.");
  const replayed = applyGraphEdits(
    graph,
    applied.edits.map((edit) => decodeGraphEdit(encodeGraphEdit(edit))),
  );
  expect(resolveRuntimeEvent(replayed, observation)).toMatchObject({
    kind: "planned",
    cue: { id: alternative.id },
  });
  expect(applied.inverse.apply(applied.state).state).toEqual(graph);
  expect(replayed.slotEventBindings?.map((entry) => entry.id)).toEqual([
    "before",
    "relay",
    "after",
  ]);
});

it("disconnects a Slot event and restores its ordered handler on undo", () => {
  const applied = removeSlotEventBinding(binding.id).apply(graph);
  expect(resolveRuntimeEvent(applied.state, observation).kind).toBe("unbound");
  const restored = applied.inverse.apply(applied.state).state;
  expect(restored).toEqual(graph);
  expect(resolveRuntimeEvent(restored, observation)).toMatchObject({
    kind: "planned",
    cue: { id: target.id },
  });
});

describe("dependent Slot relay deletion", () => {
  it.each([source.id, target.id])(
    "removes relays attached to deleted Cue %s and restores them on undo",
    (cueId) => {
      const applied = removeCue(cueId).apply(graph);
      expect(applied.state.slotEventBindings).toEqual([]);
      const restored = applied.inverse.apply(applied.state);
      expect(restored.state).toEqual(graph);
      if (!restored.edits) throw new Error("Restored Slot bindings must be saved.");
      expect(applyGraphEdits(applied.state, restored.edits).slotEventBindings).toEqual(
        graph.slotEventBindings,
      );
    },
  );

  it("removes Scene-owned handlers and their Slot relays as one undoable cascade", () => {
    const applied = deleteGraphElements(graph, ["scene"]).apply(graph);
    expect(applied.state.slotEventBindings).toEqual([]);
    const restored = applied.inverse.apply(applied.state).state;
    expect(restored).toEqual(graph);
    expect(resolveRuntimeEvent(restored, observation)).toMatchObject({
      kind: "planned",
      cue: { id: target.id },
    });
  });

  it("removes a Block's output Cues and relays together and restores them on undo", () => {
    const applied = removeBlock("button").apply(graph);
    expect(applied.state.cues).toEqual([target, alternative]);
    expect(applied.state.slotEventBindings).toEqual([]);
    expect(applied.state.eventBindings).toEqual([]);
    const restored = applied.inverse.apply(applied.state);
    expect(restored.state).toEqual(graph);
    if (!restored.edits) throw new Error("Restored Block interactions must be saved.");
    expect(
      resolveRuntimeEvent(applyGraphEdits(applied.state, restored.edits), observation),
    ).toMatchObject({ kind: "planned", cue: { id: target.id } });
  });
});
