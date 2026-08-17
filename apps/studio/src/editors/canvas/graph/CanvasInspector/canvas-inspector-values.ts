import type {
  AxisSize,
  SceneVariable,
  ShapeValue,
  SizeMode,
  Type,
  VariableReference,
} from "@mechane/domain";
import { defaultPropertyValue, isPropertyConnection, opacityToPercent } from "@mechane/domain";
import type { PropertyInputValue } from "@mechane/design-system";

export const inputType = (type: Type): "text" | "number" | "color" | null => {
  if (type === "number") return "number";
  if (type === "color") return "color";
  if (type === "text" || type === "image") return "text";
  return null;
};

const isShapeValue = (value: unknown): value is ShapeValue =>
  value !== null && typeof value === "object" && "kind" in value && "value" in value;

export const literalValue = (type: Type, value: unknown): ShapeValue | null => {
  if (value === undefined || value === null) return null;
  if (isShapeValue(value)) return value;
  const kind = type === "color" ? "color" : type;
  if (
    kind === "number" ||
    kind === "text" ||
    kind === "image" ||
    kind === "color" ||
    kind === "boolean" ||
    kind === "date" ||
    kind === "datetime"
  ) {
    return { kind, value } as ShapeValue;
  }
  return null;
};

export const variableInput = (
  value: unknown,
  type: Type,
  variables: readonly SceneVariable[],
): PropertyInputValue | null => {
  if (isPropertyConnection(value)) {
    const variable = variables.find((candidate) => candidate.id === value.variableId);
    if (!variable) return null;
    return {
      ...variable,
      current: variable.type ? (defaultPropertyValue(variable.type) ?? undefined) : undefined,
    };
  }
  return literalValue(type, value);
};

export const isVariableInput = (value: PropertyInputValue | null): value is VariableReference =>
  value !== null && typeof value === "object" && "id" in value && "name" in value;

export const opacityInputValue = (value: PropertyInputValue | null): PropertyInputValue | null => {
  if (isVariableInput(value)) {
    const current = value.current;
    return {
      ...value,
      current:
        current?.kind === "number"
          ? { ...current, value: opacityToPercent(current.value) }
          : current,
    };
  }
  return value?.kind === "number" ? { ...value, value: opacityToPercent(value.value) } : value;
};

function hasValue(value: object): value is { value?: unknown } {
  return "value" in value;
}

export const sizeInputValue = (
  size: unknown,
  variables: readonly SceneVariable[],
): PropertyInputValue | null => {
  if (!size || typeof size !== "object" || !hasValue(size)) return null;
  const raw = size.value;
  if (isPropertyConnection(raw)) return variableInput(raw, "number", variables);
  if (typeof raw === "number") return literalValue("number", raw);
  if (raw && typeof raw === "object" && hasValue(raw)) {
    return literalValue("number", raw.value);
  }
  return null;
};

export const sizingForMode = (
  size: AxisSize | undefined,
  mode: SizeMode,
  currentValue?: number,
): AxisSize => ({
  ...size,
  mode,
  ...(mode === "fixed" && currentValue !== undefined
    ? { value: currentValue }
    : mode === "fixed" && size?.value === undefined
      ? { value: 100 }
      : {}),
});

export const numericSizeValue = (size: unknown): number | null => {
  if (!size || typeof size !== "object" || !("value" in size)) return null;
  const value = size.value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "value" in value) {
    const nestedValue = value.value;
    return typeof nestedValue === "number" && Number.isFinite(nestedValue) ? nestedValue : null;
  }
  return null;
};
