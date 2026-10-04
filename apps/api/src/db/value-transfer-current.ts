// Shared machinery for live Current value reads and writes (#899, #900).
//
// Everything here serves one contract from #872: a Current target is the exact
// active Run's stored value for one Source/Field — never a Default, never an
// inferred Instance — and a live write is compared against the selected value
// and its reference bindings, not a global sequence that changes for
// unrelated events.
//
// Show-level and Shared Instance targets share these helpers and differ only
// in which rows hold the state (`run_source_values`/`run_structured_values`
// versus the `run_device_states` JSON columns) and which locks their
// transaction takes. Both take the Run row lock in the order Player Events
// take it, so a clipboard write and an Event serialize rather than deadlock.
import { resolveGraph } from "@mechane/domain/scene-variable-values";
import type { ShowGraph, SourceNode } from "@mechane/domain/graph";
import {
  composeInstanceView,
  resolveRuntimeValue,
  type RunState,
  type RuntimeValue,
  type StructuredValueRecord,
  type StructuredValueReference,
  type StructuredValues,
} from "@mechane/domain/structured-values";
import {
  readUpdateHolder,
  resolveUpdateHolder,
  type UpdateHolder,
  type UpdateFailureReason,
} from "@mechane/domain/update-plan";
import { canonicalValue } from "@mechane/domain/value-transfer";
import { and, desc, eq } from "drizzle-orm";

import { db } from "./client";
import { readRunState } from "./runs";
import { runDeviceStates, runs, runSourceValues, runStructuredValues } from "./schema";
import { readOrCreateTransformerSeeds } from "./transformer-seeds";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = Tx | typeof db;
type RunRow = typeof runs.$inferSelect;

/** The refusal reasons a Current read/prepare/commit can produce. */
export type CurrentRefusal =
  | "incoming-wiring"
  | "no-active-run"
  | "stale-version"
  | "stale-value"
  | "cross-scope-target"
  | "missing-instance-state"
  | "unaddressable-target"
  | "unavailable-current-value"
  | "evaluation-failure"
  | "device-not-eligible";

export interface CurrentRefusalDetail {
  readonly code: CurrentRefusal;
  readonly message: string;
  readonly path: readonly string[];
}

/**
 * Locks the Show's active Run row, in the order Player Events lock it
 * (`dispatchPlayerEvent`), so clipboard commits and Event dispatch serialize
 * on the same row rather than racing.
 */
export async function lockActiveRun(tx: Tx, showId: string): Promise<RunRow | null> {
  const [row] = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1)
    .for("update");
  return row ?? null;
}

/** Reads the active Run row without locking, for read-only paths. */
export async function readActiveRunRow(
  showId: string,
  executor: Executor = db,
): Promise<RunRow | null> {
  const [row] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1);
  return row ?? null;
}

/** The stored state a Current target addresses, in its own storage scope. */
export interface CurrentStateSnapshot {
  readonly runId: string;
  /** Show scope: the Run's rows. Instance scope: the Device Instance's columns. */
  readonly state: RunState;
  /**
   * The view wiring is evaluated against. Show scope: the Run state. Instance
   * scope: the composed Show+Instance view, so a Flow-local Source wired from
   * a Show-level producer evaluates exactly as the Player renders it.
   */
  readonly evaluation: RunState;
}

export async function readShowCurrentState(
  runId: string,
  executor: Executor = db,
): Promise<CurrentStateSnapshot> {
  const state = await readRunState(runId, executor);
  return { runId, state, evaluation: state };
}

export async function readInstanceCurrentState(
  runId: string,
  deviceId: string,
  showState: RunState,
  flowId: string,
  publishedVersion: number,
  executor: Executor,
): Promise<CurrentStateSnapshot | null> {
  const [row] = await executor
    .select()
    .from(runDeviceStates)
    .where(
      and(
        eq(runDeviceStates.runId, runId),
        eq(runDeviceStates.deviceId, deviceId),
        eq(runDeviceStates.flowId, flowId),
        eq(runDeviceStates.publishedGraphVersion, publishedVersion),
      ),
    );
  if (!row) return null;
  const instance: RunState = {
    sourceValues: row.instanceSourceValues as RunState["sourceValues"],
    structuredValues: row.instanceStructuredValues as RunState["structuredValues"],
  };
  return {
    runId,
    state: instance,
    evaluation: composeInstanceView(showState, instance),
  };
}

