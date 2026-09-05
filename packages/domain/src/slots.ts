import {
  applyBlockState,
  assertAcyclicBlockReferences,
  BlockCycleError,
  resolveBlockState,
} from "./blocks";
import type { Block, BlockCanvas, BlockVariable } from "./blocks";
import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "./shapes";
import { areTypesCompatible, coerceValue } from "./shapes";
import type { StructuredValueId } from "./id";
import {
  isStructuredValueReference,
  resolveRuntimeValue,
  type StructuredValueRecord,
} from "./structured-values";
import type { ResolvedCanvas, SlotElement, SlotInputAssignment, SlotInputSource } from "./canvas";
import { typeAtPath, valueAtPath } from "./property-values";
import { resolveCanvasProperties } from "./element-properties";

export const SLOT_DIAGNOSTIC_CATEGORIES = [
  "missingBlock",
  "blockCycle",
  "missingRequiredInput",
  "invalidAssignment",
  "missingInputPath",
  "incompatibleInput",
  "invalidExpansionSource",
  "invalidExpansionItem",
  "invalidSlotLayout",
] as const;
export type SlotDiagnosticCategory = (typeof SLOT_DIAGNOSTIC_CATEGORIES)[number];

export interface SlotDiagnostic {
  readonly category: SlotDiagnosticCategory;
  readonly message: string;
  readonly variableId?: string;
  readonly path?: readonly string[];
  readonly index?: number;
}

export interface SlotVariableValue {
  readonly id: string;
  readonly type: Type;
  readonly value: unknown;
}

export interface SlotResolution {
  readonly values: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly SlotDiagnostic[];
}

function sourceValue(
  source: SlotInputSource,
  variables: readonly SlotVariableValue[],
  runtimeItem: unknown,
): unknown {
  if (source.kind === "literal") return source.value;
  if (source.kind === "runtimeItem") return valueAtPath(runtimeItem, source.fieldPath ?? []);
  if (source.kind === "variable") {
    const variable = variables.find((candidate) => candidate.id === source.variableId);
    return variable ? valueAtPath(variable.value, source.fieldPath ?? []) : undefined;
  }
  return undefined;
}

function sourceType(
  source: SlotInputSource,
  variables: readonly SlotVariableValue[],
  runtimeType: Type | undefined,
  shapes: readonly Shape[],
): Type | null {
  if (source.kind === "literal") return null;
  if (source.kind === "unset") return null;
  const type =
    source.kind === "runtimeItem"
      ? runtimeType
      : variables.find((item) => item.id === source.variableId)?.type;
  return type ? typeAtPath(type, source.fieldPath ?? [], shapes) : null;
}

function literalType(value: unknown): Type | null {
  if (typeof value === "string") return "text";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  if (!Array.isArray(value) || value.length === 0) return null;
  const itemTypes = value.map(literalType);
  const first = itemTypes[0];
  if (!first || itemTypes.some((type) => JSON.stringify(type) !== JSON.stringify(first)))
    return null;
  return { kind: "array", of: first };
}

function defaultValue(variable: BlockVariable): unknown {
  return variable.defaultValue;
}

function assignmentFor(
  assignments: readonly SlotInputAssignment[],
  variableId: string,
): SlotInputAssignment | undefined {
  return assignments.find((assignment) => assignment.variableId === variableId);
}

