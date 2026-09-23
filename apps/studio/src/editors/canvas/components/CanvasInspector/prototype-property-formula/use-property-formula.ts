// PROTOTYPE (issue #711) — everything a Property row needs to show a Formula.
//
// One hook for all three variants, so they disagree about presentation and
// nothing else. It owns the write-through that makes the Artboard the live
// preview: whenever the Formula evaluates, its result is written as an ordinary
// literal through the inspector's normal update path, debounced so a burst of
// typing is one edit rather than one per keystroke.
import type { LucideIcon } from "@mechane/design-system";
import {
  previewText,
  type FormulaAnalysis,
  type FormulaScope,
  type ShapeValue,
  type Type,
} from "@mechane/domain";
import { useEffect, useMemo, useRef } from "react";

import { useCanvasInspectorContext } from "../CanvasInspectorContext";
import {
  clearFormula,
  formulaKey,
  openFormula,
  setFormula,
  useFormulaStore,
  type FormulaKey,
} from "./formula-state";
import {
  analyseProperty,
  expectedTypeFor,
  propertyFormulaScope,
  resultAsShapeValue,
  type ScopeEntry,
} from "./property-scope";

const WRITE_THROUGH_DELAY = 180;

export interface FormulaSlot {
  /** The Property's own leading icon, kept at rest and badged rather than replaced. */
  readonly icon?: LucideIcon | string;
  /** Stable Property key; `sizing.width` for the dimension inputs. */
  readonly property: string;
  readonly label: string;
  readonly type: Type;
  /** Writes an evaluated literal onto every selected Element. */
  commit(value: ShapeValue): void;
}

export interface PropertyFormula {
  readonly keys: readonly FormulaKey[];
  /** The Formula, when the whole selection agrees on one. */
  readonly source: string | null;
  /** Distinct Formulas across the selection; length > 1 is the Mixed case. */
  readonly sources: readonly string[];
  /**
   * Two or more different Formulas across the selection. No surface opens an
   * editor in this state: a controlled editor handed one value would report it
   * straight back and silently overwrite every other Formula.
   */
  readonly mixed: boolean;
  readonly active: boolean;
  readonly open: boolean;
  readonly analysis: FormulaAnalysis | null;
  readonly blocked: boolean;
  readonly resultText: string;
  readonly scope: FormulaScope;
  readonly entries: readonly ScopeEntry[];
  readonly selectionCount: number;
  begin(initial: string): void;
  /** Opens the editor on an existing Formula without touching its source. */
  reopen(): void;
  change(next: string): void;
  close(): void;
  remove(): void;
  replaceAll(): void;
}

export function usePropertyFormula(slot: FormulaSlot): PropertyFormula {
  const { selected, variables, shapes } = useCanvasInspectorContext();
  const { sources: stored, open } = useFormulaStore();

  const keys = useMemo(
    () => selected.map((element) => formulaKey(element.id, slot.property)),
    [selected, slot.property],
  );
  const present = keys
    .map((key) => stored[key])
    .filter((value): value is string => value !== undefined);
  const distinct = [...new Set(present)];
  const source =
    present.length === keys.length && distinct.length === 1 ? (distinct[0] ?? null) : null;

  const { scope, entries } = useMemo(
    () => propertyFormulaScope(variables, shapes, expectedTypeFor(slot.type)),
    [variables, shapes, slot.type],
  );
  const analysis = useMemo(() => analyseProperty(source ?? "", scope), [source, scope]);

  const commitRef = useRef(slot.commit);
  commitRef.current = slot.commit;
  const writtenRef = useRef<string | null>(null);
  const result = analysis?.blocked === false ? resultAsShapeValue(analysis.value, slot.type) : null;
  const serialised = result ? JSON.stringify(result) : null;

  useEffect(() => {
    if (serialised === null || serialised === writtenRef.current) return;
    const timer = setTimeout(() => {
      writtenRef.current = serialised;
      commitRef.current(JSON.parse(serialised) as ShapeValue);
    }, WRITE_THROUGH_DELAY);
    return () => clearTimeout(timer);
  }, [serialised]);

  const openKey = keys[0] ?? null;
  return {
    keys,
    source,
    sources: distinct,
    mixed: distinct.length > 1,
    active: present.length > 0,
    open: openKey !== null && open === openKey,
    analysis,
    blocked: analysis?.blocked === true,
    resultText: analysis?.blocked ? "can't be evaluated yet" : previewText(analysis?.value ?? null),
    scope,
    entries,
    selectionCount: selected.length,
    begin(initial) {
      setFormula(keys, initial);
      openFormula(openKey);
    },
    change(next) {
      setFormula(keys, next);
    },
    reopen() {
      openFormula(openKey);
    },
    close() {
      openFormula(null);
    },
    remove() {
      writtenRef.current = null;
      clearFormula(keys);
    },
    replaceAll() {
      const first = distinct[0] ?? "";
      setFormula(keys, first);
      openFormula(openKey);
    },
  };
}
