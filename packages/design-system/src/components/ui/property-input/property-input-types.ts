import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import type {
  PropertyConnection,
  PropertyValue,
  VariableReference as DomainVariableReference,
} from "@mechane/domain/property-values";
import type { NumberValue, ShapeValue } from "@mechane/domain/shapes";

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

/** Number values may carry the unit typed in a size field until the host persists it. */
export type NumberInputValue = NumberValue & { readonly unit?: PropertyInputUnit };

/** The value shape exchanged by the editor control. Variable current values may have another source Type. */
export type PropertyInputValue<T extends ShapeValue = ShapeValue> =
  | T
  | (T extends NumberValue ? NumberInputValue : never)
  | VariableReference;
export type PropertyInputMenuItem = {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
};

/** A Formula driving the Property. The row reads its result; the trailing button opens it. */
export type PropertyInputFormula = {
  /** What the row reads: the value the Formula renders, or `(mixed)` across differing Formulas. */
  readonly text: string;
  /** The source, shown on hover. */
  readonly source?: string;
  /** A blocking diagnostic: the button and row turn destructive. */
  readonly blocked?: boolean;
  /** Opens the host's Formula editor. */
  onOpen(): void;
};

export type PropertyInputProps<T extends ShapeValue = ShapeValue> = {
  className?: string;
  icon?: LucideIcon | string;
  value?: PropertyInputValue<T> | null;
  type?: PropertyInputType;
  /** A Formula drives the value: the row is read-only and the button opens the editor. */
  formula?: PropertyInputFormula | null;
  /** Render the current value in place of the input while it is inactive. */
  renderInactiveValue?: (value: ShapeValue | null) => ReactNode;
  /** Render controls inside the input's trailing addon. */
  actions?: ReactNode;
  /** Accessible name for the input when it differs from the visible placeholder. */
  ariaLabel?: string;
  /** Read while the row has no value, e.g. `(mixed)` across a selection; `(none)` when absent. */
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
  /** Shows the value without offering to change it: no entry, scrub, chip press, or menu. */
  disabled?: boolean;
  /** The connected Variable can no longer supply a value; its chip marks it destructive. */
  brokenVariable?: boolean;
  /** Number of pixels required for one scrub step. Higher values scrub more slowly. */
  scrubScale?: number;
  onChange?: (value: PropertyInputValue<T> | null) => void;
  onSizingChange?: (sizing: PropertyInputSizing) => void;
  /** Additional menu actions supplied by a property editor, such as Formula authoring. */
  menuItems?: readonly PropertyInputMenuItem[];
  onMenuItemSelect?: (value: string) => void;
  onAutoChange?: (auto: boolean) => void;
  /** Marks the min/max menu items as active. */
  constraints?: PropertyInputConstraints;
  onConstraintToggle?: (constraint: PropertyInputConstraint, enabled: boolean) => void;
  /** Reports why a draft could not be committed, or clears the current error. */
  onValidationError?: (message: string | null) => void;
  /** Observes keys after PropertyInput handles its draft. Invalid Enter commits are not forwarded. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};
