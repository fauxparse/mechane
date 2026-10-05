import type { ShowGraph } from "@mechane/domain/graph";
import type { Cue } from "@mechane/domain/interactions";
import { resolveRuntimeEvent } from "@mechane/domain/interactions";
import { describe, expect, it } from "vitest";
import type { CanvasArtboardDocument } from "../../../api/canvas";
import { slotCueBindingCommand } from "./slot-cue-binding";

const source: Cue = {
  id: "block-selected",
  name: "Selected",
  owner: { kind: "block", blockId: "button" },
  actionIds: [],
  parameters: [{ id: "item", name: "Item", type: "text", position: 0 }],
};
const focused: CanvasArtboardDocument = {
  artId: "scene",
  canvasId: "scene-canvas",
  kind: "scene",
  name: "Scene",
  position: { x: 0, y: 0 },
  canvas: {
    kind: "scene",
    root: {
      id: "scene-root",
      type: "frame",
      children: [{ id: "button-slot", type: "slot", blockId: "button" }],
    },
  },
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
  cues: [source],
  blocks: [
    {
      id: "button",
      name: "Button",
      variables: [],
      states: [],
      canvas: { id: "button-canvas", kind: "block", root: { id: "button-root", type: "frame" } },
    },
  ],
  eventBindings: [
    {
      id: "tap",
      canvasId: "button-canvas",
      elementId: "button-root",
      eventKind: "tap",
      cueId: source.id,
      position: 0,
      parameterMappings: [{ parameterId: "item", source: { kind: "literal", value: "Alice" } }],
    },
  ],
};
const options = { graph, focused, sourceCueId: source.id, slotElementId: "button-slot" };

describe("Slot Cue authoring", () => {
  it("creates the first Scene Cue and parameterized relay as one undoable edit", () => {
    const applied = slotCueBindingCommand(options).apply(graph);
    const plan = resolveRuntimeEvent(applied.state, {
      sceneId: "scene",
      canvasId: "scene-canvas",
      elementId: "button-root",
      eventKind: "tap",
      slotInstancePath: [{ slotElementId: "button-slot", index: 0 }],
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") throw new Error("The authored Block event was not handled.");
    expect(plan.cue.owner).toEqual({ kind: "scene", sceneId: "scene" });
    expect(plan.cue.parameters).toEqual([
      { id: expect.any(String), name: "Item", type: "text", position: 0 },
    ]);
    expect(plan.parameters.hops).toEqual([
      [{ sourceParameterId: "item", targetParameterId: plan.cue.parameters?.[0]?.id }],
    ]);
    expect(applied.inverse.apply(applied.state).state.cues).toEqual(graph.cues);
    expect(applied.inverse.apply(applied.state).state.slotEventBindings).toEqual([]);
  });

  it("uses a compatible Cue from the containing Scene, never another Scene", () => {
    const other: Cue = {
      id: "other-cue",
      name: "Other",
      owner: { kind: "scene", sceneId: "other" },
      actionIds: [],
    };
    const target: Cue = {
      id: "handled",
      name: "Handled",
      owner: { kind: "scene", sceneId: "scene" },
      actionIds: [],
      parameters: [{ id: "chosen", name: "Item", type: "text", position: 0 }],
    };
    const current = { ...graph, cues: [source, other, target] };
    const applied = slotCueBindingCommand({ ...options, graph: current }).apply(current);
    expect(applied.state.cues).toEqual(current.cues);
    expect(applied.state.slotEventBindings?.[0]).toMatchObject({
      targetCueId: target.id,
      parameterMappings: [{ sourceParameterId: "item", targetParameterId: "chosen" }],
    });
  });

  it("creates a uniquely named Cue while retargeting the same ordered binding", () => {
    const initial = slotCueBindingCommand(options).apply(graph).state;
    const binding = initial.slotEventBindings?.[0];
    if (!binding) throw new Error("Expected the initial Slot binding.");
    const applied = slotCueBindingCommand({
      ...options,
      graph: initial,
      createNew: true,
      bindingId: binding.id,
    }).apply(initial);
    expect(applied.state.slotEventBindings).toHaveLength(1);
    expect(applied.state.slotEventBindings?.[0]).toMatchObject({
      id: binding.id,
      position: binding.position,
    });
    const target = applied.state.cues?.find(
      (cue) => cue.id === applied.state.slotEventBindings?.[0]?.targetCueId,
    );
    expect(target?.name).toBe("Selected 2");
    expect(applied.inverse.apply(applied.state).state).toEqual(initial);
  });
});
