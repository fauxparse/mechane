import { describe, expect, it } from "vitest";

import type { ShowGraph } from "./graph";
import type { Shape } from "./shapes";
import { materializeRunState, type RunState } from "./structured-values";
import { applyUpdateWrites, planUpdate, resolveUpdateHolder } from "./update-plan";

const candidateShape: Shape = {
  id: "shape_candidate",
  name: "Candidate",
  fields: [
    { id: "f_name", name: "Name", type: "text", required: true, defaultValue: "" },
    { id: "f_votes", name: "Votes", type: "number", required: true, defaultValue: 0 },
  ],
};

const candidateType = { kind: "shape" as const, shapeId: candidateShape.id };
const arrayType = { kind: "array" as const, of: candidateType };

function graphOf(nodes: ShowGraph["nodes"], defaults: ShowGraph["sourceFieldDefaults"] = []) {
  return {
    showId: "show_1",
    state: "published",
    version: 1,
    updatedAt: new Date().toISOString(),
    shapes: [candidateShape],
    sourceFieldDefaults: defaults,
    blocks: [],
    nodes,
    edges: [],
  } as unknown as ShowGraph;
}

function sourceNode(id: string, type: unknown) {
  return {
    id,
    kind: "source" as const,
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    type,
  } as unknown as ShowGraph["nodes"][number];
}

const identities = (state: RunState) => Object.keys(state.structuredValues).sort();

