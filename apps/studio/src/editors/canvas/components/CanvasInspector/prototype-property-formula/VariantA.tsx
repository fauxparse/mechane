// PROTOTYPE (issue #711) — Variant A: type `=` like a spreadsheet.
//
// The argument: an Element Property is a cell. You enter Formula mode by typing
// `=` as the first character of an entry, exactly as in a spreadsheet, and the
// row grows downward in the sidebar's own flow to make room for the editor.
// At rest the row shows the *result*, because a spreadsheet cell shows its
// value and only the formula bar shows its source.
import { Button, cn, XIcon } from "@mechane/design-system";
import type { KeyboardEvent } from "react";

import { FormulaEditor } from "../../../../show/graph/formula/FormulaEditor";
import { DiagnosticsList, FormulaGlyph, MixedFormulas, ResultLine } from "./variant-parts";
import type { FormulaSlot, PropertyFormula } from "./use-property-formula";
import type { FormulaInputOverrides } from "./variant-contract";

export function variantAOverrides(formula: PropertyFormula): FormulaInputOverrides {
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
  };
}

export function VariantA({ formula, slot }: { formula: PropertyFormula; slot: FormulaSlot }) {
  if (formula.open || formula.mixed) {
    return (
      <div className="flex flex-col gap-1.5 rounded-sm bg-accent/30 p-1.5 ring-1 ring-accent">
        <div className="flex items-center gap-1.5">
          <FormulaGlyph />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{slot.label}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close the Formula"
            className="size-5"
            onClick={() => (formula.source?.trim() ? formula.close() : formula.remove())}
          >
            <XIcon />
          </Button>
        </div>
        {formula.mixed ? (
          <MixedFormulas sources={formula.sources} onReplaceAll={formula.replaceAll} />
        ) : (
          <>
            <FormulaEditor
              autoFocus
              value={formula.source ?? ""}
              scope={formula.scope}
              onChange={formula.change}
              placeholder="opacity * 100"
            />
            <ResultLine analysis={formula.analysis} />
            <DiagnosticsList analysis={formula.analysis} />
          </>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`${slot.label} Formula, showing ${formula.resultText}`}
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm bg-muted/50 px-1.5 text-left text-sm",
        formula.blocked && "ring-1 ring-destructive",
      )}
      onClick={() => formula.begin(formula.source ?? "")}
    >
      <FormulaGlyph blocked={formula.blocked} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate underline decoration-dotted underline-offset-4",
          formula.blocked && "text-destructive",
        )}
      >
        {formula.sources.length > 1 ? `${formula.sources.length} Formulas` : formula.resultText}
      </span>
    </button>
  );
}
