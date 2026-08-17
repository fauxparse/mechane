import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ShapeValue } from "@mechane/domain";

import { parseHexColor, rgbaToHex } from "./color-utils";
import type {
  PropertyInputProps,
  PropertyInputSizing,
  PropertyInputType,
  PropertyInputValue,
  VariableReference,
} from "./property-input-types";

const isVariableReference = (value: unknown): value is VariableReference =>
  typeof value === "object" && value !== null && "id" in value && "name" in value;

const getInputType = (
  value: PropertyInputValue<ShapeValue> | null | undefined,
  fallback: PropertyInputType,
): PropertyInputType => {
  const kind = isVariableReference(value) ? value.current?.kind : value?.kind;
  const variableType = isVariableReference(value) ? value.type : undefined;

  if (kind === "number" || variableType === "number") return "number";
  if (kind === "color" || variableType === "color") return "color";
  if (kind === "text" || variableType === "text") return "text";
  return fallback;
};

const getDisplayValue = (
  value: PropertyInputValue<ShapeValue> | null | undefined,
): ShapeValue | null => (isVariableReference(value) ? (value.current ?? null) : (value ?? null));

export const getValueText = (value: ShapeValue | null | undefined): string =>
  value === null || value === undefined ? "" : String(value.value);

export const formatValueText = (
  value: ShapeValue | null | undefined,
  _dimension?: "width" | "height",
  unit?: "px" | "%",
): string => {
  const text = getValueText(value);
  return unit === "%" && value?.kind === "number" && text !== "" ? `${text}%` : text;
};

