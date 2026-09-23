// PROTOTYPE (issue #712) — what a variant may change about a size row.
//
// The two wire points (`SizeFieldInput` and `SizeConstraintField`) build their
// real `PropertyInput` exactly as they do today and merge these in. Nothing else
// about the inspector moves, so every measurement taken from a variant is a
// measurement of the real row.
import type { PropertyInputUnit } from "@mechane/design-system";
import type { SizeMode } from "@mechane/domain";
import type { ReactNode } from "react";

export interface PercentOverrides {
  /** Overrides the unit the value text is formatted with. Variant C shows the unit itself. */
  unit?: PropertyInputUnit;
  /** Rendered inside the input's trailing addon. Variant C's px/% button. */
  actions?: ReactNode;
  /** Rendered at the head of the input's menu. Variant B's unit group. */
  menuItems?: ReactNode;
  /** Claims that menu selection before PropertyInput reads it as a sizing mode. */
  onMenuSelect?: (value: string) => boolean;
  /** Claims the raw entry text. Variant A reads `50%` and `240px`. */
  onRawCommit?: (rawValue: string) => boolean;
  /** Returns true when the variant has fully handled the sizing-mode change. */
  onSizingChange?: (mode: SizeMode) => boolean;
}

export const NO_OVERRIDES: PercentOverrides = {};
