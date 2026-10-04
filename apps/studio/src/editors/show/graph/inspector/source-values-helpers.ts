import {
  parsePropertyInputValue,
  propertyInputValidationMessage,
  type PropertyInputType,
} from "@mechane/design-system";
import type { SourceNode } from "@mechane/domain/graph";
import { valueAtPath } from "@mechane/domain/property-values";
import { fieldsForType, type Type } from "@mechane/domain/shapes";
import { defaultSourceValues, sourceDefaultsFor } from "@mechane/domain/source-defaults";

import type { SourceValueEditing } from "../../commands/use-graph-editing";
import type { SourceValueRow } from "./source-value-types";

export const INLINE_STRING_LIMIT = 200;

function hasGraphOverride(
  graph: SourceValueEditing["graph"],
  nodeId: string,
  fieldPath: readonly string[],
): boolean {
  return sourceDefaultsFor(graph, nodeId).some(
    (override) =>
      override.fieldPath.length === fieldPath.length &&
      override.fieldPath.every((segment, index) => segment === fieldPath[index]),
  );
}

/** One row per immediate Shape field, or a single root row for any other type. */
export function sourceValueRows(node: SourceNode, editing: SourceValueEditing): SourceValueRow[] {
  const value = defaultSourceValues(editing.graph)[node.id];
  const shapes = editing.graph.shapes ?? [];
  const fields = fieldsForType(node.type, shapes);
  if (fields.length === 0) {
    return [
      {
        label: "Value",
        fieldPath: [],
        type: node.type,
        value,
        hasOverride: hasGraphOverride(editing.graph, node.id, []),
      },
    ];
  }
  return fields.map((field) => ({
    label: field.name,
    fieldPath: [field.id],
    type: field.type,
    value: valueAtPath(value, [field.id]),
    hasOverride: hasGraphOverride(editing.graph, node.id, [field.id]),
  }));
}

export function usesModal(type: Type, value: unknown): boolean {
  if (typeof type !== "string") return true;
  if (value === null || typeof value === "number" || typeof value === "boolean") return false;
  return typeof value !== "string" || value.length > INLINE_STRING_LIMIT || value.includes("\n");
}
export function sourceValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function propertyInputType(type: string): PropertyInputType | null {
  if (type === "number" || type === "color") return type;
  if (type === "text" || type === "date" || type === "datetime") return "text";
  return null;
}

export function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "No value";
  if (typeof value === "string") return value.length === 0 ? "Empty text" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object")
    return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  return "Unsupported value";
}

export function parsePrimitive(
  type: string,
  draft: string,
): { value: unknown } | { error: string } {
  if (type === "boolean") {
    if (draft === "true") return { value: true };
    if (draft === "false") return { value: false };
    return { error: "Choose true or false." };
  }
  const inputType = propertyInputType(type);
  if (!inputType) return { value: draft };
  const parsed = parsePropertyInputValue(inputType, draft);
  if (parsed === undefined) return { error: propertyInputValidationMessage(inputType) };
  return { value: parsed === null ? null : "value" in parsed ? parsed.value : null };
}

export const sourceValueEditor = {
  inlineStringLimit: INLINE_STRING_LIMIT,
  usesModal,
  sourceValuesEqual,
  propertyInputType,
  previewValue,
  parsePrimitive,
};