export function resolveSlotInputs(
  block: Block,
  slot: SlotElement,
  variables: readonly SlotVariableValue[] = [],
  runtimeItem?: unknown,
  runtimeType?: Type,
  shapes: readonly Shape[] = [],
): SlotResolution {
  const assignments = slot.assignments ?? [];
  const values: Record<string, unknown> = {};
  const diagnostics: SlotDiagnostic[] = [];
  const assigned = new Set<string>();
  for (const assignment of assignments) {
    if (assigned.has(assignment.variableId)) {
      diagnostics.push({
        category: "invalidAssignment",
        message: `Block Variable "${assignment.variableId}" has multiple assignments.`,
        variableId: assignment.variableId,
      });
    }
    assigned.add(assignment.variableId);
    if (!block.variables.some((variable) => variable.id === assignment.variableId)) {
      diagnostics.push({
        category: "invalidAssignment",
        message: `Block Variable "${assignment.variableId}" was not found.`,
        variableId: assignment.variableId,
      });
    }
  }
  for (const variable of block.variables) {
    const assignment = assignmentFor(assignments, variable.id);
    const source = assignment?.source ?? { kind: "unset" as const };
    const value = sourceValue(source, variables, runtimeItem);
    const sourceTypeValue = sourceType(source, variables, runtimeType, shapes);
    const invalidPath =
      (source.kind === "variable" &&
        (!variables.some((candidate) => candidate.id === source.variableId) ||
          ((source.fieldPath?.length ?? 0) > 0 && sourceTypeValue === null))) ||
      (source.kind === "runtimeItem" &&
        (source.fieldPath?.length ?? 0) > 0 &&
        runtimeType !== undefined &&
        sourceTypeValue === null);
    if (invalidPath) {
      diagnostics.push({
        category: "missingInputPath",
        message: "Slot input source path was not found.",
        variableId: variable.id,
        path: source.fieldPath ?? [],
      });
      continue;
    }
    if (source.kind === "unset" || value === undefined || value === null) {
      const fallback = defaultValue(variable);
      if (fallback !== undefined && fallback !== null) {
        values[variable.id] = fallback;
      } else if (variable.required) {
        diagnostics.push({
          category: "missingRequiredInput",
          message: `Required Block Variable "${variable.name}" has no value.`,
          variableId: variable.id,
        });
      }
      continue;
    }
    const inferredType = sourceTypeValue ?? literalType(value);
    if (source.kind === "literal" && Array.isArray(value) && value.length > 0 && !inferredType) {
      diagnostics.push({
        category: "invalidAssignment",
        message: `Literal input for Block Variable "${variable.name}" has inconsistent item types.`,
        variableId: variable.id,
      });
      continue;
    }
    if (inferredType && !areTypesCompatible(inferredType, variable.type, shapes)) {
      diagnostics.push({
        category: "incompatibleInput",
        message: `Input for Block Variable "${variable.name}" is incompatible.`,
        variableId: variable.id,
      });
      continue;
    }
    try {
      values[variable.id] = inferredType
        ? coerceValue(value, inferredType, variable.type, shapes)
        : value;
    } catch (error) {
      diagnostics.push({
        category: "invalidAssignment",
        message: error instanceof Error ? error.message : "Invalid Slot assignment.",
        variableId: variable.id,
      });
    }
  }
  return { values, diagnostics };
}

export function resolveBlockCanvas(
  block: Block,
  values: Readonly<Record<string, unknown>>,
  shapes: readonly Shape[] = [],
  canvas: BlockCanvas = block.canvas,
  imageAssets: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[] = [],
): ResolvedCanvas {
  return resolveCanvasProperties(canvas, {
    variables: block.variables.map(({ id, name, type, defaultValue }) => ({
      id,
      name,
      type,
      defaultValue,
    })),
    values,
    shapes,
    imageAssets,
  });
}

export function expandSlotSource(source: unknown): {
  readonly items: readonly unknown[];
  readonly diagnostic?: SlotDiagnostic;
} {
  if (Array.isArray(source)) return { items: source };
  if (source === undefined || source === null) {
    return {
      items: [],
      diagnostic: {
        category: "invalidExpansionSource",
        message: "Slot expansion source is missing.",
      },
    };
  }
  return { items: [source] };
}

export interface ResolvedSlotInstance {
  /** Stable identity of a structured array item, when present. */
  readonly id?: StructuredValueId;
  readonly index: number;
  readonly item: unknown;
  readonly canvas?: ResolvedCanvas;
  readonly variables?: readonly SlotVariableValue[];
  readonly diagnostics: readonly SlotDiagnostic[];
}

