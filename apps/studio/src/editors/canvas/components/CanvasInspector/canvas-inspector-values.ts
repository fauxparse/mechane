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
  type PropertyFieldPath,
  type VariableReference,
  defaultPropertyValue,
  isPropertyConnection,
  propertyFieldPaths,
  typeAtPath,
  valueAtPath,
} from "@mechane/domain/property-values";
import { areTypesCompatible, type Shape, type ShapeValue, type Type } from "@mechane/domain/shapes";
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

/**
 * A Slot input choice the inspector can persist: a Scene Variable path, or a field of the
 * expansion's current item. `source` is what gets written back into the Slot's assignment
 * when this option is chosen, and what `slotInputReference` reads back for display.
 */
export interface SlotInputOption extends VariableReference {
  readonly source: Extract<SlotInputSource, { kind: "variable" | "runtimeItem" }>;
}

/**
 * UI-only identity for the expansion's current item. Generated entity ids never contain a
 * dash (see domain id.ts), so this cannot collide with a Variable id: a direct Variable
 * choice and a current-item choice stay distinct wherever `(id, fieldPath)` identifies one.
 */
const CURRENT_ITEM_ID = "current-item";

const isArrayType = (type: Type): type is { kind: "array"; of: Type } =>
  typeof type === "object" && type.kind === "array";

/** Field names along `fieldPath`, or null once the path stops resolving. */
const fieldLabels = (
  type: Type,
  fieldPath: readonly string[],
  shapes: readonly Shape[],
): readonly string[] | null => {
  const labels: string[] = [];
  const fieldsByShapeId = new Map(
    shapes.map((shape) => [shape.id, new Map(shape.fields.map((field) => [field.id, field]))]),
  );
  let current: Type = type;
  for (const fieldId of fieldPath) {
    if (typeof current !== "object" || current.kind !== "shape") return null;
    const { shapeId } = current;
    const field = fieldsByShapeId.get(shapeId)?.get(fieldId);
    if (!field) return null;
    labels.push(field.name);
    current = field.type;
  }
  return labels;
};

/**
 * Visits `root` and every path through its Shape fields, cycle-guarded the way
 * `propertyFieldPaths` guards, handing each visited Type to `visit`.
 */
const visitFieldPaths = (
  root: Type,
  shapes: readonly Shape[],
  visit: (field: PropertyFieldPath) => void,
): void => {
  const walk = (
    type: Type,
    fieldPath: readonly string[],
    label: readonly string[],
    shapeStack: ReadonlySet<string>,
  ): void => {
    visit({ fieldPath, type, label });
    if (typeof type !== "object" || type.kind !== "shape" || shapeStack.has(type.shapeId)) return;
    const shape = shapes.find((candidate) => candidate.id === type.shapeId);
    if (!shape) return;
    const nextShapeStack = new Set(shapeStack);
    nextShapeStack.add(type.shapeId);
    for (const field of shape.fields) {
      walk(field.type, [...fieldPath, field.id], [...label, field.name], nextShapeStack);
    }
  };
  walk(root, [], [], new Set());
};

/**
 * Every parent Variable array a Slot can expand over: the Variable itself when it is an
 * array, plus arrays nested in its Shape fields — `settings → candidates`. Expansion
 * always reads a Variable path, so no literal source is ever offered.
 */
export const slotExpansionOptions = (
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): readonly SlotInputOption[] =>
  variables.flatMap((variable) => {
    if (!variable.type) return [];
    const arrays: PropertyFieldPath[] = [];
    // An array is a leaf: `typeAtPath` cannot read through one, so a deeper path
    // would not resolve as an expansion source anyway.
    visitFieldPaths(variable.type, shapes, (field) => {
      if (isArrayType(field.type)) arrays.push(field);
    });
    return arrays.map((field): SlotInputOption => ({
      ...variable,
      name:
        field.label.length > 0 ? `${variable.name} → ${field.label.join(" → ")}` : variable.name,
      fieldPath: field.fieldPath,
      fieldType: field.type,
      source: { kind: "variable", variableId: variable.id, fieldPath: field.fieldPath },
    }));
  });

/**
 * The Variable a Slot expands over and its item Type, when the expansion reads a Variable
 * path that resolves to an array. Anything else — a literal, a missing Variable, a path
 * that stops resolving — leaves the expansion outside this editor's remit.
 */