describe("planUpdate", () => {
  describe("identity", () => {
    // The regression this module exists to prevent. The previous write path
    // denormalized the Source, mutated it, then rematerialized — minting a
    // fresh identity for every record it touched and orphaning the originals.
    it("changes no Structured Value identity when adjusting a nested field", () => {
      const graph = graphOf([sourceNode("src_candidates", arrayType)], [
        {
          nodeId: "src_candidates",
          fieldPath: [],
          value: [
            { f_name: "Alice", f_votes: 0 },
            { f_name: "Beatrix", f_votes: 0 },
          ],
        },
      ] as ShowGraph["sourceFieldDefaults"]);

      const state = materializeRunState(graph, {
        src_candidates: [
          { f_name: "Alice", f_votes: 0 },
          { f_name: "Beatrix", f_votes: 0 },
        ],
      } as never);

      const before = identities(state);
      const arrayRef = state.sourceValues.src_candidates;
      if (!arrayRef || typeof arrayRef !== "object" || !("ref" in arrayRef)) {
        throw new Error("expected an array reference");
      }
      const arrayRecord = state.structuredValues[arrayRef.ref];
      if (!arrayRecord || arrayRecord.kind !== "array") throw new Error("expected an array record");
      const aliceRef = arrayRecord.items[0];
      if (!aliceRef || typeof aliceRef !== "object" || !("ref" in aliceRef)) {
        throw new Error("expected a Candidate reference");
      }

      // A second Source aliasing the same Candidate record, so a re-key is
      // observable rather than merely internal.
      const aliased: RunState = {
        sourceValues: { ...state.sourceValues, src_selected: aliceRef },
        structuredValues: state.structuredValues,
      };
      const withAlias = graphOf([
        sourceNode("src_candidates", arrayType),
        sourceNode("src_selected", candidateType),
      ]);

      const plan = planUpdate(withAlias, aliased, "scene_1", {
        id: "action_1",
        cueId: "cue_1",
        kind: "update",
        target: { sourceId: "src_selected", fieldPath: ["f_votes"] },
        operation: { kind: "adjust", operand: { kind: "literal", value: { kind: "number", value: 1 } } },
      });

      if (plan.kind !== "planned") throw new Error(`expected a plan, got ${plan.reason}`);
      const next = applyUpdateWrites(aliased, plan.writes);

      expect(identities(next)).toEqual(before);
      expect(Object.keys(next.structuredValues)).toHaveLength(before.length);
    });

    it("writes through an alias so every holder observes the change", () => {
      const state = materializeRunState(graphOf([sourceNode("src_candidates", arrayType)]), {
        src_candidates: [{ f_name: "Alice", f_votes: 0 }],
      } as never);

      const arrayRef = state.sourceValues.src_candidates as { ref: string };
      const arrayRecord = state.structuredValues[arrayRef.ref];
      if (!arrayRecord || arrayRecord.kind !== "array") throw new Error("expected an array record");
      const aliceRef = arrayRecord.items[0] as { ref: string };

      const aliased: RunState = {
        sourceValues: { ...state.sourceValues, src_selected: aliceRef },
        structuredValues: state.structuredValues,
      };
      const graph = graphOf([
        sourceNode("src_candidates", arrayType),
        sourceNode("src_selected", candidateType),
      ]);

      const plan = planUpdate(graph, aliased, "scene_1", {
        id: "action_1",
        cueId: "cue_1",
        kind: "update",
        target: { sourceId: "src_selected", fieldPath: ["f_votes"] },
        operation: { kind: "adjust", operand: { kind: "literal", value: { kind: "number", value: 1 } } },
      });
      if (plan.kind !== "planned") throw new Error(`expected a plan, got ${plan.reason}`);

      const next = applyUpdateWrites(aliased, plan.writes);
      const candidate = next.structuredValues[aliceRef.ref];
      if (!candidate || candidate.kind !== "shape") throw new Error("expected a Shape record");

      // Read back through the array, which never appeared in the plan.
      const readThroughArray = next.structuredValues[arrayRef.ref];
      if (!readThroughArray || readThroughArray.kind !== "array") throw new Error("expected array");
      const itemRef = readThroughArray.items[0] as { ref: string };

      expect(candidate.fields.f_votes).toBe(1);
      expect(itemRef.ref).toBe(aliceRef.ref);
      expect(plan.writes).toHaveLength(1);
      expect(plan.writes[0]).toMatchObject({ kind: "recordField", fieldId: "f_votes", value: 1 });
    });

    it("mints nothing for a simple set or adjust", () => {
      const graph = graphOf([sourceNode("src_counter", "number")]);
      const state: RunState = { sourceValues: { src_counter: 3 }, structuredValues: {} };

      const plan = planUpdate(graph, state, "scene_1", {
        id: "action_1",
        cueId: "cue_1",
        kind: "update",
        target: { sourceId: "src_counter", fieldPath: [] },
        operation: { kind: "adjust", operand: { kind: "literal", value: { kind: "number", value: 2 } } },
      });
      if (plan.kind !== "planned") throw new Error("expected a plan");

      expect(plan.writes).toEqual([{ kind: "sourceRoot", sourceId: "src_counter", value: 5 }]);
      expect(applyUpdateWrites(state, plan.writes).structuredValues).toEqual({});
    });
  });

  describe("holder resolution", () => {
    const graph = graphOf([sourceNode("src_selected", candidateType)]);
    const state = materializeRunState(graph, {
      src_selected: { f_name: "Alice", f_votes: 0 },
    } as never);

    it("takes the Source root for an empty field path", () => {
      expect(resolveUpdateHolder(state, { sourceId: "src_selected", fieldPath: [] })).toEqual({
        kind: "holder",
        holder: { kind: "sourceRoot", sourceId: "src_selected" },
      });
    });

    it("takes the record containing the final segment, never the one it points at", () => {
      const rootRef = state.sourceValues.src_selected as { ref: string };
      expect(
        resolveUpdateHolder(state, { sourceId: "src_selected", fieldPath: ["f_votes"] }),
      ).toEqual({
        kind: "holder",
        holder: { kind: "recordField", recordId: rootRef.ref, fieldId: "f_votes" },
      });
    });

    it("reports an unknown Field rather than inventing one", () => {
      expect(
        resolveUpdateHolder(state, { sourceId: "src_selected", fieldPath: ["nope"] }),
      ).toMatchObject({ kind: "failed", reason: "update-target-unknown-field" });
    });

    it("distinguishes a dangling reference from an absent value", () => {
      const dangling: RunState = {
        sourceValues: { src_selected: { ref: "xzzzzzzz" } as never },
        structuredValues: {},
      };
      expect(
        resolveUpdateHolder(dangling, { sourceId: "src_selected", fieldPath: ["f_votes"] }),
      ).toMatchObject({ kind: "failed", reason: "update-target-dangling-reference" });

      const absent: RunState = { sourceValues: { src_selected: null }, structuredValues: {} };
      expect(
        resolveUpdateHolder(absent, { sourceId: "src_selected", fieldPath: ["f_votes"] }),
      ).toMatchObject({ kind: "failed", reason: "update-target-absent" });
    });

    it("refuses to address a simple value by field id", () => {
      const simple: RunState = { sourceValues: { src_selected: 7 }, structuredValues: {} };
      expect(
        resolveUpdateHolder(simple, { sourceId: "src_selected", fieldPath: ["f_votes"] }),
      ).toMatchObject({ kind: "failed", reason: "update-target-not-addressable" });
    });
  });

  describe("failures", () => {
    it("names a missing Source", () => {
      const plan = planUpdate(graphOf([]), { sourceValues: {}, structuredValues: {} }, "scene_1", {
        id: "action_1",
        cueId: "cue_1",
        kind: "update",
        target: { sourceId: "src_gone", fieldPath: [] },
        operation: { kind: "reset" },
      });
      expect(plan).toMatchObject({ kind: "failed", reason: "missing-update-source" });
    });

    it("rejects a non-numeric adjustment without mutating anything", () => {
      const graph = graphOf([sourceNode("src_name", "text")]);
      const state: RunState = { sourceValues: { src_name: "Alice" }, structuredValues: {} };
      const plan = planUpdate(graph, state, "scene_1", {
        id: "action_1",
        cueId: "cue_1",
        kind: "update",
        target: { sourceId: "src_name", fieldPath: [] },
        operation: { kind: "adjust", operand: { kind: "literal", value: { kind: "number", value: 1 } } },
      });
      expect(plan).toMatchObject({ kind: "failed", reason: "update-current-value-not-numeric" });
    });

    it("refuses a structured Variable operand rather than minting a detached copy", () => {
      const graph = graphOf([sourceNode("src_selected", candidateType)]);
      const state = materializeRunState(graph, {
        src_selected: { f_name: "Alice", f_votes: 0 },
      } as never);

      const plan = planUpdate(graph, state, "scene_1", {
        id: "action_1",
        cueId: "cue_1",
        kind: "update",
        target: { sourceId: "src_selected", fieldPath: [] },
        operation: { kind: "set", operand: { kind: "variable", variableId: "var_1", fieldPath: [] } },
      });
      expect(plan).toMatchObject({ kind: "failed", reason: "unsupported-structured-operand" });
    });
  });

  describe("changed", () => {
    it("reports a no-op adjustment as unchanged", () => {
      const graph = graphOf([sourceNode("src_counter", "number")]);
      const state: RunState = { sourceValues: { src_counter: 3 }, structuredValues: {} };
      const plan = planUpdate(graph, state, "scene_1", {
        id: "action_1",
        cueId: "cue_1",
        kind: "update",
        target: { sourceId: "src_counter", fieldPath: [] },
        operation: { kind: "adjust", operand: { kind: "literal", value: { kind: "number", value: 0 } } },
      });
      expect(plan).toMatchObject({ kind: "planned", changed: false });
    });
  });
});
