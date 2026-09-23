// PROTOTYPE (issue #712) — Variant B: the unit is in the menu.
//
// The argument: the size row's menu already owns the other mode switch
// (Fixed / Fill / Hug), the measured row has no space for a fifth control, and
// a menu item is the only thing that *tells* a director percentages exist.
// Switching converts: 100px inside a 400px parent becomes 25%, because a menu
// is a deliberate gesture and the size on the stage should not jump.
//
// Unavailability is shown the way #37 asks for: the item is disabled and the
// reason is on the line below it, not hidden.
import {
  CheckIcon,
  ComboboxGroup,
  ComboboxItem,
  ComboboxSeparator,
  ComboboxTrigger,
  ChevronDownIcon,
  PercentIcon,
  RulerIcon,
  cn,
} from "@mechane/design-system";

import type { PercentOverrides } from "./variant-contract";
import type { PercentageField } from "./use-percentage-field";

const UNIT_VALUES = { px: "prototype-unit-px", percent: "prototype-unit-percent" } as const;

export function variantBOverrides(field: PercentageField): PercentOverrides {
  const { allowed, reason } = field.availability;
  return {
    menuItems: (
      <>
        <ComboboxGroup>
          <ComboboxItem value={UNIT_VALUES.px}>
            <RulerIcon />
            Pixels
            <CheckIcon
              className={cn("ml-auto", field.unit === "px" ? "opacity-100" : "opacity-0")}
            />
          </ComboboxItem>
          <ComboboxItem value={UNIT_VALUES.percent} disabled={!allowed}>
            <PercentIcon />
            Percent of parent
            <CheckIcon
              className={cn("ml-auto", field.unit === "%" ? "opacity-100" : "opacity-0")}
            />
          </ComboboxItem>
          {!allowed && reason ? (
            <p className="max-w-56 px-2 pb-1 text-xs text-muted-foreground">{reason}</p>
          ) : null}
        </ComboboxGroup>
        <ComboboxSeparator />
      </>
    ),
    onMenuSelect: (value) => {
      if (value === UNIT_VALUES.px) {
        field.setUnit("px", { convert: true });
        return true;
      }
      if (value === UNIT_VALUES.percent) {
        field.setUnit("%", { convert: true });
        return true;
      }
      return false;
    },
    onSizingChange: field.interceptSizing,
  };
}

/**
 * A min/max row has `allowLink={false}`, so it has no connector — and the
 * connector is the only visible thing that opens the menu. Without this the
 * unit is reachable on those rows by ArrowDown and nothing else.
 */
export function VariantBConstraintTrigger() {
  return (
    <ComboboxTrigger
      aria-label="Unit"
      className="flex size-5 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground"
    >
      <ChevronDownIcon className="size-3.5" />
    </ComboboxTrigger>
  );
}
