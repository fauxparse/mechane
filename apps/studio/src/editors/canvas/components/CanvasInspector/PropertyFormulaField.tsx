import {
  cn,
  FormulaFlyout,
  type FormulaFlyoutAnchor,
  type PropertyInputFormula,
  type PropertyInputMenuItem,
} from "@mechane/design-system";
import type { Element } from "@mechane/domain/canvas";
import { analyse, type FormulaAnalysis, type FormulaScope } from "@mechane/domain/formula";
import type { PropertyFormula } from "@mechane/domain/property-values";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";

const WRITE_A_FORMULA = "write-a-formula";
const EDIT_FORMULA = "edit-formula";
const REMOVE_FORMULA = "remove-formula";

/** How one Property reads, writes and displays a Formula on each selected Element. */
export interface PropertyFormulaBinding {
  readonly label: string;
  readonly scope: FormulaScope;
  formulaOf(element: Element): PropertyFormula | null;
  /** The text an author edits for a stored Formula. */
  sourceOf(formula: PropertyFormula): string;
  /** Where a new Formula starts on this Element: what its Variable connection reads, if any. */
  seedOf(element: Element): string | null;
  /** What the row reads at rest: what the Artboard renders for this Formula. */
  restingText(formula: PropertyFormula, analysis: FormulaAnalysis): string;
  /** Suffix the `=` line appends to a draft's result, such as a size's `%`. */
  resultSuffix?(source: string): string;
  /** Properties that make this Element's Property the Formula `source`, keeping its own fallback. */
  write(element: Element, source: string): Record<string, unknown>;
  /** Properties that put this Element's retained literal back. */
  remove(element: Element, formula: PropertyFormula): Record<string, unknown>;
}

/** What the row's `PropertyInput` needs to carry a Formula, or to start one. */
export interface PropertyFormulaEntry {
  readonly formula: PropertyInputFormula | null;
  readonly menuItems: readonly PropertyInputMenuItem[];
  onMenuItemSelect(value: string): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
}

/** The Elements a draft was opened for, so a press that reselects cannot redirect it. */
type Session = { readonly targets: readonly Element[]; readonly draft: string };

/**
 * A Property row that can carry a Formula (#711 Variant D, #733). Typing `=` over the whole entry,
 * choosing *Write a Formula*, or pressing the row's Formula button opens the design-system
 * flyout beside the sidebar; the draft applies on Enter, blur or a press outside as one edit, so
 * the Artboard recomputes once.
 */
