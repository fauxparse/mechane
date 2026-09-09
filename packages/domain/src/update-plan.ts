// How an Update Action reaches the one slot it changes (#624, #635).
//
// The rule the whole module exists to enforce: **every write mutates exactly
// one holder** — the record containing the final path segment, or the Source
// root. Nothing is denormalized, no template is normalized, no record is
// rematerialized, and no Structured Value identity is minted except by an
// operation whose definition says it mints one.
//
// That last clause is the regression this replaces. The previous write path
// resolved a Source to a plain value, mutated it, then normalized and
// materialized the result — and because a denormalized value carries no
// identities, normalization minted fresh ones for the entire subtree. Every
// Update re-keyed everything it touched, breaking every alias to those records
// and orphaning the originals.
//
// Choosing the *containing* record as the holder is what collapses #534's two
// rules into one. A simple slot receives a simple value, so every alias to the
// containing record observes the change; a structured slot receives a
// reference, so that one field rebinds and the previously-referenced record is
// untouched. Write-through and rebind are the same operation seen from either
// side of the slot.
import type { Action } from "./interactions";
import type { StructuredValueId } from "./id";
import type { ShowGraph } from "./graph";
import { typeAtPath, valueAtPath } from "./property-values";
import { defaultSourceValues } from "./source-defaults";
import { sceneVariableValues } from "./scene-variable-values";
import type { ShapeValue, Type } from "./shapes";
import {
  isStructuredValueReference,
  materializeStructuredValue,
  normalizeStructuredValueTemplate,
  resolveSourceValues,
  type RunState,
  type RuntimeValue,
  type StructuredValueRecord,
} from "./structured-values";

type UpdateAction = Extract<Action, { kind: "update" }>;
type UpdateOperand = Extract<UpdateAction["operation"], { kind: "set" }>["operand"];

/** The single mutable slot an Update target resolves to. */
export type UpdateHolder =
  | { readonly kind: "sourceRoot"; readonly sourceId: string }
  | {
      readonly kind: "recordField";
      readonly recordId: StructuredValueId;
      readonly fieldId: string;
    };

/**
 * Why a plan could not be produced.
 *
 * The five original reasons keep their exact spellings: they reach operators
 * through the Run log and the Event ledger, and renaming them would silently
 * orphan existing rows. The target-resolution reasons are new because target
 * resolution is new — the old path could not fail here, it simply produced
 * nonsense.
 */
export type UpdateFailureReason =
  | "missing-update-source"
  | "missing-update-operand"
  | "missing-update-default"
  | "update-current-value-not-numeric"
  | "update-operand-not-numeric"
  | "update-target-absent"
  | "update-target-not-addressable"
  | "update-target-dangling-reference"
  | "update-target-unknown-field"
  | "unsupported-structured-operand";

/** One targeted change. Each side of the seam applies these to its own store. */
export type UpdateWrite =
  | { readonly kind: "record"; readonly record: StructuredValueRecord }
  | {
      readonly kind: "recordField";
      readonly recordId: StructuredValueId;
      readonly fieldId: string;
      readonly value: RuntimeValue;
    }
  | { readonly kind: "sourceRoot"; readonly sourceId: string; readonly value: RuntimeValue };

export type UpdatePlan =
  | { readonly kind: "planned"; readonly writes: readonly UpdateWrite[]; readonly changed: boolean }
  | { readonly kind: "failed"; readonly reason: UpdateFailureReason };

type HolderResolution =
  | { readonly kind: "holder"; readonly holder: UpdateHolder }
  | { readonly kind: "failed"; readonly reason: UpdateFailureReason };

const failed = (reason: UpdateFailureReason): { kind: "failed"; reason: UpdateFailureReason } => ({
  kind: "failed",
  reason,
});

/**
 * Walks a target's field path to the slot it addresses.
 *
 * Every segment but the last is *followed*: the value there must be a
 * reference, and it is dereferenced to the record that carries the next
 * segment. The last segment is never followed — the record reached, paired
 * with that field id, is the holder.
 */