const expansionItem = (
  slot: SlotElement,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): { readonly variable: SceneVariable; readonly itemType: Type } | null => {
  const source = slot.expansion?.source;
  if (source?.kind !== "variable") return null;
  const variable = variables.find((candidate) => candidate.id === source.variableId);
  if (!variable?.type) return null;
  const arrayType = typeAtPath(variable.type, source.fieldPath ?? [], shapes);
  return arrayType && isArrayType(arrayType) ? { variable, itemType: arrayType.of } : null;
};

/**
 * The option a persisted assignment currently selects, for display. An assignment whose
 * path no longer resolves still renders — labelled Unavailable — so a Slot never silently
 * forgets what it was wired to; `slotInputOptions` simply stops offering that choice.
 */
export const slotInputReference = (
  slot: SlotElement,
  blockVariable: BlockVariable,
  source: SlotInputSource | undefined,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): SlotInputOption | null => {
  if (source?.kind === "runtimeItem") {
    const expansion = slot.expansion?.source;
    if (expansion?.kind !== "variable") return null;
    const variable = variables.find((candidate) => candidate.id === expansion.variableId);
    if (!variable) return null;
    const itemType = expansionItem(slot, variables, shapes)?.itemType;
    const fieldPath = source.fieldPath ?? [];
    const fieldType = itemType ? typeAtPath(itemType, fieldPath, shapes) : null;
    const labels =
      itemType && fieldPath.length > 0 ? fieldLabels(itemType, fieldPath, shapes) : null;
    return {
      ...variable,
      id: CURRENT_ITEM_ID,
      name:
        fieldPath.length === 0
          ? "Current item"
          : `Current item → ${labels === null ? "Unavailable" : labels.join(" → ")}`,
      type: fieldType ?? blockVariable.type,
      fieldPath,
      fieldType: fieldType ?? blockVariable.type,
      source: { kind: "runtimeItem", fieldPath },
    };
  }
  if (source?.kind === "variable") {
    const fieldPath = source.fieldPath ?? [];
    const reference = variableInput(
      { kind: "variable", variableId: source.variableId, fieldPath },
      blockVariable.type,
      variables,
      shapes,
    );
    return reference && "id" in reference && "name" in reference
      ? { ...reference, source: { kind: "variable", variableId: source.variableId, fieldPath } }
      : null;
  }
  return null;
};

/**
 * Everything a Block input can be wired to: the Scene's compatible Variable paths, plus —
 * when the Slot expands over a resolvable Variable array — the current item and its
 * compatible fields. Item compatibility follows the domain assignment rule
 * (`areTypesCompatible`), so the inspector never offers a choice the runtime would
 * reject as an `incompatibleInput`.
 */
export const slotInputOptions = (
  slot: SlotElement,
  blockVariable: BlockVariable,
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): readonly SlotInputOption[] => {
  const direct = variableOptions(blockVariable.type, variables, shapes).map(
    (option): SlotInputOption => ({
      ...option,
      source: { kind: "variable", variableId: option.id, fieldPath: option.fieldPath ?? [] },
    }),
  );
  const expansion = expansionItem(slot, variables, shapes);
  if (!expansion) return direct;
  const items: SlotInputOption[] = [];
  visitFieldPaths(expansion.itemType, shapes, (field) => {
    if (!areTypesCompatible(field.type, blockVariable.type, shapes)) return;
    items.push({
      ...expansion.variable,
      id: CURRENT_ITEM_ID,
      name: field.label.length > 0 ? `Current item → ${field.label.join(" → ")}` : "Current item",
      type: expansion.itemType,
      fieldPath: field.fieldPath,
      fieldType: field.type,
      source: { kind: "runtimeItem", fieldPath: field.fieldPath },
    });
  });
  return [...items, ...direct];
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
  const fieldsByShapeId = new Map<string, Map<string, Shape["fields"][number]>>();
  for (const shape of shapes) {
    if (fieldsByShapeId.has(shape.id)) continue;
    const fieldsById = new Map<string, Shape["fields"][number]>();
    for (const field of shape.fields) {
      if (!fieldsById.has(field.id)) fieldsById.set(field.id, field);
    }
    fieldsByShapeId.set(shape.id, fieldsById);
  }
  for (const fieldId of value.fieldPath ?? []) {
    if (typeof type !== "object" || type.kind !== "shape") return null;
    const { shapeId } = type;
    const field = fieldsByShapeId.get(shapeId)?.get(fieldId);
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
