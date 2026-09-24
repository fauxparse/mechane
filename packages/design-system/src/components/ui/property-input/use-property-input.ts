import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { ShapeValue } from "@mechane/domain/shapes";

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

export function parsePropertyInputValue<T extends ShapeValue = ShapeValue>(
  type: PropertyInputType,
  rawValue: string,
  min?: number,
  max?: number,
): PropertyInputValue<T> | null | undefined {
  if (type === "color") {
    const parsed = parseHexColor(rawValue);
    return parsed ? createValue<T>(type, rgbaToHex(parsed)) : undefined;
  }
  if (type !== "number") return createValue<T>(type, rawValue);

  const trimmed = rawValue.trim();
  if (trimmed === "") return null;
  const suffix = trimmed.endsWith("%") ? "%" : trimmed.endsWith("px") ? "px" : undefined;
  const numericValue = suffix ? trimmed.slice(0, -suffix.length).trim() : trimmed;
  if (numericValue === "" || /[a-zA-Z]/.test(numericValue)) return undefined;
  const parsed = Number(numericValue);
  if (!Number.isFinite(parsed)) return undefined;
  const value = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
  return { ...createValue<T>(type, value), ...(suffix ? { unit: suffix } : {}) };
}

export function propertyInputValidationMessage(type: PropertyInputType): string {
  return type === "color" ? "Enter a valid color." : "Enter a finite number.";
}

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
  menuItems,
  allowAuto = false,
  auto = false,
  scrubScale = 2,
  onChange,
  onSizingChange,
  onMenuItemSelect,
  onAutoChange,
  onValidationError,
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
  const [scrubPreviewValue, setScrubPreviewValue] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const draftInputRef = useRef<string | null>(null);
  const inputElementRef = useRef<HTMLInputElement | null>(null);
  const validationErrorRef = useRef<string | null>(null);
  const scrubOrigin = useRef<{
    x: number;
    value: number;
    previewValue: number;
    pointerId: number;
    target: HTMLDivElement;
  } | null>(null);

  const displayedValue = value === undefined ? uncontrolledValue : value;
  const connectedVariable = isVariableReference(displayedValue) ? displayedValue : null;
  const linkedVariable = connectedVariable && editingVariable === null ? connectedVariable : null;
  const currentValue = getDisplayValue(displayedValue);
  const inputType = getInputType(displayedValue, type);
  const currentSizing = sizing ?? uncontrolledSizing;
  const previewValue =
    scrubPreviewValue === null
      ? currentValue
      : ({ kind: "number", value: scrubPreviewValue } as ShapeValue);
  const displayText = formatValueText(previewValue, dimension, unit);
  const inputText = linkedVariable
    ? ""
    : scrubPreviewValue === null
      ? (draftInputValue ?? displayText)
      : displayText;
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

  const reportValidationError = (error: string | null) => {
    if (validationErrorRef.current === error) return;
    validationErrorRef.current = error;
    onValidationError?.(error);
  };

  const updateDraftInput = (nextValue: string | null) => {
    if (inputType === "color" && nextValue !== null && !/^#?[0-9a-f]{0,8}$/i.test(nextValue)) {
      return;
    }
    draftInputRef.current = nextValue;
    setDraftInputValue(nextValue);
    reportValidationError(null);
    if (inputType === "color" && nextValue !== null) {
      const parsed = parseHexColor(nextValue);
      if (parsed) commit(createValue<T>(inputType, rgbaToHex(parsed)));
    }
  };

  const commitDraftInput = (): boolean => {
    const rawValue = draftInputRef.current;
    if (rawValue === null) return true;
    const nextValue = parsePropertyInputValue<T>(inputType, rawValue, min, max);
    if (nextValue === undefined) {
      reportValidationError(propertyInputValidationMessage(inputType));
      return false;
    }
    reportValidationError(null);
    const sameColor =
      inputType === "color" &&
      nextValue !== null &&
      !isVariableReference(nextValue) &&
      nextValue.kind === "color" &&
      currentValue?.kind === "color" &&
      nextValue.value === currentValue.value;
    if (!sameColor) commit(nextValue);
    updateDraftInput(null);
    return true;
  };

  const cancelDraft = () => {
    updateDraftInput(null);
    if (editingVariable) {
      commit(editingVariable);
      setEditingVariable(null);
    }
  };
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    if (event.nativeEvent.isComposing) return true;
    if (event.key === "Enter") {
      event.preventDefault();
      (event as KeyboardEvent<HTMLInputElement> & { preventBaseUIHandler?: () => void })
        .preventBaseUIHandler?.();
      return commitDraftInput();
    }
    if (event.key === "Backspace" && linkedVariable && connectedVariable) {
      event.preventDefault();
      setEditingVariable(connectedVariable);
      updateDraftInput(formatValueText(connectedVariable.current, dimension, unit));
      commit((connectedVariable.current ?? null) as PropertyInputValue<T> | null);
      return true;
    }
    handleEscapeKey(event, cancelDraft);
    return true;
  };

  const finishScrub = useCallback(
    (pointerId?: number) => {
      const origin = scrubOrigin.current;
      if (!origin || (pointerId !== undefined && pointerId !== origin.pointerId)) return;
      scrubOrigin.current = null;
      if (origin.target.hasPointerCapture(origin.pointerId)) {
        origin.target.releasePointerCapture(origin.pointerId);
      }
      setScrubPreviewValue(null);
      setIsScrubbing(false);
      if (origin.previewValue === origin.value) return;
      const nextValue = createValue<T>(inputType, origin.previewValue);
      if (value === undefined) setUncontrolledValue(nextValue);
      onChange?.(nextValue);
    },
    [inputType, onChange, value],
  );

  useEffect(() => {
    if (!isScrubbing) return;
    const handlePointerEnd = (event: globalThis.PointerEvent) => finishScrub(event.pointerId);
    const handlePointerOut = (event: globalThis.PointerEvent) => {
      if (event.relatedTarget === null) finishScrub(event.pointerId);
    };
    const handleWindowBlur = () => finishScrub();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") finishScrub();
    };
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    window.addEventListener("pointerout", handlePointerOut, true);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("pointerout", handlePointerOut, true);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [finishScrub, isScrubbing]);

  const handleScrubPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (linkedVariable || currentValue?.kind !== "number") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draftInputRef.current = null;
    setDraftInputValue(null);
    scrubOrigin.current = {
      x: event.clientX,
      value: currentValue.value,
      previewValue: currentValue.value,
      pointerId: event.pointerId,
      target: event.currentTarget,
    };
    setScrubPreviewValue(currentValue.value);
    setIsScrubbing(true);
  };

  const handleScrubPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = scrubOrigin.current;
    if (!origin || event.pointerId !== origin.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      finishScrub(event.pointerId);
      return;
    }
    const scrubUnit = step && step > 0 ? step : 1;
    const scale = Math.max(0.1, scrubScale);
    const delta = Math.round((event.clientX - origin.x) / scale / scrubUnit) * scrubUnit;
    const nextValue = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, origin.value + delta));
    if (nextValue === origin.previewValue) return;
    origin.previewValue = nextValue;
    setScrubPreviewValue(nextValue);
  };

  const handleScrubPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    finishScrub(event.pointerId);
  };

  const commitSizing = (nextSizing: PropertyInputSizing) => {
    if (sizing === undefined) setUncontrolledSizing(nextSizing);
    onSizingChange?.(nextSizing);
  };
  const handleMenuValueChange = (menuValue: string | null) => {
    if (menuValue && menuItems?.some((item) => item.value === menuValue)) {
      onMenuItemSelect?.(menuValue);
      return;
    }
    const preset = presets?.find((value) => String(value) === menuValue);
    if (preset === "auto" && allowAuto) {
      onAutoChange?.(true);
      updateDraftInput(null);
      return;
    }
    if (preset !== undefined) {
      const next = inputType === "number" ? preset : String(preset);
      commit(createValue<T>(inputType, next));
      updateDraftInput(null);
      return;
    }
    if (menuValue === "fixed" || menuValue === "fill" || menuValue === "hug") {
      commitSizing(menuValue);
    }
    if (menuValue === "auto" && allowAuto) onAutoChange?.(true);
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
    isScrubbing,
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