export interface ResolveSlotInstancesInput {
  readonly block: Block;
  readonly slot: SlotElement;
  readonly variables?: readonly SlotVariableValue[];
  readonly runtimeItem?: unknown;
  readonly runtimeType?: Type;
  readonly structuredValues?: Readonly<Record<string, StructuredValueRecord>>;
  readonly shapes?: readonly Shape[];
  readonly allBlocks?: readonly Block[];
  readonly imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
}

export function resolveSlotInstances({
  block,
  slot,
  variables = [],
  runtimeItem,
  runtimeType,
  shapes = [],
  allBlocks = [block],
  imageAssets = [],
  structuredValues = {},
}: ResolveSlotInstancesInput): {
  readonly instances: readonly ResolvedSlotInstance[];
  readonly diagnostic?: SlotDiagnostic;
} {
  const structuralDiagnostics = diagnoseSlot(slot, allBlocks, variables, runtimeType, shapes);
  if (structuralDiagnostics.length > 0) {
    return { instances: [], diagnostic: structuralDiagnostics[0] };
  }
  const expansion = slot.expansion?.source;
  let expansionValue: unknown;
  if (expansion?.kind === "literal") expansionValue = expansion.value;
  else if (expansion?.kind === "runtimeItem") expansionValue = runtimeItem;
  else if (expansion?.kind === "variable") {
    expansionValue = valueAtPath(
      variables.find((variable) => variable.id === expansion.variableId)?.value,
      expansion.fieldPath ?? [],
    );
  }
  const expanded = expansion
    ? expandSlotInstances(
        expansionValue,
        (item) =>
          item === null || item === undefined
            ? { category: "invalidExpansionItem", message: "Slot expansion item is missing." }
            : undefined,
        structuredValues,
      )
    : { instances: [{ index: 0, item: undefined }] };
  if (expanded.diagnostic) return { instances: [], diagnostic: expanded.diagnostic };
  return {
    instances: expanded.instances.map((instance) => {
      const identity = instance.id ? { id: instance.id } : {};
      if (instance.diagnostic) {
        return {
          ...identity,
          index: instance.index,
          item: instance.item,
          diagnostics: [instance.diagnostic],
        };
      }
      const resolution = resolveSlotInputs(
        block,
        slot,
        variables,
        instance.item ?? runtimeItem,
        runtimeType,
        shapes,
      );
      if (resolution.diagnostics.length > 0) {
        return {
          ...identity,
          index: instance.index,
          item: instance.item,
          diagnostics: resolution.diagnostics,
        };
      }
      const selector = block.stateSelectorVariableId
        ? resolution.values[block.stateSelectorVariableId]
        : undefined;
      const selected = applyBlockState(block, resolveBlockState(block, selector));
      const resolvedVariables = block.variables.map((variable) => ({
        id: variable.id,
        type: variable.type,
        value: resolution.values[variable.id],
      }));
      return {
        ...identity,
        index: instance.index,
        item: instance.item,
        canvas: resolveBlockCanvas(block, resolution.values, shapes, selected, imageAssets),
        variables: resolvedVariables,
        diagnostics: [],
      };
    }),
  };
}

export interface SlotInstance {
  /** Stable identity carried by a structured item, when present. */
  readonly id?: StructuredValueId;
  readonly index: number;
  readonly item: unknown;
  readonly diagnostic?: SlotDiagnostic;
}