export const getColorInputValue = (value: string): string => {
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) return value;
  if (/^#[0-9a-f]{3,4}$/i.test(value)) {
    return `#${value
      .slice(1)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }
  return "#000000";
};

const createValue = <T extends ShapeValue>(type: PropertyInputType, value: string | number): T =>
  ({
    kind: type === "color" ? "color" : type,
    value,
  }) as T;

const handleEscapeKey = (event: KeyboardEvent<HTMLInputElement>, onEscape: () => void) => {
  if (event.key === "Escape") {
    event.preventDefault();
    onEscape();
  }
};

export function usePropertyInput<T extends ShapeValue>({
  value,
  type = "text",
  dimension,
  unit = "px",
  sizing,
  variables,
  min,
  max,
  step,
  presets,
  allowAuto = false,
  auto = false,
  scrubScale = 2,
  onChange,
  onSizingChange,
  onAutoChange,
  constraints,
  onConstraintToggle,
}: PropertyInputProps<T>) {
  const [uncontrolledValue, setUncontrolledValue] = useState<PropertyInputValue<T> | null>(
    value ?? null,
  );
  const [uncontrolledSizing, setUncontrolledSizing] = useState<PropertyInputSizing>("fixed");
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [variableQuery, setVariableQuery] = useState("");
  const [editingVariable, setEditingVariable] = useState<VariableReference | null>(null);
  const [draftInputValue, setDraftInputValue] = useState<string | null>(null);
  const draftInputRef = useRef<string | null>(null);
  const inputElementRef = useRef<HTMLInputElement | null>(null);
  const scrubOrigin = useRef<{ x: number; value: number } | null>(null);

  const displayedValue = value === undefined ? uncontrolledValue : value;
  const connectedVariable = isVariableReference(displayedValue) ? displayedValue : null;
  const linkedVariable = connectedVariable && editingVariable === null ? connectedVariable : null;
  const currentValue = getDisplayValue(displayedValue);
  const inputType = getInputType(displayedValue, type);
  const currentSizing = sizing ?? uncontrolledSizing;
  const displayText = formatValueText(currentValue, dimension, unit);
  const inputText = linkedVariable ? "" : (draftInputValue ?? displayText);
  const colorText = draftInputValue ?? displayText;
  const filteredVariables = useMemo(() => {
    const query = variableQuery.trim().toLocaleLowerCase();
    const availableVariables = variables ?? [];
    return query.length === 0
      ? availableVariables
      : availableVariables.filter((variable) => variable.name.toLocaleLowerCase().includes(query));
  }, [variableQuery, variables]);

  const commit = (nextValue: PropertyInputValue<T> | null) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onChange?.(nextValue);
  };

  const updateDraftInput = (nextValue: string | null) => {
    if (inputType === "color" && nextValue !== null && !/^#?[0-9a-f]{0,8}$/i.test(nextValue)) {
      return;
    }
    draftInputRef.current = nextValue;
    setDraftInputValue(nextValue);
    // The color picker emits draft values continuously while dragging; valid samples must reach
    // controlled consumers immediately so renderers can paint the current color.
    if (inputType === "color" && nextValue !== null) {
      const parsed = parseHexColor(nextValue);
      if (parsed) commit(createValue<T>(inputType, rgbaToHex(parsed)));
    }
  };

  const parseInputValue = (rawValue: string): PropertyInputValue<T> | null | undefined => {
    if (inputType === "color") {
      const parsed = parseHexColor(rawValue);
      return parsed ? createValue<T>(inputType, rgbaToHex(parsed)) : undefined;
    }
    if (inputType !== "number") return createValue<T>(inputType, rawValue);

    const numericValue = rawValue.replace(/%/g, "").trim();
    if (numericValue === "") return null;
    const parsed = Number(numericValue);
    if (!Number.isFinite(parsed)) return undefined;
    return createValue<T>(inputType, Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed)));
  };

  const commitRawValue = (rawValue: string | number) => {
    commit(createValue<T>(inputType, rawValue));
  };

  const commitDraftInput = () => {
    const rawValue = draftInputRef.current;
    if (rawValue === null) return;
    const nextValue = parseInputValue(rawValue);
    const sameColor =
      inputType === "color" &&
      nextValue !== null &&
      nextValue !== undefined &&
      !isVariableReference(nextValue) &&
      nextValue.kind === "color" &&
      currentValue?.kind === "color" &&
      nextValue.value === currentValue.value;
    if (nextValue !== undefined && !sameColor) commit(nextValue);
    updateDraftInput(null);
  };

  const cancelDraft = () => {
    updateDraftInput(null);
    if (editingVariable) {
      commit(editingVariable);
      setEditingVariable(null);
    }
  };
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      (
        event as KeyboardEvent<HTMLInputElement> & { preventBaseUIHandler?: () => void }
      ).preventBaseUIHandler?.();
      commitDraftInput();
      return;
    }
    if (event.key === "Backspace" && linkedVariable && connectedVariable) {
      event.preventDefault();
      setEditingVariable(connectedVariable);
      updateDraftInput(formatValueText(connectedVariable.current, dimension, unit));
      commit((connectedVariable.current ?? null) as PropertyInputValue<T> | null);
      return;
    }
    handleEscapeKey(event, cancelDraft);
  };

  const handleScrubPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (linkedVariable || currentValue?.kind !== "number") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubOrigin.current = { x: event.clientX, value: currentValue.value };
  };

  const handleScrubPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!scrubOrigin.current || currentValue?.kind !== "number") return;
    const scrubUnit = step && step > 0 ? step : 1;
    const scale = Math.max(0.1, scrubScale);
    const delta =
      Math.round((event.clientX - scrubOrigin.current.x) / scale / scrubUnit) * scrubUnit;
    const nextValue = Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, scrubOrigin.current.value + delta),
    );
    commitRawValue(nextValue);
  };

  const handleScrubPointerEnd = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrubOrigin.current = null;
  };

  const commitSizing = (nextSizing: PropertyInputSizing) => {
    if (sizing === undefined) setUncontrolledSizing(nextSizing);
    onSizingChange?.(nextSizing);
  };

  const handleMenuValueChange = (menuValue: string | null) => {
    const preset = presets?.find((value) => String(value) === menuValue);
    if (preset === "auto" && allowAuto) {
      onAutoChange?.(true);
      updateDraftInput(null);
      return;
    }
    if (preset !== undefined) {
      const value = inputType === "number" ? preset : String(preset);
      commit(createValue<T>(inputType, value));
      updateDraftInput(null);
      return;
    }
    if (menuValue === "fixed" || menuValue === "fill" || menuValue === "hug") {
      commitSizing(menuValue);
    }
    if (menuValue === "auto" && allowAuto) {
      onAutoChange?.(true);
    }
    if (menuValue === "add-min" || menuValue === "add-max") {
      const constraint = menuValue === "add-min" ? "min" : "max";
      onConstraintToggle?.(constraint, !constraints?.[constraint]);
    }
    if (menuValue === "connect") {
      setVariableQuery("");
      setVariablesOpen(true);
    }
  };

  const selectVariable = (variable: VariableReference) => {
    setEditingVariable(null);
    updateDraftInput(null);
    commit(variable);
    setVariablesOpen(false);
  };

  const disconnectVariable = () => {
    if (linkedVariable) commit((linkedVariable.current ?? null) as PropertyInputValue<T> | null);
    setEditingVariable(null);
    updateDraftInput(null);
    setVariablesOpen(false);
  };

  return {
    connectedVariable,
    linkedVariable,
    currentValue,
    inputType,
    currentSizing,
    displayText,
    inputText,
    colorText,
    filteredVariables,
    variablesOpen,
    setVariablesOpen,
    variableQuery,
    setVariableQuery,
    inputElementRef,
    updateDraftInput,
    commitDraftInput,
    handleInputKeyDown,
    handleScrubPointerDown,
    handleScrubPointerMove,
    handleScrubPointerEnd,
    handleMenuValueChange,
    selectVariable,
    disconnectVariable,
    auto,
  };
}