export function resolveUpdateHolder(
  state: RunState,
  target: { readonly sourceId: string; readonly fieldPath: readonly string[] },
): HolderResolution {
  if (target.fieldPath.length === 0) {
    return { kind: "holder", holder: { kind: "sourceRoot", sourceId: target.sourceId } };
  }

  let value: RuntimeValue | undefined = state.sourceValues[target.sourceId];
  for (const [index, fieldId] of target.fieldPath.entries()) {
    if (value === undefined || value === null) return failed("update-target-absent");
    if (!isStructuredValueReference(value)) return failed("update-target-not-addressable");
    const record: StructuredValueRecord | undefined = state.structuredValues[value.ref];
    if (!record) return failed("update-target-dangling-reference");
    // Arrays are addressed whole, never by field id — item-specific target
    // paths remain outside this destination (#531).
    if (record.kind !== "shape") return failed("update-target-not-addressable");
    if (!Object.prototype.hasOwnProperty.call(record.fields, fieldId)) {
      return failed("update-target-unknown-field");
    }
    if (index === target.fieldPath.length - 1) {
      return { kind: "holder", holder: { kind: "recordField", recordId: record.id, fieldId } };
    }
    value = record.fields[fieldId];
  }

  /* c8 ignore next */
  return failed("update-target-unknown-field");
}

export type UpdateScope = "show" | "instance" | "depends";

/** Static scope classification used by Studio and dispatch lock selection. */
export function classifyUpdateActionScope(
  graph: ShowGraph,
  action: UpdateAction,
): UpdateScope {
  const source = graph.nodes.find((node) => node.id === action.target.sourceId);
  if (!source || source.kind !== "source" || source.parentId === null) return "show";
  return action.target.fieldPath.length === 0 ? "instance" : "depends";
}

/** Resolves the holder's actual scope in a composed Show/Instance state. */
export function resolveUpdateHolderScope(
  graph: ShowGraph,
  state: RunState,
  action: UpdateAction,
): Exclude<UpdateScope, "depends"> | null {
  const source = graph.nodes.find((node) => node.id === action.target.sourceId);
  const resolution = resolveUpdateHolder(state, action.target);
  if (!source || source.kind !== "source" || resolution.kind === "failed") return null;
  if (resolution.holder.kind === "sourceRoot") {
    return source.parentId === null ? "show" : "instance";
  }
  const showRecordIds = new Set<string>();
  const visit = (value: RuntimeValue): void => {
    if (!isStructuredValueReference(value) || showRecordIds.has(value.ref)) return;
    showRecordIds.add(value.ref);
    const record = state.structuredValues[value.ref];
    if (!record) return;
    const values = record.kind === "array" ? record.items : Object.values(record.fields);
    values.forEach(visit);
  };
  for (const candidate of graph.nodes) {
    if (candidate.kind === "source" && candidate.parentId === null) {
      visit(state.sourceValues[candidate.id]!);
    }
  }
  return showRecordIds.has(resolution.holder.recordId) ? "show" : "instance";
}

/** The value a holder currently carries, or `undefined` when it carries none. */
export function readUpdateHolder(state: RunState, holder: UpdateHolder): RuntimeValue | undefined {
  if (holder.kind === "sourceRoot") return state.sourceValues[holder.sourceId];
  const record = state.structuredValues[holder.recordId];
  if (!record || record.kind !== "shape") return undefined;
  return record.fields[holder.fieldId];
}

function rawShapeValue(value: ShapeValue): unknown {
  return value.kind === "array" ? value.value.map(rawShapeValue) : value.value;
}

function resolveOperandValue(
  graph: ShowGraph,
  sceneId: string,
  sourceValues: Readonly<Record<string, unknown>>,
  operand: UpdateOperand,
  cueParameterValues: Readonly<Record<string, unknown>>,
): unknown {
  if (operand.kind === "literal") return rawShapeValue(operand.value);
  if (operand.kind === "cueParameter") {
    return valueAtPath(cueParameterValues[operand.parameterId], operand.fieldPath);
  }
  let value = valueAtPath(sceneVariableValues(graph, sceneId, sourceValues), [
    operand.variableId,
    ...(operand.fieldPath ?? []),
  ]);
  if (operand.fieldMapping && value !== null && typeof value === "object" && !Array.isArray(value)) {
    value = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).flatMap(([fieldId, fieldValue]) => {
        const targetFieldId = operand.fieldMapping?.[fieldId];
        return targetFieldId ? [[targetFieldId, fieldValue]] : [];
      }),
    );
  }
  return value;
}

function isStructuredType(type: Type | null | undefined): boolean {
  return typeof type === "object" && type !== null;
}

/**
 * Materializes a value that is genuinely allowed to mint identities: a reset's
 * effective default, or a structured literal, which #540 rematerializes on
 * every evaluation.
 */
function materializeFresh(
  value: unknown,
  type: Type,
  graph: ShowGraph,
): { value: RuntimeValue; records: readonly StructuredValueRecord[] } {
  const template = normalizeStructuredValueTemplate(value, type, graph.shapes ?? []);
  const materialized = materializeStructuredValue(template, type, graph.shapes ?? []);
  return { value: materialized.value, records: Object.values(materialized.structuredValues) };
}

