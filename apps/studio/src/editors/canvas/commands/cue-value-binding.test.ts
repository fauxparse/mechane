import { applyGraphEdits, decodeGraphEdit, encodeGraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import { resolveRuntimeEvent } from "@mechane/domain/interactions";
import { describe, expect, it } from "vitest";
import { passCueValueCommand, type CueValueSource } from "./cue-value-binding";

const candidate: CueValueSource = {
  name: "Candidate",
  type: { kind: "shape", shapeId: "candidate" },
  source: { kind: "runtimeItem", fieldPath: [] },
};
const graph: ShowGraph = {
  nodes: [
    {
      id: "scene",
      name: "Candidates",
      kind: "scene",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [],
    },
  ],
  edges: [],
  actions: [],
  shapes: [
    {
      id: "candidate",
      name: "Candidate",
      fields: [{ id: "name", name: "Name", type: "text", required: true, defaultValue: null }],
    },
  ],
  blocks: [
    {
      id: "button",
      name: "Candidate button",
      variables: [],
      states: [],
      canvas: { id: "button-canvas", kind: "block", root: { id: "button-root", type: "frame" } },
    },
  ],
  cues: [
    {
      id: "selected",
      name: "Selected",
      owner: { kind: "block", blockId: "button" },
      actionIds: [],
    },
    { id: "vote", name: "Vote", owner: { kind: "scene", sceneId: "scene" }, actionIds: [] },
  ],
  eventBindings: [
    {
      id: "tap",
      canvasId: "button-canvas",
      elementId: "button-root",
      cueId: "selected",
      eventKind: "tap",
      position: 0,
      parameterMappings: [],
    },
  ],
  slotEventBindings: [
    {
      id: "relay",
      slotElementId: "slot",
      sourceCueId: "selected",
      targetCueId: "vote",
      parameterMappings: [],
      position: 0,
    },
  ],
};

describe("Passing interaction values", () => {
  it("persists the tapped item through the Block-to-Scene relay and undoes the whole edit", () => {
    const applied = passCueValueCommand(graph, "tap", candidate).apply(graph);
    if (!applied.edits) throw new Error("The value must be persisted.");
    const replayed = applyGraphEdits(
      graph,
      applied.edits.map((edit) => decodeGraphEdit(encodeGraphEdit(edit))),
    );
    const plan = resolveRuntimeEvent(replayed, {
      sceneId: "scene",
      canvasId: "scene-canvas",
      elementId: "button-root",
      eventKind: "tap",
      slotInstancePath: [{ slotElementId: "slot", index: 0 }],
    });
    if (plan.kind !== "planned")
      throw new Error("The Scene must receive the authored Block event.");
    const sourceParameter = replayed.cues?.find((cue) => cue.id === "selected")?.parameters?.[0];
    const targetParameter = plan.cue.parameters?.[0];
    expect(sourceParameter).toMatchObject({ name: "Candidate", type: candidate.type });
    expect(targetParameter).toMatchObject({ name: "Candidate", type: candidate.type });
    expect(replayed.eventBindings?.[0]?.parameterMappings).toEqual([
      { parameterId: sourceParameter?.id, source: candidate.source },
    ]);
    expect(plan.parameters.hops).toEqual([
      [{ sourceParameterId: sourceParameter?.id, targetParameterId: targetParameter?.id }],
    ]);
    const restored = applied.inverse.apply(applied.state).state;
    expect(restored.cues).toEqual(graph.cues);
    expect(restored.eventBindings).toEqual(graph.eventBindings);
    expect(restored.slotEventBindings).toEqual(graph.slotEventBindings);
  });
  it("reuses the existing typed parameter without duplicating the relay", () => {
    const first = passCueValueCommand(graph, "tap", candidate).apply(graph).state;
    const second = passCueValueCommand(first, "tap", candidate).apply(first).state;
    expect(second.cues).toEqual(first.cues);
    expect(second.eventBindings).toEqual(first.eventBindings);
    expect(second.slotEventBindings).toEqual(first.slotEventBindings);
  });
  it("rejects extending a shared receiving Cue when another event cannot supply the new value", () => {
    const shared: ShowGraph = {
      ...graph,
      cues: [
        ...(graph.cues ?? []),
        { id: "other", name: "Other", owner: { kind: "block", blockId: "button" }, actionIds: [] },
      ],
      slotEventBindings: [
        ...(graph.slotEventBindings ?? []),
        {
          id: "other-relay",
          slotElementId: "other-slot",
          sourceCueId: "other",
          targetCueId: "vote",
          parameterMappings: [],
          position: 0,
        },
      ],
    };
    expect(() => passCueValueCommand(shared, "tap", candidate)).toThrow(
      "Another event handling Vote cannot supply Candidate",
    );
    expect(shared.cues?.find((cue) => cue.id === "vote")?.parameters).toBeUndefined();
  });
});
