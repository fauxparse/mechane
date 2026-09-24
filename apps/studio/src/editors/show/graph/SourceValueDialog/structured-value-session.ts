import { formatValuePath } from "@mechane/domain/graph";
import { sourceValuesEqual } from "../inspector/source-values-helpers";
import { useState } from "react";
import type { ArrayValueFocus } from "./ArrayValueEditor/types";

export interface StructuredValueSession {
  readonly value: unknown;
  readonly savedValue: unknown;
  readonly errors: Map<string, string>;
  readonly focus: ArrayValueFocus;
  readonly pendingFocus: ArrayValueFocus | null;
  readonly navigationError: string | null;
  readonly columnSizes?: Record<string, number>;
  readonly dirty: boolean;
  change(value: unknown): void;
  changeImmediately(value: unknown): void;
  reportValidity(path: readonly (string | number)[], error: string | null): void;
  requestFocus(focus: ArrayValueFocus): void;
  commit(): boolean;
  commitColumnSizes(columnSizes: Record<string, number>): void;
  discardPendingFocus(): void;
  cancelPendingFocus(): void;
  savePendingFocus(): boolean;
}

export function useStructuredValueSession({
  initialValue,
  initialColumnSizes,
  onCommit,
  onImmediateChange,
  onColumnSizesCommit,
}: {
  initialValue: unknown;
  initialColumnSizes?: Record<string, number>;
  onCommit(value: unknown): string | null;
  onImmediateChange?(value: unknown): void;
  onColumnSizesCommit?(columnSizes: Record<string, number>): void;
}): StructuredValueSession {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [columnSizes, setColumnSizes] = useState(initialColumnSizes);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [focus, setFocus] = useState<ArrayValueFocus>({ kind: "array" });
  const [pendingFocus, setPendingFocus] = useState<ArrayValueFocus | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const dirty = !sourceValuesEqual(value, savedValue);

  const change = (next: unknown) => {
    setErrors(new Map());
    setValue(next);
  };
  const changeImmediately = (next: unknown) => {
    onImmediateChange?.(next);
    if (onImmediateChange) setSavedValue(next);
  };
  const reportValidity = (path: readonly (string | number)[], error: string | null) => {
    setErrors((current) => {
      const next = new Map(current);
      const key = formatValuePath(path.map(String));
      if (error) next.set(key, error);
      else next.delete(key);
      return next;
    });
  };
  const commit = () => {
    if (!dirty) return true;
    const conflict = onCommit(value);
    if (conflict) {
      setErrors(new Map([["conflict", conflict]]));
      setNavigationError(conflict);
      return false;
    }
    setSavedValue(value);
    return true;
  };
  const commitColumnSizes = (nextColumnSizes: Record<string, number>) => {
    onColumnSizesCommit?.(nextColumnSizes);
    setColumnSizes(nextColumnSizes);
  };
  const requestFocus = (nextFocus: ArrayValueFocus) => {
    if (
      (nextFocus.kind === "array" && focus.kind === "array") ||
      (nextFocus.kind === "record" && focus.kind === "record" && focus.id === nextFocus.id)
    )
      return;
    if (dirty) {
      setNavigationError(null);
      setPendingFocus(nextFocus);
      return;
    }
    setFocus(nextFocus);
  };
  const discardPendingFocus = () => {
    if (!pendingFocus) return;
    setValue(savedValue);
    setErrors(new Map());
    setNavigationError(null);
    setPendingFocus(null);
    setFocus(pendingFocus);
  };
  const cancelPendingFocus = () => {
    setPendingFocus(null);
    setNavigationError(null);
  };
  const savePendingFocus = () => {
    const nextFocus = pendingFocus;
    if (!nextFocus || !commit()) return false;
    setPendingFocus(null);
    setNavigationError(null);
    setFocus(nextFocus);
    return true;
  };

  return {
    value,
    savedValue,
    errors,
    focus,
    pendingFocus,
    navigationError,
    columnSizes,
    dirty,
    change,
    changeImmediately,
    reportValidity,
    requestFocus,
    commit,
    commitColumnSizes,
    discardPendingFocus,
    cancelPendingFocus,
    savePendingFocus,
  };
}
