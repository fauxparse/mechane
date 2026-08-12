import type { LucideIcon } from "lucide-react";
import type {
  PropertyConnection,
  PropertyValue,
  ShapeValue,
  VariableReference as DomainVariableReference,
} from "@mechane/domain";

export type { PropertyConnection, PropertyValue };
export type VariableReference<TSource extends ShapeValue = ShapeValue> =
  DomainVariableReference<TSource>;

export type PropertyInputType = "text" | "number" | "color";
export type PropertyInputSizing = "fixed" | "fill" | "hug";
export type PropertyInputConstraint = "min" | "max";
export type PropertyInputUnit = "px" | "%";

/** The value shape exchanged by the editor control. Variable current values may have another source Type. */
export type PropertyInputValue<T extends ShapeValue = ShapeValue> = T | VariableReference;

export type PropertyInputProps<T extends ShapeValue = ShapeValue> = {
  icon?: LucideIcon | string;
  value?: PropertyInputValue<T> | null;
  type?: PropertyInputType;
  placeholder?: string;
  dimension?: "width" | "height";
  unit?: PropertyInputUnit;
  sizing?: PropertyInputSizing;
  variables?: VariableReference[];
  min?: number;
  max?: number;
  step?: number;
  /** Number of pixels required for one scrub step. Higher values scrub more slowly. */
  scrubScale?: number;
  onChange?: (value: PropertyInputValue<T> | null) => void;
  onSizingChange?: (sizing: PropertyInputSizing) => void;
  onConstraintAdd?: (constraint: PropertyInputConstraint) => void;
};