/** Whether a Source has any incoming wiring edge — copy-only in both planes. */
export function hasIncomingWiring(graph: ShowGraph, sourceId: string): boolean {
  return graph.edges.some((edge) => edge.kind === "wiring" && edge.targetId === sourceId);
}

export function findSource(graph: ShowGraph, sourceId: string): SourceNode | null {
  const node = graph.nodes.find((node) => node.id === sourceId);
  return node?.kind === "source" ? node : null;
}

/**
 * The configured Shared Device/Flow relationship a Current Instance target
 * names (#900): the Device must exist, be Shared, and be driven by exactly the
 * named Flow. A per-connection Device or a stale Flow relationship is not an
 * addressable Instance.
 */
export function sharedInstanceEligibility(
  graph: ShowGraph,
  deviceId: string,
  flowId: string,
): { deviceName: string } | null {
  const device = graph.nodes.find((node) => node.id === deviceId);
  if (device?.kind !== "device" || device.perConnection) return null;
  const driven = graph.edges.some(
    (edge) => edge.kind === "device" && edge.sourceId === flowId && edge.targetId === deviceId,
  );
  if (!driven) return null;
  return { deviceName: device.name };
}

/**
 * Resolves the holder a Field path writes, mapping the domain's Update
 * resolution reasons onto the clipboard's addressability refusals. Field
 * replacement writes the existing containing holder (#872), so the holder is
 * resolved rather than the path's expanded value.
 */
export function resolveCurrentHolder(
  state: RunState,
  sourceId: string,
  fieldPath: readonly string[],
): { kind: "holder"; holder: UpdateHolder } | { kind: "failed"; detail: CurrentRefusalDetail } {
  if (fieldPath.length === 0) {
    return { kind: "holder", holder: { kind: "sourceRoot", sourceId } };
  }
  const resolution = resolveUpdateHolder(state, { sourceId, fieldPath });
  if (resolution.kind === "failed") {
    return { kind: "failed", detail: { ...holderFailure(resolution.reason), path: fieldPath } };
  }
  return { kind: "holder", holder: resolution.holder };
}

function holderFailure(reason: UpdateFailureReason): CurrentRefusalDetail {
  switch (reason) {
    case "update-target-absent":
    case "update-target-dangling-reference":
      return {
        code: "unaddressable-target",
        message:
          "An ancestor of that Field has no Current value, so the Field cannot be addressed.",
        path: [],
      };
    case "update-target-not-addressable":
      return {
        code: "unaddressable-target",
        message:
          "That path crosses a value that is not a Shape record, so the Field cannot be addressed.",
        path: [],
      };
    default:
      return {
        code: "unaddressable-target",
        message: "That Field is not part of the selected value's Current contract.",
        path: [],
      };
  }
}

/** The value a holder currently carries, or `undefined` when it carries none. */
export function readHolderValue(state: RunState, holder: UpdateHolder): RuntimeValue | undefined {
  return readUpdateHolder(state, holder);
}

/**
 * Collects the records reachable from a value, without following anything
 * else. This is the closure a live comparison covers — records another
 * Source holds, or sibling Fields in the same record, are deliberately not
 * included, which is what lets an unrelated sibling change pass (#872).
 */
export function collectValueClosure(
  value: RuntimeValue | undefined,
  records: Readonly<StructuredValues>,
): StructuredValues {
  const closure: StructuredValues = {};
  if (value === undefined) return closure;
  const stack: RuntimeValue[] = [value];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || current === undefined) continue;
    if (!isReference(current)) continue;
    const id = current.ref;
    if (seen.has(id)) continue;
    seen.add(id);
    const record = records[id];
    if (!record) continue;
    closure[id] = record;
    if (record.kind === "shape") {
      for (const child of Object.values(record.fields)) stack.push(child);
    } else {
      for (const item of record.items) stack.push(item);
    }
  }
  return closure;
}

function isReference(value: RuntimeValue): value is StructuredValueReference {
  return typeof value === "object" && value !== null && "ref" in value;
}