function sameRuntimeValue(left: RuntimeValue | undefined, right: RuntimeValue): boolean {
  if (isStructuredValueReference(left) && isStructuredValueReference(right)) {
    return left.ref === right.ref;
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Turns one Update Action into the targeted writes that carry it out.
 *
 * Pure, and isomorphic by construction: it reads state and never writes it, so
 * the server can apply the result as row operations while a Player applies the
 * same result to its own store.
 */
export function planUpdate(
  graph: ShowGraph,
  state: RunState,
  sceneId: string,
  action: UpdateAction,
  cueParameterValues: Readonly<Record<string, unknown>> = {},
): UpdatePlan {
  const source = graph.nodes.find((node) => node.id === action.target.sourceId);
  if (!source || source.kind !== "source") return failed("missing-update-source");

  const resolution = resolveUpdateHolder(state, action.target);
  if (resolution.kind === "failed") return resolution;
  const { holder } = resolution;

  const slotType = typeAtPath(source.type, action.target.fieldPath, graph.shapes ?? []);
  if (!slotType) return failed("update-target-unknown-field");

  const currentValue = readUpdateHolder(state, holder);
  let nextValue: RuntimeValue;
  let records: readonly StructuredValueRecord[] = [];

  if (action.operation.kind === "reset") {
    const defaultValue = valueAtPath(
      defaultSourceValues(graph)[action.target.sourceId],
      action.target.fieldPath,
    );
    if (defaultValue === undefined) return failed("missing-update-default");
    if (isStructuredType(slotType)) {
      const fresh = materializeFresh(defaultValue, slotType, graph);
      nextValue = fresh.value;
      records = fresh.records;
    } else {
      nextValue = defaultValue as RuntimeValue;
    }
  } else {
    // Decided before any work: assigning a structured slot must rebind to the
    // reference the operand already has, and reference-preserving operand
    // resolution arrives with the routing slice. A literal is exempt because
    // #540 rematerializes one on every evaluation. Failing cleanly beats the
    // old behaviour of minting a detached copy.
    if (
      action.operation.kind === "set" &&
      isStructuredType(slotType) &&
      action.operation.operand.kind === "variable"
    ) {
      return failed("unsupported-structured-operand");
    }

    // Reads may denormalize; only writes may not. `sceneVariableValues` needs a
    // plain view of live data, and producing one changes no identities.
    const operand = resolveOperandValue(
      graph,
      sceneId,
      resolveSourceValues(state),
      action.operation.operand,
      cueParameterValues,
    );
    if (operand === undefined) return failed("missing-update-operand");

    if (action.operation.kind === "adjust") {
      if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
        return failed("update-current-value-not-numeric");
      }
      if (typeof operand !== "number" || !Number.isFinite(operand)) {
        return failed("update-operand-not-numeric");
      }
      nextValue = currentValue + operand;
    } else if (isStructuredType(slotType)) {
      if (
        action.operation.operand.kind === "cueParameter" &&
        isStructuredValueReference(operand)
      ) {
        nextValue = operand;
      } else {
        const fresh = materializeFresh(operand, slotType, graph);
        nextValue = fresh.value;
        records = fresh.records;
      }
    } else {
      nextValue = operand as RuntimeValue;
    }
  }

  const holderWrite: UpdateWrite =
    holder.kind === "sourceRoot"
      ? { kind: "sourceRoot", sourceId: holder.sourceId, value: nextValue }
      : {
          kind: "recordField",
          recordId: holder.recordId,
          fieldId: holder.fieldId,
          value: nextValue,
        };

  return {
    kind: "planned",
    // New records land before the write that references them, so reference
    // closure holds at every intermediate point.
    writes: [...records.map((record) => ({ kind: "record" as const, record })), holderWrite],
    changed: !sameRuntimeValue(currentValue, nextValue),
  };
}

/** Applies a plan to an in-memory state. The server applies it to rows instead. */
export function applyUpdateWrites(state: RunState, writes: readonly UpdateWrite[]): RunState {
  const sourceValues = { ...state.sourceValues };
  const structuredValues = { ...state.structuredValues };

  for (const write of writes) {
    if (write.kind === "record") {
      structuredValues[write.record.id] = write.record;
      continue;
    }
    if (write.kind === "sourceRoot") {
      sourceValues[write.sourceId] = write.value;
      continue;
    }
    const record = structuredValues[write.recordId];
    if (!record || record.kind !== "shape") continue;
    structuredValues[write.recordId] = {
      ...record,
      fields: { ...record.fields, [write.fieldId]: write.value },
    };
  }

  return { sourceValues, structuredValues };
}
