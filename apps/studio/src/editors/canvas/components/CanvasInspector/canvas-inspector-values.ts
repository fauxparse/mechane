import type {
  AxisSize,
  ElementSizing,
  SceneVariable,
  Shape,
  ShapeValue,
  SizeMode,
  Type,
  VariableReference,
} from "@mechane/domain";
import {
  defaultPropertyValue,
  isPropertyConnection,
  propertyFieldPaths,
  typeAtPath,
} from "@mechane/domain";
import type { PropertyInputConstraint, PropertyInputValue } from "@mechane/design-system";

export type SizeConstraint = PropertyInputConstraint;

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
  shapes: readonly Shape[] = [],
): PropertyInputValue | null => {
  if (isPropertyConnection(value)) {
    const variable = variables.find((candidate) => candidate.id === value.variableId);
    if (!variable) return null;
    const fieldPath = value.fieldPath ?? [];
    const sourceType = variable.type ? typeAtPath(variable.type, fieldPath, shapes) : null;
    const field =
      variable.type && sourceType
        ? propertyFieldPaths(variable.type, sourceType, shapes).find(
            (candidate) => JSON.stringify(candidate.fieldPath) === JSON.stringify(fieldPath),
          )
        : undefined;
    return {
      ...variable,
      name:
        fieldPath.length > 0
          ? `${variable.name} → ${field?.label.join(" → ") ?? "Unavailable"}`
          : variable.name,
      fieldPath,
      current: sourceType ? (defaultPropertyValue(sourceType) ?? undefined) : undefined,
    };
  }
  return literalValue(type, value);
};

export const variableOptions = (
  type: Type,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): readonly VariableReference[] =>
  variables.flatMap((variable) => {
    if (!variable.type) return [];
    return propertyFieldPaths(variable.type, type, shapes).map((field) => ({
      ...variable,
      name:
        field.label.length > 0 ? `${variable.name} → ${field.label.join(" → ")}` : variable.name,
      fieldPath: field.fieldPath,
      current: defaultPropertyValue(field.type) ?? undefined,
    }));
  });

export const isVariableInput = (value: PropertyInputValue | null): value is VariableReference =>
  value !== null && typeof value === "object" && "id" in value && "name" in value;

function hasValue(value: object): value is { value?: unknown } {
  return "value" in value;
}

export const sizeInputValue = (
  size: unknown,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[] = [],
): PropertyInputValue | null => {
  if (!size || typeof size !== "object" || !hasValue(size)) return null;
  const raw = size.value;
  if (isPropertyConnection(raw)) return variableInput(raw, "number", variables, shapes);
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

export const SIZE_CONSTRAINT_KEYS = {
  width: { min: "minWidth", max: "maxWidth" },
  height: { min: "minHeight", max: "maxHeight" },
} as const satisfies Record<"width" | "height", Record<SizeConstraint, keyof ElementSizing>>;

export const sizeConstraintKey = (
  axis: "width" | "height",
  constraint: SizeConstraint,
): keyof ElementSizing => SIZE_CONSTRAINT_KEYS[axis][constraint];

/** Unwraps the `number | { value, unit }` shape used by min/max sizing constraints. */
export const sizeValueNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && hasValue(value) && typeof value.value === "number") {
    return Number.isFinite(value.value) ? value.value : null;
  }
  return null;
};

export const sizeValueUnit = (value: unknown): "px" | "%" =>
  value && typeof value === "object" && "unit" in value && value.unit === "%" ? "%" : "px";

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