/** The frozen facts a live confirmation compared against, at commit time. */
export interface CurrentComparison {
  /** Which slot the write addresses, and what it was reached through. */
  readonly binding:
    | { readonly kind: "sourceRoot"; readonly sourceId: string; readonly rootValue: string }
    | {
        readonly kind: "recordField";
        readonly sourceId: string;
        readonly recordId: Extract<UpdateHolder, { kind: "recordField" }>["recordId"];
        readonly fieldId: string;
        readonly rootValue: string;
        readonly pathBindings: readonly string[];
      };
  /** Canonical selected value — the whole value for a root, the Field for a Field. */
  readonly selected: string;
  /** Canonical reachable records, keyed by record id. */
  readonly closure: Readonly<Record<string, string>>;
}

/**
 * Builds the comparison snapshot for a confirmation: the selected value, its
 * reachable record closure, and the reference bindings that identify the
 * holder. Sibling records and unrelated Sources are not part of it.
 */
export function buildCurrentComparison(
  state: RunState,
  sourceId: string,
  fieldPath: readonly string[],
):
  | { kind: "comparison"; comparison: CurrentComparison }
  | { kind: "failed"; detail: CurrentRefusalDetail } {
  const holder = resolveCurrentHolder(state, sourceId, fieldPath);
  if (holder.kind === "failed") return holder;
  const rootValue = state.sourceValues[sourceId];
  if (holder.holder.kind === "sourceRoot") {
    if (rootValue === undefined) {
      return {
        kind: "failed",
        detail: {
          code: "unavailable-current-value",
          message: "That Source has no Current value in the selected scope.",
          path: [],
        },
      };
    }
    return {
      kind: "comparison",
      comparison: {
        binding: {
          kind: "sourceRoot",
          sourceId,
          rootValue: canonicalValue(rootValue),
        },
        selected: canonicalValue(rootValue),
        closure: canonicalClosure(collectValueClosure(rootValue, state.structuredValues)),
      },
    };
  }
  if (rootValue === undefined) {
    return {
      kind: "failed",
      detail: {
        code: "unavailable-current-value",
        message: "That Source has no Current value in the selected scope.",
        path: fieldPath,
      },
    };
  }
  const selected = readHolderValue(state, holder.holder);
  const pathBindings: string[] = [];
  let bindingValue = rootValue;
  for (let index = 0; index < fieldPath.length - 1; index += 1) {
    if (!isReference(bindingValue))
      return { kind: "failed", detail: holderFailure("update-target-absent") };
    const ancestor = state.structuredValues[bindingValue.ref];
    const next = ancestor?.kind === "shape" ? ancestor.fields[fieldPath[index]!] : undefined;
    if (next === undefined)
      return {
        kind: "failed",
        detail: {
          code: "unaddressable-target",
          message: "The selected Field's holder binding is unavailable.",
          path: fieldPath,
        },
      };
    pathBindings.push(canonicalValue(next));
    bindingValue = next;
  }
  if (selected === undefined) {
    return {
      kind: "failed",
      detail: {
        code: "unaddressable-target",
        message: "That Field has no Current value to replace.",
        path: fieldPath,
      },
    };
  }
  return {
    kind: "comparison",
    comparison: {
      binding: {
        kind: "recordField",
        sourceId,
        recordId: holder.holder.recordId,
        fieldId: holder.holder.fieldId,
        rootValue: canonicalValue(rootValue),
        pathBindings,
      },
      selected: canonicalValue(selected),
      closure: canonicalClosure(collectValueClosure(selected, state.structuredValues)),
    },
  };
}

function canonicalClosure(records: StructuredValues): Record<string, string> {
  return Object.fromEntries(
    Object.entries(records).map(([id, record]) => [id, canonicalValue(record)]),
  );
}

/**
 * Compares the current state against a frozen comparison snapshot. A change to
 * the selected value, its reachable closure, or the bindings that identify the
 * holder rejects; a sibling-only change leaves every one of those untouched
 * and passes. The Show's `stateSequence` is deliberately not consulted.
 */
export function currentComparisonMatches(
  stored: CurrentComparison,
  state: RunState,
  sourceId: string,
  fieldPath: readonly string[],
): boolean {
  const next = buildCurrentComparison(state, sourceId, fieldPath);
  if (next.kind === "failed") return false;
  return canonicalValue(next.comparison) === canonicalValue(stored);
}