export function PropertyFormulaField({
  binding,
  className,
  children,
}: {
  binding: PropertyFormulaBinding;
  className?: string;
  children(entry: PropertyFormulaEntry): ReactNode;
}) {
  const { selected, update, updateElements } = useCanvasInspectorContext();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const selectionKey = selected.map((element) => element.id).join("|");
  const open =
    session !== null && session.targets.map((element) => element.id).join("|") === selectionKey;

  const carriers = selected.flatMap((element) => {
    const formula = binding.formulaOf(element);
    return formula ? [{ element, formula }] : [];
  });
  const sources = [...new Set(carriers.map(({ formula }) => binding.sourceOf(formula)))];
  const everyElementCarries = carriers.length === selected.length;
  const mixed = sources.length > 1 || (carriers.length > 0 && !everyElementCarries);
  const source = mixed ? null : (sources[0] ?? null);
  const first = carriers[0]?.formula ?? null;
  const analysis = source === null ? null : analyse(source, binding.scope);
  // The row only marks a blocked Formula; its message is the flyout's, one click away.
  const blocked =
    analysis?.diagnostics.some((diagnostic) => diagnostic.severity === "blocking") === true;

  const write = (updates: readonly { element: Element; properties: Record<string, unknown> }[]) => {
    if (updateElements) {
      if (updates.length > 0)
        updateElements(
          updates.map(({ element, properties }) => ({ elementId: element.id, properties })),
        );
    } else if (updates[0]) {
      update(updates[0].properties);
    }
  };
  const removal = (targets: readonly Element[]) =>
    targets.flatMap((element) => {
      const formula = binding.formulaOf(element);
      return formula ? [{ element, properties: binding.remove(element, formula) }] : [];
    });

  const begin = (draft: string) => {
    const next = { targets: selected, draft };
    sessionRef.current = next;
    setSession(next);
  };
  // The row's Formula button toggles: pressing it on an open flyout applies the draft and closes.
  const start = () => {
    if (sessionRef.current) apply();
    else begin(source ?? (selected[0] ? binding.seedOf(selected[0]) : null) ?? "");
  };
  const changeDraft = (draft: string) => {
    const current = sessionRef.current;
    if (!current) return;
    const next = { ...current, draft };
    sessionRef.current = next;
    setSession(next);
  };
  const end = () => {
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    return current;
  };
  // The Elements as they are now, for the ones the session was opened on.
  const current = (targets: readonly Element[]) =>
    targets.map((target) => selected.find((element) => element.id === target.id) ?? target);

  const apply = () => {
    const ended = end();
    // Mixed opens no editor, so there is no draft to apply.
    if (!ended || mixed) return;
    const targets = current(ended.targets);
    const { draft } = ended;
    if (draft.trim() === "") {
      write(removal(targets));
      return;
    }
    const unchanged = targets.every((element) => {
      const formula = binding.formulaOf(element);
      return formula !== null && binding.sourceOf(formula) === draft;
    });
    if (!unchanged)
      write(targets.map((element) => ({ element, properties: binding.write(element, draft) })));
  };
  const remove = () => {
    const ended = end();
    write(removal(ended ? current(ended.targets) : selected));
  };
  const replaceAll = () => {
    const replacement = sources[0];
    if (replacement === undefined) return;
    write(
      selected.map((element) => ({ element, properties: binding.write(element, replacement) })),
    );
    begin(replacement);
  };

  const formula: PropertyInputFormula | null =
    carriers.length > 0
      ? {
          text: mixed
            ? everyElementCarries
              ? `${sources.length} Formulas`
              : "Mixed"
            : first && analysis
              ? binding.restingText(first, analysis)
              : "",
          source: source ?? undefined,
          blocked,
          onOpen: start,
        }
      : null;

  const entry: PropertyFormulaEntry = {
    formula,
    menuItems: formula
      ? [
          { value: EDIT_FORMULA, label: "Edit Formula" },
          { value: REMOVE_FORMULA, label: "Remove Formula" },
        ]
      : [{ value: WRITE_A_FORMULA, label: "Write a Formula" }],
    onMenuItemSelect(value) {
      if (value === WRITE_A_FORMULA || value === EDIT_FORMULA) start();
      else if (value === REMOVE_FORMULA) remove();
    },
    onKeyDown(event) {
      if (formula || event.key !== "=") return;
      const input = event.currentTarget;
      const wholeEntry =
        input.value === "" ||
        (input.selectionStart === 0 && input.selectionEnd === input.value.length);
      if (!wholeEntry) return;
      event.preventDefault();
      start();
    },
  };

  // Clear of the sidebar, not just the row: an H row's flyout must not cover W. Level with the
  // row, at the sidebar's edge; outside a sidebar (Storybook) the row itself.
  const anchor: FormulaFlyoutAnchor = {
    getBoundingClientRect: () => {
      const row = rowRef.current?.getBoundingClientRect() ?? new DOMRect();
      const column = rowRef.current?.closest("[data-slot=sidebar-inner]")?.getBoundingClientRect();
      return column ? new DOMRect(column.left, row.top, 0, row.height) : row;
    },
  };

  return (
    <div ref={rowRef} className={cn("flex min-w-0 flex-col gap-1", className)}>
      {children(entry)}
      <FormulaFlyout
        open={open}
        anchor={anchor}
        returnFocus={() => rowRef.current?.querySelector("input")}
        trigger={() => rowRef.current}
        label={binding.label}
        selectionCount={selected.length}
        scope={binding.scope}
        draft={session?.draft ?? ""}
        onDraftChange={changeDraft}
        resultSuffix={session ? binding.resultSuffix?.(session.draft) : undefined}
        mixed={mixed ? { sources, carriers: carriers.length } : null}
        canRemove={carriers.length > 0}
        onApply={apply}
        onCancel={end}
        onRemove={remove}
        onReplaceAll={replaceAll}
      />
    </div>
  );
}
