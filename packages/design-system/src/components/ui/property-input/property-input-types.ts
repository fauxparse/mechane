import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
export type PropertyInputPreset = number | "auto";
export type PropertyInputSizing = "fixed" | "fill" | "hug";
export type PropertyInputConstraint = "min" | "max";
/** Which size constraints the user has revealed for a dimension input. */
export type PropertyInputConstraints = Partial<Record<PropertyInputConstraint, boolean>>;
export type PropertyInputUnit = "px" | "%";

/** The value shape exchanged by the editor control. Variable current values may have another source Type. */
export type PropertyInputValue<T extends ShapeValue = ShapeValue> = T | VariableReference;

export type PropertyInputProps<T extends ShapeValue = ShapeValue> = {
  className?: string;
  icon?: LucideIcon | string;
  value?: PropertyInputValue<T> | null;
  type?: PropertyInputType;
  /** Render the current value in place of the input while it is inactive. */
  renderInactiveValue?: (value: ShapeValue | null) => ReactNode;
  /** Render controls inside the input's trailing addon. */
  actions?: ReactNode;
  placeholder?: string;
  dimension?: "width" | "height";
  unit?: PropertyInputUnit;
  sizing?: PropertyInputSizing;
  variables?: readonly VariableReference[];
  min?: number;
  max?: number;
  step?: number;
  /** Values shown in the input menu as common presets. */
  presets?: readonly PropertyInputPreset[];
  /** Enables the shared "Auto" popup option for values with non-numeric semantics. */
  allowAuto?: boolean;
  allowLink?: boolean;
  auto?: boolean;
  /** Number of pixels required for one scrub step. Higher values scrub more slowly. */
  scrubScale?: number;
  onChange?: (value: PropertyInputValue<T> | null) => void;
  onSizingChange?: (sizing: PropertyInputSizing) => void;
  onAutoChange?: (auto: boolean) => void;
  /** Marks the min/max menu items as active. */
  constraints?: PropertyInputConstraints;
  onConstraintToggle?: (constraint: PropertyInputConstraint, enabled: boolean) => void;
  /** Reports why a draft could not be committed, or clears the current error. */
  onValidationError?: (message: string | null) => void;
};