/** One prepared live write: the fresh clone plus the holder slot it lands in. */
export interface CurrentWrite {
  readonly holder: UpdateHolder;
  readonly value: RuntimeValue;
  readonly records: readonly StructuredValueRecord[];
}

/**
 * Applies a live write to Run rows, using the same row-level upserts Player
 * Event Updates use: the holder slot changes, the fresh clone's records are
 * inserted, and nothing else is rewritten.
 */
export async function applyCurrentWriteToRunRows(
  tx: Tx,
  runId: string,
  write: CurrentWrite,
): Promise<void> {
  for (const record of write.records) {
    await tx.insert(runStructuredValues).values({
      runId,
      structuredValueId: record.id,
      kind: record.kind,
      type: record.type,
      payload: record.kind === "array" ? record.items : record.fields,
    });
  }
  if (write.holder.kind === "sourceRoot") {
    await tx
      .insert(runSourceValues)
      .values({ runId, sourceId: write.holder.sourceId, value: write.value })
      .onConflictDoUpdate({
        target: [runSourceValues.runId, runSourceValues.sourceId],
        set: { value: write.value },
      });
    return;
  }
  const [row] = await tx
    .select()
    .from(runStructuredValues)
    .where(
      and(
        eq(runStructuredValues.runId, runId),
        eq(runStructuredValues.structuredValueId, write.holder.recordId),
      ),
    );
  // A Field holder is always a Shape record (resolveUpdateHolder), so the
  // containing holder is rewritten with the one Field rebound to the fresh
  // clone — every alias to the holder observes it, and nothing else moves.
  if (
    !row ||
    row.kind !== "shape" ||
    typeof row.payload !== "object" ||
    row.payload === null ||
    Array.isArray(row.payload)
  ) {
    throw new Error("The locked Current holder is unavailable.");
  }
  await tx
    .update(runStructuredValues)
    .set({
      payload: { ...row.payload, [write.holder.fieldId]: write.value },
    })
    .where(
      and(
        eq(runStructuredValues.runId, runId),
        eq(runStructuredValues.structuredValueId, write.holder.recordId),
      ),
    );
}

/**
 * Applies a live write to a Shared Device Instance's JSON columns. The row is
 * already locked by the caller; the in-memory state is the holder/clone
 * result, and only that Instance's columns are written (#900).
 */
export async function applyCurrentWriteToInstance(
  tx: Tx,
  runId: string,
  deviceId: string,
  next: RunState,
): Promise<void> {
  await tx
    .update(runDeviceStates)
    .set({
      instanceSourceValues: next.sourceValues,
      instanceStructuredValues: next.structuredValues,
      updatedAt: new Date(),
    })
    .where(and(eq(runDeviceStates.runId, runId), eq(runDeviceStates.deviceId, deviceId)));
}

/**
 * Applies a prepared write to an in-memory state, mirroring the row writes:
 * fresh clone records land first, then the holder slot is written. The result
 * is what an Instance column update persists.
 */
export function applyCurrentWriteToState(state: RunState, write: CurrentWrite): RunState {
  const structuredValues: StructuredValues = { ...state.structuredValues };
  for (const record of write.records) {
    if (Object.hasOwn(structuredValues, record.id))
      throw new Error("A fresh Current record identity already exists.");
    structuredValues[record.id] = record;
  }
  const sourceValues =
    write.holder.kind === "sourceRoot" ? { ...state.sourceValues } : state.sourceValues;
  if (write.holder.kind === "sourceRoot") {
    sourceValues[write.holder.sourceId] = write.value;
    return { sourceValues, structuredValues };
  }
  const holder = structuredValues[write.holder.recordId];
  if (holder?.kind !== "shape") throw new Error("The locked Current holder is unavailable.");
  structuredValues[write.holder.recordId] = {
    ...holder,
    fields: { ...holder.fields, [write.holder.fieldId]: write.value },
  };
  return { sourceValues, structuredValues };
}

/**
 * Reads an incoming-wired Source's evaluated Current result using the same
 * resolution a Player renders from. Evaluation failures — a reached
 * Transformer whose Formula failed, or a reached edge that carried nothing —
 * refuse the read; they are never converted into Typed Absence or Defaults.
 */
