// PROTOTYPE (issue #711) — Variant B: the row never grows.
//
// The argument: a dense one-row-per-Property sidebar stays dense. A Formula is
// authored in a flyout anchored to its row that *escapes the sidebar* over the
// canvas, so the editor is 420px wide instead of a 270px column — the standing
// cost #675 recorded — and the Artboard stays visible beside it as you type.
// At rest the row is still exactly one row: result, plus a lit `fx` button.
import { cn, InputGroupButton } from "@mechane/design-system";
import type { ReactNode, RefObject } from "react";

import { BlockedMark, FormulaGlyph } from "./variant-parts";
import type { PropertyFormula } from "./use-property-formula";
import type { FormulaInputOverrides } from "./variant-contract";

export function variantBOverrides(
  formula: PropertyFormula,
  anchorRef: RefObject<HTMLDivElement | null>,
): FormulaInputOverrides {
  const button = (
    <>
      {formula.blocked ? <BlockedMark message="This Formula can't be evaluated" /> : null}
      <InputGroupButton
        aria-label={formula.active ? "Edit the Formula" : "Write a Formula"}
        className={cn(
          "h-5 w-6 rounded-xs p-0",
          formula.active
            ? "bg-accent text-accent-foreground"
            : "opacity-0 group-hover/property-input:opacity-100 group-focus-within/property-input:opacity-100",
        )}
        onClick={() => {
          if (formula.open) formula.close();
          else if (formula.active) formula.reopen();
          else formula.begin("");
        }}
      >
        <FormulaGlyph blocked={formula.blocked} />
      </InputGroupButton>
    </>
  );
  return {
    actions: button,
    replaced: formula.active ? (
      <VariantBRestingRow formula={formula} actions={button} anchorRef={anchorRef} />
    ) : undefined,
  };
}

/**
 * A Formula-valued row. Deliberately built out of the same box as a literal
 * row, minus the editable input: B's whole claim is that the row does not move.
 */
function VariantBRestingRow({
  formula,
  actions,
}: {
  formula: PropertyFormula;
  actions: ReactNode;
  anchorRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className={cn(
        "group/property-input flex h-7 w-full min-w-0 items-center gap-1 rounded-sm bg-muted/50 pr-1 pl-2",
        formula.blocked && "ring-1 ring-destructive",
      )}
      title={formula.source ?? undefined}
    >
      <span
        className={cn("min-w-0 flex-1 truncate text-sm", formula.blocked && "text-destructive")}
      >
        {formula.sources.length > 1 ? `${formula.sources.length} Formulas` : formula.resultText}
      </span>
      {actions}
    </div>
  );
}
