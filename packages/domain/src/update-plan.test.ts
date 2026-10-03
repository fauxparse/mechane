import { describe, expect, it } from "vitest";

import { isId } from "./id";
import type { ShowGraph } from "./graph";
import type { Shape } from "./shapes";
import {
  assertValidRunState,
  eventStructuredValueId,
  isComputedStructuredValueId,
  isEventStructuredValueId,
  isStructuredValueReference,
  materializeRunState,
  normalizeStructuredValueTemplate,
  resolveSourceValues,
  type RunState,
  type RuntimeValue,
  type StructuredValueReference,
} from "./structured-values";
import {
  applyUpdateWrites,
  classifyUpdateActionScope,
  planUpdate,
  resolveUpdateHolder,
  type UpdatePlan,
} from "./update-plan";

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
const slateShape: Shape = {
  id: "shape_slate",
  name: "Slate",
  fields: [
    { id: "f_title", name: "Title", type: "text", required: true, defaultValue: "" },
    { id: "f_candidates", name: "Candidates", type: arrayType, required: true, defaultValue: [] },
  ],
};
const slateType = { kind: "shape" as const, shapeId: slateShape.id };
const textArrayType = { kind: "array" as const, of: "text" as const };

function graphOf(nodes: ShowGraph["nodes"], defaults: ShowGraph["sourceFieldDefaults"] = []) {
  return {
    showId: "show_1",
    state: "published",
    version: 1,
    updatedAt: new Date().toISOString(),
    shapes: [candidateShape, slateShape],
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

/** Narrows to a reference rather than casting, so the branded id survives. */
function reference(value: RuntimeValue | undefined): StructuredValueReference {
  if (!isStructuredValueReference(value)) throw new Error("expected a Structured Value reference");
  return value;
}

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
      const arrayRef = reference(state.sourceValues.src_candidates);
      const arrayRecord = state.structuredValues[arrayRef.ref];
      if (!arrayRecord || arrayRecord.kind !== "array") throw new Error("expected an array record");
      const aliceRef = reference(arrayRecord.items[0]);

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

      const plan = planUpdate(
        withAlias,
        aliased,
        "scene_1",
        {
          id: "action_1",
          cueId: "cue_1",
          kind: "update",
          target: { sourceId: "src_selected", fieldPath: ["f_votes"] },
          operation: {
            kind: "adjust",
            operand: { kind: "literal", value: { kind: "number", value: 1 } },
          },
        },
        "event_1",
      );

      if (plan.kind !== "planned") throw new Error(`expected a plan, got ${plan.reason}`);
      const next = applyUpdateWrites(aliased, plan.writes);

      expect(identities(next)).toEqual(before);
      expect(Object.keys(next.structuredValues)).toHaveLength(before.length);
    });

    it("writes through an alias so every holder observes the change", () => {
      const state = materializeRunState(graphOf([sourceNode("src_candidates", arrayType)]), {
        src_candidates: [{ f_name: "Alice", f_votes: 0 }],
      } as never);

      const arrayRef = reference(state.sourceValues.src_candidates);
      const arrayRecord = state.structuredValues[arrayRef.ref];
      if (!arrayRecord || arrayRecord.kind !== "array") throw new Error("expected an array record");
      const aliceRef = reference(arrayRecord.items[0]);

      const aliased: RunState = {
        sourceValues: { ...state.sourceValues, src_selected: aliceRef },
        structuredValues: state.structuredValues,
      };
      const graph = graphOf([
        sourceNode("src_candidates", arrayType),
        sourceNode("src_selected", candidateType),
      ]);

      const plan = planUpdate(
        graph,
        aliased,
        "scene_1",
        {
          id: "action_1",
          cueId: "cue_1",
          kind: "update",
          target: { sourceId: "src_selected", fieldPath: ["f_votes"] },
          operation: {
            kind: "adjust",
            operand: { kind: "literal", value: { kind: "number", value: 1 } },
          },
        },
        "event_1",
      );
      if (plan.kind !== "planned") throw new Error(`expected a plan, got ${plan.reason}`);

      const next = applyUpdateWrites(aliased, plan.writes);
      const candidate = next.structuredValues[aliceRef.ref];
      if (!candidate || candidate.kind !== "shape") throw new Error("expected a Shape record");

      // Read back through the array, which never appeared in the plan.
      const readThroughArray = next.structuredValues[arrayRef.ref];
      if (!readThroughArray || readThroughArray.kind !== "array") throw new Error("expected array");
      const itemRef = reference(readThroughArray.items[0]);

      expect(candidate.fields.f_votes).toBe(1);
      expect(itemRef.ref).toBe(aliceRef.ref);
      expect(plan.writes).toHaveLength(1);
      expect(plan.writes[0]).toMatchObject({ kind: "recordField", fieldId: "f_votes", value: 1 });
    });

    it("mints nothing for a simple set or adjust", () => {
      const graph = graphOf([sourceNode("src_counter", "number")]);
      const state: RunState = { sourceValues: { src_counter: 3 }, structuredValues: {} };

      const plan = planUpdate(
        graph,
        state,
        "scene_1",
        {
          id: "action_1",
          cueId: "cue_1",
          kind: "update",
          target: { sourceId: "src_counter", fieldPath: [] },
          operation: {
            kind: "adjust",
            operand: { kind: "literal", value: { kind: "number", value: 2 } },
          },
        },
        "event_1",
      );
      if (plan.kind !== "planned") throw new Error("expected a plan");

      expect(plan.writes).toEqual([{ kind: "sourceRoot", sourceId: "src_counter", value: 5 }]);
      expect(applyUpdateWrites(state, plan.writes).structuredValues).toEqual({});
    });
  });

  describe("Event-derived identity", () => {
    // #884: the Player and the server plan the same Update independently, so
    // every id a plan mints must come from the Event that caused it, not from
    // randomness. Otherwise the authoritative snapshot names the records
    // differently and every Slot keyed on them remounts.
    const slateGraph = graphOf([sourceNode("src_slate", slateType)], [
      {
        nodeId: "src_slate",
        fieldPath: [],
        value: {
          f_title: "Board",
          f_candidates: [
            { f_name: "Alice", f_votes: 1 },
            { f_name: "Beatrix", f_votes: 2 },
          ],
        },
      },
    ] as ShowGraph["sourceFieldDefaults"]);

    const resetSlate = (id: string) => ({
      id,
      cueId: "cue_1",
      kind: "update" as const,
      target: { sourceId: "src_slate", fieldPath: [] },
      operation: { kind: "reset" as const },
    });

    const emptySlate: RunState = { sourceValues: { src_slate: null }, structuredValues: {} };

    const planned = (plan: UpdatePlan) => {
      if (plan.kind !== "planned") throw new Error(`expected a plan, got ${plan.reason}`);
      return plan;
    };

    const recordIds = (plan: Extract<UpdatePlan, { kind: "planned" }>) =>
      plan.writes.flatMap((write) => (write.kind === "record" ? [write.record.id] : []));

    it("derives every node a structured reset mints from Event, Action, and path", () => {
      const plan = planned(
        planUpdate(slateGraph, emptySlate, "scene_1", resetSlate("action_reset"), "event_1"),
      );
      const ids = recordIds(plan);

      // The Slate root, its Candidates array, and one node per item.
      expect(new Set(ids)).toEqual(
        new Set([
          eventStructuredValueId("event_1", "action_reset", []),
          eventStructuredValueId("event_1", "action_reset", ["f_candidates"]),
          eventStructuredValueId("event_1", "action_reset", ["f_candidates", "0"]),
          eventStructuredValueId("event_1", "action_reset", ["f_candidates", "1"]),
        ]),
      );
      // Stored ids: recognized as Event-derived, never as computed or random.
      for (const id of ids) {
        expect(isEventStructuredValueId(id)).toBe(true);
        expect(isComputedStructuredValueId(id)).toBe(false);
        expect(isId("structuredValue", id)).toBe(false);
      }
      // The holder write lands last, pointing at the derived root.
      expect(plan.writes[plan.writes.length - 1]).toMatchObject({
        kind: "sourceRoot",
        sourceId: "src_slate",
        value: { ref: eventStructuredValueId("event_1", "action_reset", []) },
      });
    });

    it("plans identical writes for the same Event, and again after those writes land", () => {
      const first = planned(
        planUpdate(slateGraph, emptySlate, "scene_1", resetSlate("action_reset"), "event_1"),
      );

      // Same Event against the same state: identical plans, not merely
      // equivalent ones.
      expect(
        planUpdate(slateGraph, emptySlate, "scene_1", resetSlate("action_reset"), "event_1"),
      ).toEqual(first);

      // A retry replays its Event id (#628): re-planning after the writes
      // landed derives the same ids, so the replay is an idempotent no-op.
      const applied = applyUpdateWrites(emptySlate, first.writes);
      const retried = planned(
        planUpdate(slateGraph, applied, "scene_1", resetSlate("action_reset"), "event_1"),
      );
      expect(retried.changed).toBe(false);
      expect(retried.writes).toEqual(first.writes);
    });

    it("mints different ids for a different Event or Action, and per path", () => {
      const plan = planned(
        planUpdate(slateGraph, emptySlate, "scene_1", resetSlate("action_reset"), "event_1"),
      );
      const otherEvent = planned(
        planUpdate(slateGraph, emptySlate, "scene_1", resetSlate("action_reset"), "event_2"),
      );
      const otherAction = planned(
        planUpdate(slateGraph, emptySlate, "scene_1", resetSlate("action_reseed"), "event_1"),
      );
      const ids = recordIds(plan);

      // Distinct structural paths within one plan mint distinct ids.
      expect(new Set(ids).size).toBe(ids.length);

      for (const other of [recordIds(otherEvent), recordIds(otherAction)]) {
        expect(other).not.toEqual(ids);
        expect(other.filter((id) => ids.includes(id))).toEqual([]);
      }
    });

    it("derives the one node a structured literal set mints", () => {
      const graph = graphOf([sourceNode("src_lines", textArrayType)]);
      const state: RunState = { sourceValues: { src_lines: null }, structuredValues: {} };
      const rootId = eventStructuredValueId("event_1", "action_set", []);

      const plan = planned(
        planUpdate(
          graph,
          state,
          "scene_1",
          {
            id: "action_set",
            cueId: "cue_1",
            kind: "update",
            target: { sourceId: "src_lines", fieldPath: [] },
            operation: {
              kind: "set",
              operand: {
                kind: "literal",
                value: {
                  kind: "array",
                  value: [
                    { kind: "text", value: "Alpha" },
                    { kind: "text", value: "Beta" },
                  ],
                },
              },
            },
          },
          "event_1",
        ),
      );

      expect(plan.writes).toEqual([
        {
          kind: "record",
          record: { id: rootId, kind: "array", type: textArrayType, items: ["Alpha", "Beta"] },
        },
        { kind: "sourceRoot", sourceId: "src_lines", value: { ref: rootId } },
      ]);
    });

    it("gives nested authored defaults fresh ids when setting a plain structured operand", () => {
      const authoredCandidates = normalizeStructuredValueTemplate(
        [{ f_name: "Alice", f_votes: 1 }],
        arrayType,
        [candidateShape],
      );
      const graph: ShowGraph = {
        ...slateGraph,
        shapes: slateGraph.shapes?.map((shape) =>
          shape.id === slateType.shapeId
            ? {
                ...shape,
                fields: shape.fields.map((field) =>
                  field.id === "f_candidates"
                    ? { ...field, defaultValue: authoredCandidates }
                    : field,
                ),
              }
            : shape,
        ),
      };
      const plan = planned(
        planUpdate(
          graph,
          emptySlate,
          "scene_1",
          {
            id: "action_set",
            cueId: "cue_1",
            kind: "update",
            target: { sourceId: "src_slate", fieldPath: [] },
            operation: {
              kind: "set",
              operand: { kind: "cueParameter", parameterId: "slate", fieldPath: [] },
            },
          },
          "event_1",
          { slate: { f_title: "Fresh" } },
        ),
      );
      expect(recordIds(plan).sort()).toEqual(
        [
          eventStructuredValueId("event_1", "action_set", []),
          eventStructuredValueId("event_1", "action_set", ["f_candidates"]),
          eventStructuredValueId("event_1", "action_set", ["f_candidates", "0"]),
        ].sort(),
      );
      expect(resolveSourceValues(applyUpdateWrites(emptySlate, plan.writes))).toEqual({
        src_slate: { f_title: "Fresh", f_candidates: [{ f_name: "Alice", f_votes: 1 }] },
      });
    });

    it("stores Event-derived records as valid run state that survives transport", () => {
      const plan = planned(
        planUpdate(slateGraph, emptySlate, "scene_1", resetSlate("action_reset"), "event_1"),
      );
      const next = applyUpdateWrites(emptySlate, plan.writes);

      assertValidRunState(next, slateGraph);

      // The plan crosses the realtime seam as JSON; nothing may be lost.
      const transported = JSON.parse(JSON.stringify(plan.writes)) as typeof plan.writes;
      expect(applyUpdateWrites(emptySlate, transported)).toEqual(next);
    });

    it("rebinds to a reference a Cue Parameter carries instead of minting", () => {
      const candidates = materializeRunState(graphOf([sourceNode("src_candidates", arrayType)]), {
        src_candidates: [{ f_name: "Alice", f_votes: 0 }],
      } as never);
      const arrayRef = reference(candidates.sourceValues.src_candidates);
      const arrayRecord = candidates.structuredValues[arrayRef.ref];
      if (!arrayRecord || arrayRecord.kind !== "array") throw new Error("expected an array record");
      const aliceRef = reference(arrayRecord.items[0]);

      const picker = graphOf([
        sourceNode("src_candidates", arrayType),
        sourceNode("src_selected", candidateType),
      ]);
      const state: RunState = {
        ...candidates,
        sourceValues: { ...candidates.sourceValues, src_selected: null },
      };
      const plan = planned(
        planUpdate(
          picker,
          state,
          "scene_1",
          {
            id: "action_pick",
            cueId: "cue_1",
            kind: "update",
            target: { sourceId: "src_selected", fieldPath: [] },
            operation: {
              kind: "set",
              operand: { kind: "cueParameter", parameterId: "param_pick", fieldPath: [] },
            },
          },
          "event_1",
          { param_pick: aliceRef },
        ),
      );
      expect(plan.writes).toEqual([
        { kind: "sourceRoot", sourceId: "src_selected", value: aliceRef },
      ]);
      // The referenced record is untouched: same identity, same content.
      expect(applyUpdateWrites(state, plan.writes).structuredValues).toEqual(
        candidates.structuredValues,
      );
    });

    it("keeps run start on random authored ids", () => {
      const state = materializeRunState(slateGraph, {
        src_slate: {
          f_title: "Board",
          f_candidates: [{ f_name: "Alice", f_votes: 1 }],
        },
      } as never);
      const ids = Object.keys(state.structuredValues);
      for (const id of ids) {
        expect(isId("structuredValue", id)).toBe(true);
        expect(isEventStructuredValueId(id)).toBe(false);
      }
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
      const rootRef = reference(state.sourceValues.src_selected);
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
      const plan = planUpdate(
        graphOf([]),
        { sourceValues: {}, structuredValues: {} },
        "scene_1",
        {
          id: "action_1",
          cueId: "cue_1",
          kind: "update",
          target: { sourceId: "src_gone", fieldPath: [] },
          operation: { kind: "reset" },
        },
        "event_1",
      );
      expect(plan).toMatchObject({ kind: "failed", reason: "missing-update-source" });
    });

    it("rejects a non-numeric adjustment without mutating anything", () => {
      const graph = graphOf([sourceNode("src_name", "text")]);
      const state: RunState = { sourceValues: { src_name: "Alice" }, structuredValues: {} };
      const plan = planUpdate(
        graph,
        state,
        "scene_1",
        {
          id: "action_1",
          cueId: "cue_1",
          kind: "update",
          target: { sourceId: "src_name", fieldPath: [] },
          operation: {
            kind: "adjust",
            operand: { kind: "literal", value: { kind: "number", value: 1 } },
          },
        },
        "event_1",
      );
      expect(plan).toMatchObject({ kind: "failed", reason: "update-current-value-not-numeric" });
    });

    it("refuses a structured Variable operand rather than minting a detached copy", () => {
      const graph = graphOf([sourceNode("src_selected", candidateType)]);
      const state = materializeRunState(graph, {
        src_selected: { f_name: "Alice", f_votes: 0 },
      } as never);

      const plan = planUpdate(
        graph,
        state,
        "scene_1",
        {
          id: "action_1",
          cueId: "cue_1",
          kind: "update",
          target: { sourceId: "src_selected", fieldPath: [] },
          operation: {
            kind: "set",
            operand: { kind: "variable", variableId: "var_1", fieldPath: [] },
          },
        },
        "event_1",
      );
      expect(plan).toMatchObject({ kind: "failed", reason: "unsupported-structured-operand" });
    });
  });

  describe("Update scope classification", () => {
    it("distinguishes local root writes, shared writes, and dependent holders", () => {
      const graph = graphOf([
        sourceNode("shared", "number"),
        {
          ...sourceNode("local", candidateType),
          parentId: "flow_1",
        } as unknown as ShowGraph["nodes"][number],
      ]);
      expect(
        classifyUpdateActionScope(graph, {
          id: "set-local",
          cueId: "cue",
          kind: "update",
          target: { sourceId: "local", fieldPath: [] },
          operation: { kind: "reset" },
        }),
      ).toBe("instance");
      expect(
        classifyUpdateActionScope(graph, {
          id: "adjust-shared",
          cueId: "cue",
          kind: "update",
          target: { sourceId: "shared", fieldPath: [] },
          operation: { kind: "reset" },
        }),
      ).toBe("show");
      expect(
        classifyUpdateActionScope(graph, {
          id: "adjust-through-local",
          cueId: "cue",
          kind: "update",
          target: { sourceId: "local", fieldPath: ["f_votes"] },
          operation: { kind: "reset" },
        }),
      ).toBe("depends");
    });
  });

  describe("changed", () => {
    it("reports a no-op adjustment as unchanged", () => {
      const graph = graphOf([sourceNode("src_counter", "number")]);
      const state: RunState = { sourceValues: { src_counter: 3 }, structuredValues: {} };
      const plan = planUpdate(
        graph,
        state,
        "scene_1",
        {
          id: "action_1",
          cueId: "cue_1",
          kind: "update",
          target: { sourceId: "src_counter", fieldPath: [] },
          operation: {
            kind: "adjust",
            operand: { kind: "literal", value: { kind: "number", value: 0 } },
          },
        },
        "event_1",
      );
      expect(plan).toMatchObject({ kind: "planned", changed: false });
    });
  });
});
