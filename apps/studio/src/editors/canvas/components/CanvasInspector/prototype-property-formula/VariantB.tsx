// PROTOTYPE (issue #711) — Variant B: the row never grows.
//
// The argument: a dense one-row-per-Property sidebar stays dense. A Formula is
// authored in a flyout anchored to its row that *escapes the sidebar* over the
// canvas, so the editor is 420px wide instead of a 270px column — the standing
// cost #675 recorded — and the Artboard stays visible beside it as you type.
// At rest the row is still exactly one row: result, plus a lit `fx` button.
import { Button, cn, InputGroupButton, Trash2Icon, XIcon } from "@mechane/design-system";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { FormulaEditor } from "../../../../show/graph/formula/FormulaEditor";
import {
  BlockedMark,
  DiagnosticsList,
  FormulaGlyph,
  MixedFormulas,
  ReadingNow,
  ResultLine,
} from "./variant-parts";
import type { FormulaSlot, PropertyFormula } from "./use-property-formula";
import type { FormulaInputOverrides } from "./variant-contract";

const FLYOUT_WIDTH = 420;
const GUTTER = 12;

export function variantBOverrides(
  formula: PropertyFormula,
  anchorRef: React.RefObject<HTMLDivElement | null>,
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
  anchorRef: React.RefObject<HTMLDivElement | null>;
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

export function VariantBFlyout({
  formula,
  slot,
  anchorRef,
}: {
  formula: PropertyFormula;
  slot: FormulaSlot;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!formula.open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({
      top: Math.min(rect.top, window.innerHeight - 320),
      left: Math.max(GUTTER, rect.left - FLYOUT_WIDTH - GUTTER),
    });
  }, [formula.open, anchorRef]);

  useEffect(() => {
    if (!formula.open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      formula.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") formula.close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  if (!formula.open || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ top: position.top, left: position.left, width: FLYOUT_WIDTH }}
      className="fixed z-50 flex flex-col gap-2 rounded-lg bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-2">
        <FormulaGlyph />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{slot.label}</span>
        <span className="text-xs text-muted-foreground">
          {formula.selectionCount === 1 ? "1 Element" : `${formula.selectionCount} Elements`}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close the Formula editor"
          onClick={formula.close}
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
          <ReadingNow entries={formula.entries} />
        </>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            formula.remove();
            formula.close();
          }}
        >
          <Trash2Icon /> Remove Formula
        </Button>
      </div>
    </div>,
    document.body,
  );
}
