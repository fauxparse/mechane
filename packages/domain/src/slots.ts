import { applyBlockState, resolveBlockState } from "./blocks";
import type { Block, BlockCanvas, BlockVariable } from "./blocks";
import type { Shape, Type } from "./shapes";
import { areTypesCompatible, coerceValue } from "./shapes";
import type { ResolvedCanvas, SlotElement, SlotInputAssignment, SlotInputSource } from "./canvas";
import { typeAtPath, valueAtPath } from "./property-values";
import { resolveCanvasProperties } from "./canvas-property-resolution";

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
): ResolvedCanvas {
  return resolveCanvasProperties(canvas, {
    variables: block.variables.map(({ id, name, type }) => ({ id, name, type })),
    values,
    shapes,
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
  readonly index: number;
  readonly item: unknown;
  readonly canvas?: ResolvedCanvas;
  readonly diagnostics: readonly SlotDiagnostic[];
}

export function resolveSlotInstances(
  block: Block,
  slot: SlotElement,
  variables: readonly SlotVariableValue[] = [],
  runtimeItem?: unknown,
  runtimeType?: Type,
  shapes: readonly Shape[] = [],
): {
  readonly instances: readonly ResolvedSlotInstance[];
  readonly diagnostic?: SlotDiagnostic;
} {
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
  const expanded = expansion ? expandSlotSource(expansionValue) : { items: [undefined] };
  if (expanded.diagnostic) return { instances: [], diagnostic: expanded.diagnostic };
  return {
    instances: expanded.items.map((item, index) => {
      const resolution = resolveSlotInputs(
        block,
        slot,
        variables,
        item ?? runtimeItem,
        runtimeType,
        shapes,
      );
      if (resolution.diagnostics.length > 0) {
        return { index, item, diagnostics: resolution.diagnostics };
      }
      const selector = block.stateSelectorVariableId
        ? resolution.values[block.stateSelectorVariableId]
        : undefined;
      const selected = applyBlockState(block, resolveBlockState(block, selector));
      return {
        index,
        item,
        canvas: resolveBlockCanvas(block, resolution.values, shapes, selected),
        diagnostics: [],
      };
    }),
  };
}

export interface SlotInstance {
  readonly index: number;
  readonly item: unknown;
}

export function expandSlotInstances(source: unknown): {
  readonly instances: readonly SlotInstance[];
  readonly diagnostic?: SlotDiagnostic;
} {
  const expanded = expandSlotSource(source);
  if (expanded.diagnostic) return { instances: [], diagnostic: expanded.diagnostic };
  return {
    instances: expanded.items.map((item, index) => ({ index, item })),
  };
}
