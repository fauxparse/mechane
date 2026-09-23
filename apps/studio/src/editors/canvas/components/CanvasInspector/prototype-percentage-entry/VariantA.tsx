// PROTOTYPE (issue #712) — Variant A: type the unit.
//
// The argument: the row is already full, and a spreadsheet user writes `50%`
// rather than hunting for a control. So nothing is added to the row at all —
// `parsePropertyInputValue`'s `replace(/%/g, "")` is what has to go. `240px`
// switches back. The unit is only ever visible as the value's own suffix.
//
// The cost this variant is meant to expose: nothing tells you the mode exists,
// and a rejected `%` has nowhere to put its reason but a transient badge.
import { TriangleAlertIcon } from "@mechane/design-system";

import type { PercentOverrides } from "./variant-contract";
import type { PercentageField } from "./use-percentage-field";

export function variantAOverrides(
  field: PercentageField,
  rejection: string | null,
  setRejection: (reason: string | null) => void,
): PercentOverrides {
  return {
    onRawCommit: (rawValue) => {
      const result = field.commitRaw(rawValue);
      setRejection(result.error);
      return result.handled;
    },
    actions: rejection ? (
      <button
        type="button"
        aria-label={rejection}
        title={rejection}
        className="flex size-5 items-center justify-center rounded-sm text-destructive"
        onClick={() => setRejection(null)}
      >
        <TriangleAlertIcon className="size-3.5" />
      </button>
    ) : undefined,
    onSizingChange: field.interceptSizing,
  };
}
