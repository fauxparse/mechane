import type { Block, BlockVariable } from "./blocks";
import type { Shape, Type } from "./shapes";
import { areTypesCompatible, coerceValue, fieldsForType } from "./shapes";
import type { SlotElement, SlotInputAssignment, SlotInputSource } from "./canvas";
import { valueAtPath } from "./property-values";

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

function fieldType(type: Type, path: readonly string[], shapes: readonly Shape[]): Type | null {
  let current = type;
  for (const name of path) {
    const fields = fieldsForType(current, shapes);
    const field = fields.find((candidate) => candidate.name === name);
    if (!field) return null;
    current = field.type;
  }
  return current;
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
  const type = source.kind === "runtimeItem" ? runtimeType : variables.find((item) => item.id === source.variableId)?.type;
  return type ? fieldType(type, source.fieldPath ?? [], shapes) : null;
}

function literalType(value: unknown): Type | null {
  if (typeof value === "string") return "text";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return { kind: "array", of: "text" };
  return null;
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
  const values: Record<string, unknown> = {};
  const diagnostics: SlotDiagnostic[] = [];
  for (const variable of block.variables) {
    const assignment = assignmentFor(slot.assignments ?? [], variable.id);
    const source = assignment?.source ?? { kind: "unset" as const };
    const value = sourceValue(source, variables, runtimeItem);
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
    const sourceTypeValue = sourceType(source, variables, runtimeType, shapes) ?? literalType(value);
    if (sourceTypeValue && !areTypesCompatible(sourceTypeValue, variable.type, shapes)) {
      diagnostics.push({
        category: "incompatibleInput",
        message: `Input for Block Variable "${variable.name}" is incompatible.`,
        variableId: variable.id,
      });
      continue;
    }
    try {
      values[variable.id] = sourceTypeValue
        ? coerceValue(value, sourceTypeValue, variable.type, shapes)
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

export function expandSlotSource(
  source: unknown,
): { readonly items: readonly unknown[]; readonly diagnostic?: SlotDiagnostic } {
  if (Array.isArray(source)) return { items: source };
  if (source === undefined || source === null) {
    return {
      items: [],
      diagnostic: { category: "invalidExpansionSource", message: "Slot expansion source is missing." },
    };
  }
  return { items: [source] };
}
