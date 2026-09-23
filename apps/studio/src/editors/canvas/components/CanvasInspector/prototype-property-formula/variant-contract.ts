// PROTOTYPE (issue #711) — what a variant may change about a Property row.
//
// The two wire points (`PropertyField` and `SizeFieldInput`) build their real
// `PropertyInput` exactly as they do today and merge these in. A variant that
// replaces the control entirely returns `replaced`; the wire point renders
// that instead. Nothing else about the inspector moves.
import type { KeyboardEvent, ReactNode } from "react";

export interface FormulaInputOverrides {
  /** Observed after PropertyInput handles its own draft. Variant A watches for `=`. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Rendered inside the input's trailing addon. Variant B's `fx` button. */
  actions?: ReactNode;
  /** Rendered at the top of the input's menu. Variant C's "Write a Formula". */
  menuItems?: ReactNode;
  /** Claims that menu selection before PropertyInput reads it as a preset. */
  onMenuSelect?: (value: string) => boolean;
  /** Replaces the control while a Formula is set. */
  replaced?: ReactNode;
  /** Applied to the cell wrapper; Variant A widens itself to open an editor. */
  wrapperClassName?: string;
}
