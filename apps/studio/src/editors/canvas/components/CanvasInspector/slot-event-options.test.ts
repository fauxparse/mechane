import { describe, expect, it } from "vitest";
import type {
  Cue,
  CueParameter,
  ParameterMapping,
  SlotEventBinding,
} from "@mechane/domain/interactions";
import type { Shape } from "@mechane/domain/shapes";

import { retargetSlotEventBinding, slotCueParameterMappings } from "./slot-event-options";

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
      {
        id: "field_candidate_votes",
        name: "Votes",
        type: "number",
        required: false,
        defaultValue: null,
      },
    ],
  },
];

function cue(id: string, parameters: readonly CueParameter[] | undefined, name = id): Cue {
  return { id, name, owner: { kind: "scene", sceneId: "scene-voting" }, actionIds: [], parameters };
}

function parameter(id: string, name: string, type: CueParameter["type"]): CueParameter {
  return { id, name, type, position: 0 };
}

const sourceWithCandidate = cue("cue-source", [parameter("candidate", "Candidate", candidateType)]);

describe("slotCueParameterMappings", () => {
  it("pairs parameters that share a name and an exact Type", () => {
    const target = cue("cue-target", [parameter("selectedCandidate", "Candidate", candidateType)]);

    expect(slotCueParameterMappings(sourceWithCandidate, target, shapes)).toEqual([
      { sourceParameterId: "candidate", targetParameterId: "selectedCandidate" },
    ]);
  });

  it("pairs a uniquely compatible source when the names differ", () => {
    const target = cue("cue-target", [parameter("chosen", "Selection", candidateType)]);

    expect(slotCueParameterMappings(sourceWithCandidate, target, shapes)).toEqual([
      { sourceParameterId: "candidate", targetParameterId: "chosen" },
    ]);
  });

  it("refuses a target parameter no source parameter can feed", () => {
    const target = cue("cue-target", [
      parameter("candidate", "Candidate", candidateType),
      parameter("count", "Count", "number"),
    ]);

    expect(slotCueParameterMappings(sourceWithCandidate, target, shapes)).toBeNull();
  });

  it("refuses Types a coercion could bridge, because a relay does not coerce", () => {
    const source = cue("cue-source", [parameter("votes", "Votes", "number")]);
    const target = cue("cue-target", [parameter("label", "Label", "text")]);

    expect(slotCueParameterMappings(source, target, shapes)).toBeNull();
  });

  it("treats an ambiguous pairing as unmappable rather than guessing", () => {
    const source = cue("cue-source", [
      parameter("left", "Left", "text"),
      parameter("right", "Right", "text"),
    ]);
    const target = cue("cue-target", [parameter("label", "Label", "text")]);

    expect(slotCueParameterMappings(source, target, shapes)).toBeNull();
  });

  it("requires array Types to match element-for-element", () => {
    const source = cue("cue-source", [parameter("list", "List", { kind: "array", of: "text" })]);

    expect(
      slotCueParameterMappings(
        source,
        cue("cue-target", [parameter("items", "Items", { kind: "array", of: "text" })]),
        shapes,
      ),
    ).toEqual([{ sourceParameterId: "list", targetParameterId: "items" }]);
    expect(
      slotCueParameterMappings(
        source,
        cue("cue-target", [parameter("items", "Items", { kind: "array", of: "number" })]),
        shapes,
      ),
    ).toBeNull();
  });

  it("maps nothing onto a Cue that takes no parameters", () => {
    expect(
      slotCueParameterMappings(sourceWithCandidate, cue("cue-target", undefined), shapes),
    ).toEqual([]);
  });

  it("refuses a parameterised target when the source offers nothing", () => {
    expect(
      slotCueParameterMappings(cue("cue-source", undefined), sourceWithCandidate, shapes),
    ).toBeNull();
  });

  it("leaves extra source parameters unrelayed rather than failing the link", () => {
    const source = cue("cue-source", [
      parameter("candidate", "Candidate", candidateType),
      parameter("note", "Note", "text"),
    ]);
    const target = cue("cue-target", [parameter("chosen", "Candidate", candidateType)]);

    expect(slotCueParameterMappings(source, target, shapes)).toEqual([
      { sourceParameterId: "candidate", targetParameterId: "chosen" },
    ]);
  });

  it("keeps a still-valid saved mapping, field path included", () => {
    const target = cue("cue-target", [parameter("name", "Name", "text")]);
    const saved: ParameterMapping = {
      sourceParameterId: "candidate",
      targetParameterId: "name",
      sourceFieldPath: ["field_candidate_name"],
    };

    expect(slotCueParameterMappings(sourceWithCandidate, target, shapes, [saved])).toEqual([saved]);
  });

  it("drops a saved mapping whose field path no longer lands on the target Type", () => {
    const target = cue("cue-target", [parameter("votes", "Votes", "number")]);
    const saved: ParameterMapping = {
      sourceParameterId: "candidate",
      targetParameterId: "votes",
      sourceFieldPath: ["field_candidate_name"],
    };

    // The path still resolves, but to a text field a number parameter cannot
    // receive, and nothing else can feed it either.
    expect(slotCueParameterMappings(sourceWithCandidate, target, shapes, [saved])).toBeNull();
  });

  it("recomputes around a saved mapping that names a parameter the target dropped", () => {
    const source = cue("cue-source", [
      parameter("candidate", "Candidate", candidateType),
      parameter("votes", "Votes", "number"),
    ]);
    const target = cue("cue-target", [
      parameter("kept", "Kept", "number"),
      parameter("renamed", "Selection", candidateType),
    ]);
    const saved: ParameterMapping = { sourceParameterId: "votes", targetParameterId: "kept" };

    expect(slotCueParameterMappings(source, target, shapes, [saved])).toEqual([
      { sourceParameterId: "votes", targetParameterId: "kept" },
      { sourceParameterId: "candidate", targetParameterId: "renamed" },
    ]);
  });
});

describe("retargetSlotEventBinding", () => {
  const binding: SlotEventBinding = {
    id: "slot_binding",
    slotElementId: "candidate-list-slot",
    sourceCueId: "cue-source",
    targetCueId: "cue-old",
    position: 2,
    parameterMappings: [{ sourceParameterId: "candidate", targetParameterId: "stale" }],
  };

  it("changes only the destination and its mappings", () => {
    const target = cue("cue-new", [parameter("selectedCandidate", "Candidate", candidateType)]);

    expect(retargetSlotEventBinding(binding, sourceWithCandidate, target, shapes)).toEqual({
      id: "slot_binding",
      slotElementId: "candidate-list-slot",
      sourceCueId: "cue-source",
      targetCueId: "cue-new",
      position: 2,
      parameterMappings: [
        { sourceParameterId: "candidate", targetParameterId: "selectedCandidate" },
      ],
    });
  });

  it("refuses a Cue the source cannot feed", () => {
    const target = cue("cue-new", [parameter("count", "Count", "number")]);

    expect(retargetSlotEventBinding(binding, sourceWithCandidate, target, shapes)).toBeNull();
  });
});
