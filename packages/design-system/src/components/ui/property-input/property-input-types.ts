import type { LucideIcon } from "lucide-react";
import type { SceneVariable, ShapeValue } from "@mechane/domain";

export type PropertyInputType = "text" | "number" | "color";
export type PropertyInputSizing = "fixed" | "fill" | "hug";
export type PropertyInputConstraint = "min" | "max";
export type PropertyInputUnit = "px" | "%";

export type VariableReference<T extends ShapeValue> = SceneVariable & {
  current?: T;
};

export type PropertyInputValue<T extends ShapeValue> = T | VariableReference<T>;

export type PropertyInputProps<T extends ShapeValue> = {
  icon?: LucideIcon | string;
  value?: PropertyInputValue<T> | null;
  type?: PropertyInputType;
  placeholder?: string;
  dimension?: "width" | "height";
  unit?: PropertyInputUnit;
  sizing?: PropertyInputSizing;
  variables?: VariableReference<T>[];
  min?: number;
  max?: number;
  step?: number;
  /** Number of pixels required for one scrub step. Higher values scrub more slowly. */
  scrubScale?: number;
  onChange?: (value: PropertyInputValue<T> | null) => void;
  onSizingChange?: (sizing: PropertyInputSizing) => void;
  onConstraintAdd?: (constraint: PropertyInputConstraint) => void;
};
