import type { Shape, StructuredValueTemplate, Type } from "@mechane/domain";

import type { ErrorPath } from "../inspector/source-value-types";
import { previewValue } from "../inspector/source-values-helpers";

export type ShapeRecord = Extract<StructuredValueTemplate, { kind: "shape" }>;
export type ArrayType = Extract<Type, { kind: "array" }>;
export type ViewMode = "table" | "record";
export type ArrayValueFocus = { kind: "array" } | { kind: "record"; id: string };
export type ArrayValueSelection = { id: string; label: string };

export function firstHumanReadableField(fields: Shape["fields"]): Shape["fields"][number] | null {
  return fields.find((field) => field.type === "text") ?? fields[0] ?? null;
}

export function recordIdentifier(record: ShapeRecord, fields: Shape["fields"]): string {
  const field = firstHumanReadableField(fields);
  return field ? previewValue(record.fields[field.id]) : record.id;
}

export type ArrayValueEditorProps = {
  type: ArrayType;
  value: unknown;
  shapes: readonly Shape[];
  path: ErrorPath;
  focus?: ArrayValueFocus;
  onChange(value: unknown): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
  onSelectionChange?(selection: ArrayValueSelection | null): void;
};
