// PROTOTYPE (issue #711) — where a Property's Formula lives while the prototype runs.
//
// In memory only. The stored shape of a Formula-valued Property is a separate
// ticket, so nothing here is written to the document; what *is* written to the
// document is the Formula's evaluated result, through the inspector's ordinary
// update path, because "the canvas is the preview" is one of the questions and
// a faked canvas would not answer it.
import { useSyncExternalStore } from "react";

export type FormulaKey = string;

export const formulaKey = (elementId: string, property: string): FormulaKey =>
  `${elementId}::${property}`;

type Store = {
  /** Formula source per Element + Property. */
  readonly sources: Readonly<Record<FormulaKey, string>>;
  /** The Property whose editor is open, for the variants that open one at a time. */
  readonly open: FormulaKey | null;
};

let store: Store = { sources: {}, open: null };
const listeners = new Set<() => void>();

const emit = (next: Store) => {
  store = next;
  for (const listener of listeners) listener();
};

export const subscribeFormulas = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const formulaSnapshot = (): Store => store;

export const useFormulaStore = (): Store =>
  useSyncExternalStore(subscribeFormulas, formulaSnapshot, formulaSnapshot);

export function setFormula(keys: readonly FormulaKey[], source: string): void {
  const sources = { ...store.sources };
  for (const key of keys) sources[key] = source;
  emit({ ...store, sources });
}

export function clearFormula(keys: readonly FormulaKey[]): void {
  const sources = { ...store.sources };
  for (const key of keys) delete sources[key];
  emit({ ...store, sources, open: keys.includes(store.open ?? "") ? null : store.open });
}

export function openFormula(key: FormulaKey | null): void {
  if (store.open === key) return;
  emit({ ...store, open: key });
}

/** Every Property currently carrying a Formula on one of these Elements. */
export function formulasFor(
  sources: Readonly<Record<FormulaKey, string>>,
  elementIds: readonly string[],
): readonly { key: FormulaKey; elementId: string; property: string; source: string }[] {
  const ids = new Set(elementIds);
  return Object.entries(sources).flatMap(([key, source]) => {
    const separator = key.indexOf("::");
    const elementId = key.slice(0, separator);
    if (!ids.has(elementId)) return [];
    return [{ key, elementId, property: key.slice(separator + 2), source }];
  });
}
