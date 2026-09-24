import type { ImageInputOnUploadProps } from "@mechane/design-system";
import type { Shape, Type } from "@mechane/domain/shapes";
import type { StructuredValueTemplate } from "@mechane/domain/structured-values";

import type { ErrorPath, SourceImageAsset } from "../../inspector/source-value-types";
import { previewValue } from "../../inspector/source-values-helpers";

export type ShapeRecord = Extract<StructuredValueTemplate, { kind: "shape" }>;
export type ShapeField = Shape["fields"][number];
export type ArrayType = Extract<Type, { kind: "array" }>;
export type ViewMode = "table" | "record";
export type ArrayValueFocus = { kind: "array" } | { kind: "record"; id: string };
export type ArrayValueSelection = { id: string; label: string };

export function firstHumanReadableField(fields: readonly ShapeField[]): ShapeField | null {
  return fields.find((field) => field.type === "text") ?? fields[0] ?? null;
}

export function recordIdentifier(
  record: ShapeRecord,
  fields: readonly ShapeField[],
  imageAssets: readonly SourceImageAsset[] = [],
): string {
  const field = firstHumanReadableField(fields);
  if (!field) return record.id;
  if (field.type !== "image") return previewValue(record.fields[field.id]);
  const value = record.fields[field.id];
  const asset =
    typeof value === "object" &&
    value !== null &&
    "assetId" in value &&
    "revision" in value &&
    typeof value.assetId === "string" &&
    typeof value.revision === "string"
      ? imageAssets.find(
          (candidate) =>
            candidate.assetId === value.assetId && candidate.revision === value.revision,
        )
      : null;
  return asset?.name || asset?.alt || "Unnamed image";
}

export type ArrayValueEditorProps = {
  type: ArrayType;
  value: unknown;
  shapes: readonly Shape[];
  path: ErrorPath;
  focus: ArrayValueFocus;
  readOnly: boolean;
  columnSizes?: Record<string, number>;
  onColumnSizesChange?(columnSizes: Record<string, number>): void;
  onChange(value: unknown): void;
  onImmediateChange?(value: unknown): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
  onSelectionChange(selection: ArrayValueSelection | null): void;
  imageAssets?: readonly SourceImageAsset[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
};
