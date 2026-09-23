// PROTOTYPE (issue #711) — Variant D: A's gesture, B's container, C's menu.
//
// The blend the first round asked for:
//   - You enter Formula mode by typing `=` as the first character of an entry
//     (Variant A), *or* from "Write a Formula" in the Property's own menu
//     (Variant C) — the gesture for people who already know, the menu item for
//     everyone else.
//   - The editor opens in the floating flyout (Variant B), so the sidebar's
//     layout never moves and the editor is 394px rather than a 258px column.
//   - At rest the row keeps the Property's own icon — Opacity still reads as
//     Opacity — carrying a dot in the primary accent. Nothing is swapped out
//     for an `fx`, and no extra button crowds the trailing addon, which is what
//     made Variant B unaffordable on the W/H row.
import { cn, ComboboxGroup, ComboboxItem, ComboboxSeparator } from "@mechane/design-system";
import type { KeyboardEvent } from "react";

import { BadgedPropertyIcon, BlockedMark, FormulaGlyph } from "./variant-parts";
import type { FormulaSlot, PropertyFormula } from "./use-property-formula";
import type { FormulaInputOverrides } from "./variant-contract";

export const WRITE_A_FORMULA_D = "prototype-711-d-write-a-formula";

export function variantDOverrides(
  formula: PropertyFormula,
  slot: FormulaSlot,
): FormulaInputOverrides {
  return {
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key !== "=") return;
      const input = event.currentTarget;
      const wholeEntry =
        input.value === "" ||
        (input.selectionStart === 0 && input.selectionEnd === input.value.length);
      if (!wholeEntry) return;
      event.preventDefault();
      formula.begin("");
    },
    menuItems: (
      <>
        <ComboboxGroup>
          <ComboboxItem value={WRITE_A_FORMULA_D}>
            <FormulaGlyph className="w-4 text-center" />
            Write a Formula
          </ComboboxItem>
        </ComboboxGroup>
        <ComboboxSeparator />
      </>
    ),
    onMenuSelect(value) {
      if (value !== WRITE_A_FORMULA_D) return false;
      if (formula.active) formula.reopen();
      else formula.begin("");
      return true;
    },
    replaced: formula.active ? <VariantDRestingRow formula={formula} slot={slot} /> : undefined,
  };
}

/**
 * The same box a literal row occupies, to the pixel: icon addon, value, no
 * trailing control. Clicking it reopens the flyout.
 */
function VariantDRestingRow({ formula, slot }: { formula: PropertyFormula; slot: FormulaSlot }) {
  return (
    <button
      type="button"
      aria-label={`${slot.label} Formula: ${formula.source ?? "several"}`}
      title={formula.source ?? undefined}
      className={cn(
        "flex h-7 w-full min-w-0 items-center rounded-sm bg-muted/50 pr-1 text-left",
        formula.open && "ring-1 ring-ring/40",
        formula.blocked && "ring-1 ring-destructive",
      )}
      onClick={formula.reopen}
    >
      <BadgedPropertyIcon icon={slot.icon} blocked={formula.blocked} />
      <span
        className={cn("min-w-0 flex-1 truncate text-sm", formula.blocked && "text-destructive")}
      >
        {formula.mixed ? `${formula.sources.length} Formulas` : formula.resultText}
      </span>
      {formula.blocked ? <BlockedMark message="This Formula can't be evaluated" /> : null}
    </button>
  );
}
