import type { Shape, StructuredValueTemplate, Type } from "@mechane/domain";

import type { ErrorPath } from "../inspector/source-value-types";

export type ShapeRecord = Extract<StructuredValueTemplate, { kind: "shape" }>;
export type ArrayType = Extract<Type, { kind: "array" }>;
export type ViewMode = "table" | "record";

export type ArrayValueEditorProps = {
  type: ArrayType;
  value: unknown;
  shapes: readonly Shape[];
  path: ErrorPath;
  onChange(value: unknown): void;
  onValidityChange(path: ErrorPath, error: string | null): void;
};
