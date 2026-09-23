// PROTOTYPE (issue #711) — the floating editor, shared by Variants B and D.
//
// Anchored to its Property row and portalled to the body, so it escapes the
// sidebar's 304px column and sits over the canvas: 394px of editor instead of
// 258px, and the Artboard stays visible beside it while you type. The sidebar's
// layout never moves.
import { Button, Trash2Icon, XIcon } from "@mechane/design-system";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { FormulaEditor } from "../../../../show/graph/formula/FormulaEditor";
import type { FormulaSlot, PropertyFormula } from "./use-property-formula";
import {
  DiagnosticsList,
  FormulaGlyph,
  MixedFormulas,
  ReadingNow,
  ResultLine,
} from "./variant-parts";

export const FLYOUT_WIDTH = 420;
const GUTTER = 12;

export function FormulaFlyout({
  formula,
  slot,
  anchorRef,
}: {
  formula: PropertyFormula;
  slot: FormulaSlot;
  anchorRef: RefObject<HTMLDivElement | null>;
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
