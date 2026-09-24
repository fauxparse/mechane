import type { BlockVariable } from "@mechane/domain/blocks";
import type {
  AxisSize,
  ElementSizing,
  SizeMode,
  SlotElement,
  SlotInputSource,
} from "@mechane/domain/canvas";
import { type FormulaScope, type FormulaType, absent } from "@mechane/domain/formula";
import { formulaShapeTable, formulaType } from "@mechane/domain/formula-runtime";
import type { SceneVariable } from "@mechane/domain/graph";
import {
  type VariableReference,
  defaultPropertyValue,
  isPropertyConnection,
  propertyFieldPaths,
  typeAtPath,
  valueAtPath,
} from "@mechane/domain/property-values";
import type { Shape, ShapeValue, Type } from "@mechane/domain/shapes";
import type { PropertyInputConstraint, PropertyInputValue } from "@mechane/design-system";

export type SizeConstraint = PropertyInputConstraint;

export interface ElementFormulaScopeOptions {
  /** The Property carries a size unit, so a trailing `%` is meaningful. */
  readonly allowsUnit?: boolean;
  /** A Block Canvas: its Elements are repeated, so `item` is a legal name. */
  readonly repeated?: boolean;
}

/**
 * The scope an inspector Formula is written against. A Block definition binds
 * no `item` — its Type is call-site dependent, so publication diagnoses a
 * Block once per referencing Slot (#710) — but the name still has to resolve
 * here, or every repeat Formula reads as broken while you author it.
 */
export const elementFormulaScope = (
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
  expected: FormulaType,
  { allowsUnit, repeated }: ElementFormulaScopeOptions = {},
): FormulaScope => ({
  ports: variables.flatMap((variable) =>
    variable.type
      ? [
          {
            name: variable.name,
            type: formulaType(variable.type, shapes),
            value: absent("the input is absent"),
          },
        ]
      : [],
  ),
  shapes: formulaShapeTable(shapes),
  expected,
  diagnosticSubject: "Element Property",
  ...(allowsUnit ? { allowsUnit } : {}),
  ...(repeated
    ? {
        itemBinding: {
          name: "item",
          type: "unknown" as const,
          value: absent("item is supplied where the Block is used"),
        },
        index: 0,
      }
    : {}),
});

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
export const textValueForPreview = (value: ShapeValue | null): string =>
  value?.kind === "text" || value?.kind === "number" ? String(value.value) : "";

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
    const fallback =
      value.fallback ??
      (variable.defaultValue === undefined
        ? undefined
        : valueAtPath(variable.defaultValue, fieldPath)) ??
      (sourceType ? defaultPropertyValue(sourceType) : null);
    const current = sourceType ? literalValue(sourceType, fallback) : null;
    return {
      ...variable,
      name:
        fieldPath.length > 0
          ? `${variable.name} → ${field?.label.join(" → ") ?? "Unavailable"}`
          : variable.name,
      fieldPath,
      fieldType: sourceType ?? undefined,
      current: current ?? undefined,
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
    return propertyFieldPaths(variable.type, type, shapes).map((field) => {
      const defaultValue =
        variable.defaultValue === undefined
          ? undefined
          : valueAtPath(variable.defaultValue, field.fieldPath);
      return {
        ...variable,
        name:
          field.label.length > 0 ? `${variable.name} → ${field.label.join(" → ")}` : variable.name,
        fieldPath: field.fieldPath,
        fieldType: field.type,
        current: literalValue(field.type, defaultValue) ?? undefined,
      };
    });
  });

export const slotInputReference = (
  slot: SlotElement,
  blockVariable: BlockVariable,
  source: SlotInputSource | undefined,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): VariableReference | null => {
  if (source?.kind === "runtimeItem") {
    const expansion = slot.expansion?.source;
    if (expansion?.kind !== "variable") return null;
    const variable = variables.find((candidate) => candidate.id === expansion.variableId);
    if (!variable) return null;
    return {
      ...variable,
      type: blockVariable.type,
      fieldPath: [],
      fieldType: blockVariable.type,
    };
  }
  if (source?.kind === "variable") {
    const reference = variableInput(
      {
        kind: "variable",
        variableId: source.variableId,
        fieldPath: source.fieldPath ?? [],
      },
      blockVariable.type,
      variables,
      shapes,
    );
    return reference && "id" in reference && "name" in reference ? reference : null;
  }
  return null;
};

export const slotInputOptions = (
  slot: SlotElement,
  blockVariable: BlockVariable,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): readonly VariableReference[] => {
  const options = variableOptions(blockVariable.type, variables, shapes);
  const runtimeItem = slotInputReference(
    slot,
    blockVariable,
    { kind: "runtimeItem" },
    variables,
    shapes,
  );
  return runtimeItem ? [runtimeItem, ...options] : options;
};

/**
 * The Formula that reads what a Variable connection reads: `Total`, or `Candidate.votes` through a
 * Shape field. Writing a Formula over a connected Property starts here, so the value on screen does
 * not change until the author edits it.
 */
export const connectionFormulaSource = (
  value: unknown,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): string | null => {
  if (!isPropertyConnection(value)) return null;
  const variable = variables.find((candidate) => candidate.id === value.variableId);
  if (!variable?.type) return null;
  let type: Type = variable.type;
  const parts = [variable.name];
  for (const fieldId of value.fieldPath ?? []) {
    if (typeof type !== "object" || type.kind !== "shape") return null;
    const { shapeId } = type;
    const field = shapes
      .find((shape) => shape.id === shapeId)
      ?.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return null;
    parts.push(field.name);
    type = field.type;
  }
  return parts.join(".");
};

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

/**
 * Switching to Fill or Hug drops the value, whatever it was: those modes take their size from
 * the layout. Switching to fixed measures what is on screen; staying fixed keeps the value, so
 * a Formula or Variable survives re-choosing the mode it is already in.
 */
export const sizingForMode = (
  size: AxisSize | undefined,
  mode: SizeMode,
  currentValue?: number,
): AxisSize => {
  if (mode !== "fixed") return { mode };
  if (size?.mode === "fixed") return size;
  return { mode, value: currentValue ?? 100 };
};

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
