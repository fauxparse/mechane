import type { SceneVariable } from "./graph";
import type { Shape, ShapeValue, Type } from "./shapes";
import { defaultValueForType } from "./source-defaults";

/** A persisted reference from an Element Property to an owner Variable. */
export interface PropertyConnection {
  readonly kind: "variable";
  readonly variableId: string;
  /** Stable Shape Field ids to read before coercing into the Element property. */
  readonly fieldPath?: readonly string[];
}

/** A Property is either a literal value or a Variable connection. */
export type PropertyValue<T> = T | PropertyConnection;

/** A Variable resolved for an editor control, optionally carrying its current value. */
export type VariableReference<TSource extends ShapeValue = ShapeValue> = SceneVariable & {
  readonly current?: TSource;
  /** Stable Shape Field ids represented by this editor binding. */
  readonly fieldPath?: readonly string[];
};

export interface PropertyFieldPath {
  readonly fieldPath: readonly string[];
  readonly type: Type;
  readonly label: readonly string[];
}

export type PropertyCoercion = "identity" | "number-to-text";

export function isPropertyConnection(value: unknown): value is PropertyConnection {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    value.kind !== "variable"
  ) {
    return false;
  }
  if (!("variableId" in value) || typeof value.variableId !== "string") return false;
  if (!("fieldPath" in value) || value.fieldPath === undefined) return true;
  return (
    Array.isArray(value.fieldPath) &&
    value.fieldPath.every((segment) => typeof segment === "string")
  );
}

export function typeAtPath(
  type: Type,
  path: readonly string[],
  shapes: readonly Shape[],
): Type | null {
  let current: Type = type;
  for (const fieldId of path) {
    if (typeof current !== "object") return null;
    const shapeId = Reflect.get(current, "shapeId");
    if (typeof shapeId !== "string") return null;
    const shape = shapes.find((candidate) => candidate.id === shapeId);
    const field = shape?.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return null;
    current = field.type;
  }
  return current;
}

export function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const fieldId of path) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !(fieldId in current)
    ) {
      return undefined;
    }
    current = Reflect.get(current, fieldId);
  }
  return current;
}

export function propertyFieldPaths(
  source: Type,
  target: Type,
  shapes: readonly Shape[],
): readonly PropertyFieldPath[] {
  const result: PropertyFieldPath[] = [];
  const visit = (
    current: Type,
    fieldPath: readonly string[],
    label: readonly string[],
    shapeStack: ReadonlySet<string>,
  ): void => {
    if (propertyCoercion(current, target)) {
      result.push({ fieldPath, type: current, label });
    }
    if (
      typeof current !== "object" ||
      current.kind !== "shape" ||
      shapeStack.has(current.shapeId)
    ) {
      return;
    }
    const shape = shapes.find((candidate) => candidate.id === current.shapeId);
    if (!shape) return;
    const nextShapeStack = new Set(shapeStack);
    nextShapeStack.add(current.shapeId);
    for (const field of shape.fields) {
      visit(field.type, [...fieldPath, field.id], [...label, field.name], nextShapeStack);
    }
  };
  visit(source, [], [], new Set());
  return result;
}

export function propertyCoercion(source: Type, target: Type): PropertyCoercion | null {
  if (
    typeof source !== "string" &&
    typeof target !== "string" &&
    source.kind === "shape" &&
    target.kind === "shape" &&
    source.shapeId === target.shapeId
  ) {
    return "identity";
  }
  if (source === target) return "identity";
  if (source === "number" && target === "text") return "number-to-text";
  return null;
}

export function coercePropertyValue(value: unknown, coercion: PropertyCoercion): unknown {
  if (coercion === "identity") return value;
  if (coercion === "number-to-text") return String(value);
  return value;
}

export function defaultPropertyValue(type: Type): ShapeValue | null {
  if (typeof type !== "string") return null;
  const value = defaultValueForType(type, []);
  switch (type) {
    case "number":
      return typeof value === "number" ? { kind: "number", value } : null;
    case "boolean":
      return typeof value === "boolean" ? { kind: "boolean", value } : null;
    case "text":
      return typeof value === "string" ? { kind: "text", value } : null;
    case "image":
      return null;
    case "color":
      return typeof value === "string" ? { kind: "color", value } : null;
    case "date":
      return typeof value === "string" ? { kind: "date", value } : null;
    case "datetime":
      return typeof value === "string" ? { kind: "datetime", value } : null;
  }
}

export function variableValue<T extends ShapeValue>(
  variable: SceneVariable,
  values?: Readonly<Record<string, unknown>>,
): T | null {
  if (!variable.type) return null;
  const value = values?.[variable.id] ?? defaultPropertyValue(variable.type);
  return value as T | null;
}