export function expandSlotInstances(
  source: unknown,
  validateItem?: (item: unknown, index: number) => SlotDiagnostic | undefined,
  structuredValues: Readonly<Record<string, StructuredValueRecord>> = {},
): {
  readonly instances: readonly SlotInstance[];
  readonly diagnostic?: SlotDiagnostic;
} {
  const rootRecord = isStructuredValueReference(source) ? structuredValues[source.ref] : undefined;
  const expanded = expandSlotSource(rootRecord?.kind === "array" ? rootRecord.items : source);
  if (expanded.diagnostic) return { instances: [], diagnostic: expanded.diagnostic };
  return {
    instances: expanded.items.map((candidate, index) => {
      const id = isStructuredValueReference(candidate) ? candidate.ref : undefined;
      const item = isStructuredValueReference(candidate)
        ? resolveRuntimeValue(candidate, structuredValues)
        : candidate;
      const diagnostic = validateItem?.(item, index);
      return {
        ...(id ? { id } : {}),
        index,
        item,
        ...(diagnostic ? { diagnostic } : {}),
      };
    }),
  };
}

export function diagnoseSlot(
  slot: SlotElement,
  blocks: readonly Block[],
  variables: readonly SlotVariableValue[] = [],
  runtimeType?: Type,
  shapes: readonly Shape[] = [],
): readonly SlotDiagnostic[] {
  const block = blocks.find((candidate) => candidate.id === slot.blockId);
  if (!block) {
    return [{ category: "missingBlock", message: `Block "${slot.blockId}" was not found.` }];
  }
  const diagnostics: SlotDiagnostic[] = [];
  try {
    assertAcyclicBlockReferences(blocks);
  } catch (error) {
    if (error instanceof BlockCycleError && error.chain.includes(slot.blockId)) {
      diagnostics.push({ category: "blockCycle", message: error.message });
    }
  }
  if (slot.layoutMode !== undefined && slot.layoutMode !== "auto") {
    diagnostics.push({ category: "invalidSlotLayout", message: "Slots must use auto layout." });
  }
  const targets = new Set<string>();
  for (const assignment of slot.assignments ?? []) {
    if (targets.has(assignment.variableId)) {
      diagnostics.push({
        category: "invalidAssignment",
        message: `Block Variable "${assignment.variableId}" has multiple assignments.`,
        variableId: assignment.variableId,
      });
    }
    targets.add(assignment.variableId);
    if (!block.variables.some((variable) => variable.id === assignment.variableId)) {
      diagnostics.push({
        category: "invalidAssignment",
        message: `Block Variable "${assignment.variableId}" was not found.`,
        variableId: assignment.variableId,
      });
    }
    const source = assignment.source;
    const sourceType =
      source.kind === "variable"
        ? variables.find((variable) => variable.id === source.variableId)?.type
        : source.kind === "runtimeItem"
          ? runtimeType
          : undefined;
    const path =
      source.kind === "literal" || source.kind === "unset" ? [] : (source.fieldPath ?? []);
    if (
      (source.kind === "variable" &&
        (!sourceType || (path.length > 0 && !typeAtPath(sourceType, path, shapes)))) ||
      (source.kind === "runtimeItem" &&
        runtimeType !== undefined &&
        path.length > 0 &&
        !typeAtPath(runtimeType, path, shapes))
    ) {
      diagnostics.push({
        category: "missingInputPath",
        message: "Slot input source path was not found.",
        variableId: assignment.variableId,
        path,
      });
    }
  }
  const expansion = slot.expansion?.source;
  if (expansion) {
    const path =
      expansion.kind === "literal" || expansion.kind === "unset" ? [] : (expansion.fieldPath ?? []);
    const sourceType =
      expansion.kind === "variable"
        ? variables.find((variable) => variable.id === expansion.variableId)?.type
        : expansion.kind === "runtimeItem"
          ? runtimeType
          : undefined;
    if (
      (expansion.kind === "variable" &&
        (!sourceType || (path.length > 0 && !typeAtPath(sourceType, path, shapes)))) ||
      (expansion.kind === "runtimeItem" &&
        runtimeType !== undefined &&
        path.length > 0 &&
        !typeAtPath(runtimeType, path, shapes))
    ) {
      diagnostics.push({
        category: "missingInputPath",
        message: "Slot expansion source path was not found.",
        path,
      });
    }
  }
  return diagnostics;
}