export async function evaluatedSourceValue(
  snapshot: CurrentStateSnapshot,
  graph: ShowGraph,
  sourceId: string,
  deviceId: string | null,
  executor: Executor,
): Promise<
  | { kind: "value"; value: unknown; structuredValues: StructuredValues }
  | { kind: "failed"; detail: CurrentRefusalDetail }
> {
  const shuffleSeeds = await readOrCreateTransformerSeeds(
    snapshot.runId,
    deviceId ?? "",
    graph,
    deviceId !== null,
    executor,
  );
  const resolution = resolveGraph(graph, snapshot.evaluation.sourceValues, {
    structuredValues: snapshot.evaluation.structuredValues,
    shuffleSeeds,
  });
  const reachedEdges = reachableWiringEdges(graph, sourceId);
  const failedTransformer = resolution.formulaDiagnostics.find(
    (diagnostic) =>
      diagnostic.transformerId && reachedEdges.producers.has(diagnostic.transformerId),
  );
  if (failedTransformer) {
    return {
      kind: "failed",
      detail: {
        code: "evaluation-failure",
        message: "That Source's Current value depends on a Transformer that failed to evaluate.",
        path: [],
      },
    };
  }
  const failedEdge = resolution.diagnostics.find((diagnostic) =>
    reachedEdges.edgeIds.has(diagnostic.edgeId),
  );
  if (failedEdge) {
    return {
      kind: "failed",
      detail: {
        code: "evaluation-failure",
        message: "That Source's Current value depends on a connection that carried nothing.",
        path: [],
      },
    };
  }
  const value = resolution.resolveValue(sourceId);
  if (value === undefined) {
    return {
      kind: "failed",
      detail: {
        code: "unavailable-current-value",
        message: "That Source has no evaluated Current result to copy.",
        path: [],
      },
    };
  }
  return {
    kind: "value",
    value,
    structuredValues: {
      ...snapshot.evaluation.structuredValues,
      ...resolution.computedStructuredValues,
    },
  };
}

/** The wiring edges and producer nodes a Source's value depends on. */
function reachableWiringEdges(
  graph: ShowGraph,
  sourceId: string,
): { edgeIds: Set<string>; producers: Set<string> } {
  const edgeIds = new Set<string>();
  const producers = new Set<string>();
  const frontier = [sourceId];
  const seen = new Set<string>([sourceId]);
  while (frontier.length > 0) {
    const nodeId = frontier.pop()!;
    for (const edge of graph.edges) {
      if (edge.kind !== "wiring" || edge.targetId !== nodeId) continue;
      edgeIds.add(edge.id);
      producers.add(edge.sourceId);
      if (!seen.has(edge.sourceId)) {
        seen.add(edge.sourceId);
        frontier.push(edge.sourceId);
      }
    }
  }
  return { edgeIds, producers };
}

/**
 * Reads the selected Current value for an unwired Source, preserving the
 * references a projection needs, and failing rather than defaulting when the
 * stored value is missing.
 */
export function storedSelectedValue(
  state: RunState,
  sourceId: string,
  fieldPath: readonly string[],
): { kind: "value"; value: RuntimeValue } | { kind: "failed"; detail: CurrentRefusalDetail } {
  const root = state.sourceValues[sourceId];
  if (root === undefined) {
    return {
      kind: "failed",
      detail: {
        code: "unavailable-current-value",
        message: "That Source has no Current value in the selected scope.",
        path: fieldPath,
      },
    };
  }
  if (fieldPath.length === 0) return { kind: "value", value: root };
  const holder = resolveCurrentHolder(state, sourceId, fieldPath);
  if (holder.kind === "failed") return holder;
  const selected = readHolderValue(state, holder.holder);
  if (selected === undefined)
    return {
      kind: "failed",
      detail: {
        code: "unavailable-current-value",
        message: "That Field has no Current value to copy.",
        path: fieldPath,
      },
    };
  return { kind: "value", value: selected };
}

/** Expands a RuntimeValue closure for display, the way a Player renders it. */
export function expandedValue(value: RuntimeValue, records: Readonly<StructuredValues>): unknown {
  return resolveRuntimeValue(value, records);
}
