import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  analyse,
  previewText,
  type FormulaAnalysis,
  type FormulaScope,
} from "@mechane/domain/formula";
import { FlaskConicalIcon as FormulaIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../button";
import { Popover, PopoverContent } from "../popover";
import { FormulaEditor } from "./formula-editor";

export const FORMULA_FLYOUT_WIDTH = 420;

export type FormulaFlyoutAnchor = PopoverPrimitive.Positioner.Props["anchor"];

export interface FormulaFlyoutProps {
  readonly open: boolean;
  /**
   * What the flyout sits beside. A host that wants it clear of a sidebar passes a virtual
   * element at the sidebar's edge, level with the row.
   */
  readonly anchor: FormulaFlyoutAnchor;
  /** Where focus goes after Enter or Esc closes the flyout; a press elsewhere keeps its focus. */
  readonly returnFocus?: () => HTMLElement | null | undefined;
  /**
   * The control that opens the flyout, usually its row. A press on it is not a press outside:
   * the host decides what it does, so pressing the trigger of an open flyout can close it rather
   * than apply on pointerdown and reopen on click.
   */
  readonly trigger?: () => Element | null | undefined;
  readonly label: string;
  readonly selectionCount: number;
  readonly scope: FormulaScope;
  readonly draft: string;
  onDraftChange(draft: string): void;
  /** Appended to a present result on the `=` line, such as a size's `%`. */
  readonly resultSuffix?: string;
  /**
   * The selection disagrees: some Elements carry other Formulas, or none. No editor opens,
   * because a controlled editor handed one Formula would write it over the rest.
   */
  readonly mixed?: { readonly sources: readonly string[]; readonly carriers: number } | null;
  readonly canRemove: boolean;
  /** Enter, the close button, focus leaving, or a press outside: keep the draft. */
  onApply(): void;
  /** Escape: discard the draft. */
  onCancel(): void;
  onRemove(): void;
  onReplaceAll(): void;
}

/**
 * The Formula editor as a flyout beside the Property it drives (#711 Variant D, #733): the
 * CodeMirror editor, its `=` result, diagnostics, and what the Formula is reading. Presentational;
 * the host owns the draft and decides what applying it writes.
 */
export function FormulaFlyout({
  open,
  anchor,
  returnFocus,
  trigger,
  label,
  selectionCount,
  scope,
  draft,
  onDraftChange,
  resultSuffix = "",
  mixed,
  canRemove,
  onApply,
  onCancel,
  onRemove,
  onReplaceAll,
}: FormulaFlyoutProps) {
  const analysis = draft.trim() === "" ? null : analyse(draft, scope);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const applyRef = useRef(onApply);
  const triggerRef = useRef(trigger);
  useEffect(() => {
    applyRef.current = onApply;
    triggerRef.current = trigger;
  }, [onApply, trigger]);
  const onTrigger = (target: EventTarget | null) =>
    target instanceof Node && Boolean(triggerRef.current?.()?.contains(target));
  // Enter and Esc hand focus back to the row; a press elsewhere keeps the focus it moved. The
  // host closes the popup through `open`, so Base UI's own focus return is not the one to use.
  const focusBack = () => setTimeout(() => returnFocus?.()?.focus(), 0);
  const submit = () => {
    onApply();
    focusBack();
  };
  const cancel = () => {
    onCancel();
    focusBack();
  };
  // A press outside applies at pointerdown, before whatever the press goes on to do: a Canvas
  // click selects another Element first, and the draft belongs to the one it was written for.
  // CodeMirror portals completion and lint tooltips to the body; pressing one is not leaving.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && popupRef.current?.contains(target)) return;
      if (onTrigger(target)) return;
      if (isInCodeMirrorTooltip(target)) return;
      applyRef.current();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        // Presses outside were applied at pointerdown; Base UI's own dismissal follows on click.
        if (details.reason === "outside-press") return;
        // Focus moving to the trigger is a press on it, which the host answers.
        if (
          details.reason === "focus-out" &&
          details.event instanceof FocusEvent &&
          onTrigger(details.event.relatedTarget)
        )
          return;
        if (details.reason === "escape-key") cancel();
        else onApply();
      }}
    >
      <PopoverContent
        ref={popupRef}
        anchor={anchor}
        // The flyout owns Escape: a host Canvas would otherwise read it as "clear selection".
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }}
        side="left"
        align="start"
        sideOffset={12}
        finalFocus={false}
        aria-label={`${label} Formula`}
        data-slot="formula-flyout"
        className="gap-0 p-0 rounded-md ring-border"
        style={{ width: FORMULA_FLYOUT_WIDTH }}
      >
        <div className="flex items-center gap-2 p-1 pl-2">
          <FormulaIcon className="text-muted-foreground size-4" />
          <span className="min-w-0 flex-1 truncate label">{label}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            className="opacity-50 hover:opacity-100 hover:bg-transparent"
            aria-label="Close the Formula editor"
            onClick={onApply}
          >
            <XIcon />
          </Button>
        </div>
        {mixed ? (
          <MixedFormulas
            sources={mixed.sources}
            carriers={mixed.carriers}
            selectionCount={selectionCount}
            onReplaceAll={onReplaceAll}
          />
        ) : (
          <>
            <FormulaEditor
              autoFocus
              className="rounded-none border-l-0 border-r-0 border-border focus-within:ring-0"
              value={draft}
              scope={scope}
              onChange={onDraftChange}
              onSubmit={submit}
            />
            <ResultLine analysis={analysis} suffix={resultSuffix} />
          </>
        )}
        <div className="flex items-center justify-between gap-2 p-2">
          <span className="text-xs text-muted-foreground">
            {mixed ? null : "Enter applies · Esc cancels"}
          </span>
          {canRemove ? (
            <Button size="sm" variant="destructive" className="text-destructive" onClick={onRemove}>
              <Trash2Icon /> Remove Formula
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isInCodeMirrorTooltip(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const element = target instanceof Element ? target : target.parentElement;
  return Boolean(element?.closest(".cm-tooltip"));
}

function ResultLine({ analysis, suffix }: { analysis: FormulaAnalysis | null; suffix: string }) {
  const value = analysis?.value ?? null;
  const present = value !== null && value.kind !== "absent" && value.kind !== "failure";
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-2 p-2 pb-0">
      <span className="font-mono text-xs text-muted-foreground">=</span>
      <span
        className={cn(
          "truncate text-xs",
          analysis?.blocked ? "text-destructive" : "text-foreground",
        )}
      >
        {analysis?.blocked
          ? "can't be evaluated yet"
          : `${previewText(value)}${present ? suffix : ""}`}
      </span>
    </div>
  );
}

function _DiagnosticsList({ analysis }: { analysis: FormulaAnalysis | null }) {
  if (!analysis?.diagnostics.length) return null;
  return (
    <ul className="space-y-1">
      {analysis.diagnostics.map((diagnostic, index) => (
        <li
          key={`${diagnostic.category}-${diagnostic.from}-${index}`}
          className={cn(
            "text-xs leading-snug",
            diagnostic.severity === "blocking" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {diagnostic.message}
          <span className="ml-1 opacity-60">
            · {diagnostic.severity === "blocking" ? "blocks publishing" : "right now"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function _ReadingNow({ scope }: { scope: FormulaScope }) {
  const entries = [...(scope.itemBinding ? [scope.itemBinding] : []), ...scope.ports];
  return (
    <div className="space-y-1 text-xs">
      <span className="font-medium">Reading now</span>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">There are no Variables to read.</p>
      ) : (
        <ul className="space-y-0.5 text-muted-foreground">
          {entries.map((entry) => (
            <li key={entry.name} className="truncate">
              <span className="font-mono text-foreground">{entry.name}</span>:{" "}
              {previewText(entry.value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MixedFormulas({
  sources,
  carriers,
  selectionCount,
  onReplaceAll,
}: {
  sources: readonly string[];
  carriers: number;
  selectionCount: number;
  onReplaceAll(): void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {carriers === selectionCount
          ? `${sources.length} different Formulas across this selection.`
          : `${carriers} of ${selectionCount} Elements carry a Formula.`}
      </p>
      <ul className="space-y-0.5">
        {sources.map((source) => (
          <li key={source} className="truncate font-mono text-xs text-foreground">
            = {source}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={onReplaceAll}>
        Replace all with the first
      </Button>
    </div>
  );
}
