// PROTOTYPE (issue #712) — Variant C: the unit is a button in the row.
//
// The argument: a unit you can see is a unit you can find, and one click is
// faster than a menu. The unit moves out of the value text and into a button in
// the trailing addon, which means the row spends real width on it — that is the
// thing this variant is here to make visible against #711's measured 59px.
//
// Switching **keeps** the number (100px becomes 100%), because the gesture is one
// click, instantly reversible, and the number is right there under your eye; a
// conversion would silently rewrite what you just read.
import { cn } from "@mechane/design-system";

import type { PercentOverrides } from "./variant-contract";
import type { PercentageField } from "./use-percentage-field";

function UnitButton({ field }: { field: PercentageField }) {
  const { allowed, reason } = field.availability;
  const current = field.unitMixed ? "–" : (field.unit ?? "px");
  const next = field.unit === "%" ? "px" : "%";
  const blocked = next === "%" && !allowed;
  const label = blocked
    ? reason
    : `${field.label} in ${next === "%" ? "percent of the parent" : "pixels"}${
        field.title ? ` · ${field.title}` : ""
      }`;
  return (
    <button
      type="button"
      aria-label={label ?? "Unit"}
      title={label ?? undefined}
      disabled={blocked}
      className={cn(
        "h-5 min-w-5 rounded-sm px-1 text-xs tabular-nums",
        blocked
          ? "cursor-not-allowed text-muted-foreground/40"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        field.unit === "%" && !blocked && "bg-muted text-foreground",
      )}
      onClick={() => field.setUnit(next, { convert: false })}
    >
      {current}
    </button>
  );
}

export function variantCOverrides(field: PercentageField): PercentOverrides {
  return {
    // The button carries the unit, so the value text must not repeat it.
    unit: "px",
    actions: <UnitButton field={field} />,
    onSizingChange: field.interceptSizing,
  };
}
