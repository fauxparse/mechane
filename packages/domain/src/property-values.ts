import type { SceneVariable } from "./graph";
import type { ShapeValue, Type } from "./shapes";
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
};

export type PropertyCoercion = "identity" | "number-to-text";

export function isPropertyConnection(value: unknown): value is PropertyConnection {
  if (typeof value !== "object" || value === null || !("kind" in value) || value.kind !== "variable") {
    return false;
  }
  if (!("variableId" in value) || typeof value.variableId !== "string") return false;
  if (!("fieldPath" in value) || value.fieldPath === undefined) return true;
  return Array.isArray(value.fieldPath) && value.fieldPath.every((segment) => typeof segment === "string");
}

export function propertyCoercion(source: Type, target: Type): PropertyCoercion | null {
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
