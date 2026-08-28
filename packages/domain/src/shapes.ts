import { generateId, isId, type ShapeInstanceId } from "./id";
/** The primitive members of the Shape type grammar. */
export const PRIMITIVE_TYPES = [
  "text",
  "number",
  "boolean",
  "image",
  "color",
  "date",
  "datetime",
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

/** A recursive Type: primitive, array-of-Type, or a named Shape reference. */
export type Type = PrimitiveType | { kind: "array"; of: Type } | { kind: "shape"; shapeId: string };

export interface TextValue {
  kind: "text";
  value: string;
}
export interface NumberValue {
  kind: "number";
  value: number;
}
export interface BooleanValue {
  kind: "boolean";
  value: boolean;
}

/** The persisted, opaque reference carried through graphs and Runs. */
export interface ImageAssetReference {
  assetId: string;
  revision: string;
}

/** A resolved image value exposed at application/render boundaries. */
export interface ResolvedImageValue {
  assetId: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  mimeType: string;
  blurHash: string | null;
}

export interface ImageValue {
  kind: "image";
  value: ImageAssetReference;
}
export interface ColorValue {
  kind: "color";
  value: string;
}
export interface DateValue {
  kind: "date";
  value: string;
}
export interface DateTimeValue {
  kind: "datetime";
  value: string;
}
export interface ArrayValue {
  kind: "array";
  value: ShapeValue[];
}
export type ShapeValue =
  | TextValue
  | NumberValue
  | BooleanValue
  | ImageValue
  | ColorValue
  | DateValue
  | DateTimeValue
  | ArrayValue;

export interface ShapeField {
  id: string;
  name: string;
  type: Type;
  required: boolean;
  /** `null`/`undefined` is the absent default allowed for optional fields. */
  defaultValue: unknown;
}

export interface Shape {
  id: string;
  name: string;
  /** Order is meaningful and is preserved by this array. */
  fields: ShapeField[];
}
/**
 * A persisted item in an array whose element Type is a Shape. The wrapper is
 * deliberately outside the Shape value so a user field named `id` cannot
 * collide with collection identity.
 */
export interface ShapeCollectionInstance<T = unknown> {
  readonly id: ShapeInstanceId;
  readonly value: T;
}

export function createShapeCollectionInstance<T>(
  value: T,
  id: ShapeInstanceId = generateId("shapeInstance"),
): ShapeCollectionInstance<T> {
  return { id, value };
}

export function isShapeCollectionInstance(value: unknown): value is ShapeCollectionInstance {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const id = Reflect.get(value, "id");
  return (
    typeof id === "string" &&
    isId("shapeInstance", id) &&
    Object.prototype.hasOwnProperty.call(value, "value")
  );
}

export class InvalidShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShapeError";
  }
}

export class InvalidShapeValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShapeValueError";
  }
}

const primitiveSet = new Set<string>(PRIMITIVE_TYPES);

function references(type: Type, result: Set<string>): void {
  if (typeof type === "string") return;
  if (type.kind === "shape") result.add(type.shapeId);
  else if (type.kind === "array") references(type.of, result);
}
/** Whether `type` directly or indirectly names `targetId`. */
export function typeReferencesShape(type: Type, targetId: string): boolean {
  if (typeof type === "string") return false;
  if (type.kind === "shape") return type.shapeId === targetId;
  return typeReferencesShape(type.of, targetId);
}

/** Whether `shapeId` reaches `targetId` through its Field Types. */
export function shapeReferencesShape(
  shapes: readonly Shape[],
  shapeId: string,
  targetId: string,
): boolean {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const visited = new Set<string>();
  const visit = (currentId: string): boolean => {
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    const shape = byId.get(currentId);
    return (
      shape?.fields.some((field) => {
        if (typeof field.type === "string") return false;
        if (field.type.kind === "shape") {
          return field.type.shapeId === targetId || visit(field.type.shapeId);
        }
        return visitType(field.type.of);
      }) ?? false
    );
  };
  const visitType = (type: Type): boolean => {
    if (typeof type === "string") return false;
    if (type.kind === "shape") return type.shapeId === targetId || visit(type.shapeId);
    return visitType(type.of);
  };
  return visit(shapeId);
}
/** Validates a Type against the known Shape set without checking defaults. */
export function assertValidShapeType(
  type: Type,
  shapes: readonly Shape[],
  context = "Shape Type",
): void {
  assertType(type, new Set(shapes.map((shape) => shape.id)), context);
}

/** Refuses a Field name that would collide within its Shape. */
export function assertShapeFieldNameAvailable(shape: Shape, name: string, fieldId?: string): void {
  if (shape.fields.some((field) => field.id !== fieldId && field.name === name)) {
    throw new InvalidShapeError(`Shape ${shape.name} has duplicate Field name: ${name}.`);
  }
}

/** Refuses deleting a Shape that another Shape reaches through its Fields. */
export function assertShapeCanBeRemoved(shapes: readonly Shape[], shapeId: string): void {
  if (
    shapes.some((shape) => shape.id !== shapeId && shapeReferencesShape(shapes, shape.id, shapeId))
  ) {
    throw new InvalidShapeError(`Shape "${shapeId}" is used by another Shape.`);
  }
}

function assertType(type: Type, shapeIds: Set<string>, context: string): void {
  if (typeof type === "string") {
    if (!primitiveSet.has(type)) throw new InvalidShapeError(`${context} has an unknown type.`);
    return;
  }
  if (type.kind === "array") {
    assertType(type.of, shapeIds, `${context} array element`);
    return;
  }
  if (type.kind !== "shape" || !shapeIds.has(type.shapeId)) {
    throw new InvalidShapeError(`${context} references an unknown Shape.`);
  }
}

/** Validates Shape definitions, including reference existence and acyclicity. */
export function assertValidShapes(shapes: readonly Shape[]): void {
  const shapeIds = new Set<string>();
  const fieldIds = new Set<string>();
  for (const shape of shapes) {
    if (shapeIds.has(shape.id)) throw new InvalidShapeError(`Duplicate Shape id: ${shape.id}.`);
    shapeIds.add(shape.id);
  }
  for (const shape of shapes) {
    const names = new Set<string>();
    for (const field of shape.fields) {
      if (fieldIds.has(field.id)) throw new InvalidShapeError(`Duplicate Field id: ${field.id}.`);
      fieldIds.add(field.id);
      if (names.has(field.name)) {
        throw new InvalidShapeError(`Shape ${shape.name} has duplicate Field name: ${field.name}.`);
      }
      names.add(field.name);
      assertType(field.type, shapeIds, `Field ${field.name}`);
      if (field.required && (field.defaultValue === null || field.defaultValue === undefined)) {
        throw new InvalidShapeError(`Required Field ${field.name} must have a default.`);
      }
    }
  }

  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new InvalidShapeError("Shape references must be acyclic.");
    if (visited.has(id)) return;
    visiting.add(id);
    const shape = byId.get(id)!;
    for (const field of shape.fields) {
      const refs = new Set<string>();
      references(field.type, refs);
      for (const ref of refs) visit(ref);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const shape of shapes) visit(shape.id);
  for (const shape of shapes) {
    for (const field of shape.fields) {
      if (field.defaultValue !== null && field.defaultValue !== undefined) {
        try {
          assertValueConformsToType(
            field.defaultValue,
            field.type,
            shapes,
            `default ${shape.name}.${field.name}`,
          );
        } catch (error) {
          throw new InvalidShapeError(
            error instanceof Error ? error.message : "Invalid Field default.",
          );
        }
      }
    }
  }
}

/** Returns Shapes with referenced Shapes before their dependants. */
export function topologicallySortShapes(shapes: readonly Shape[]): Shape[] {
  assertValidShapes(shapes);
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const visited = new Set<string>();
  const sorted: Shape[] = [];
  const visit = (shape: Shape): void => {
    if (visited.has(shape.id)) return;
    visited.add(shape.id);
    for (const field of shape.fields) {
      const refs = new Set<string>();
      references(field.type, refs);
      for (const ref of refs) visit(byId.get(ref)!);
    }
    sorted.push(shape);
  };
  for (const shape of shapes) visit(shape);
  return sorted;
}

export function assertValidShape(shape: Shape, shapes: readonly Shape[] = [shape]): void {
  assertValidShapes(shapes);
  if (!shapes.some((candidate) => candidate.id === shape.id)) {
    throw new InvalidShapeError(`Shape ${shape.id} is not in the Shape set.`);
  }
}

function shapeMap(shapes: readonly Shape[]): Map<string, Shape> {
  return new Map(shapes.map((shape) => [shape.id, shape]));
}
/**
 * Adds identity to Shape items at the collection boundary. Existing unique
 * ids survive edits and reorder; missing or duplicated ids are treated as new
 * items. This is intentionally a pure normalisation step: callers persist
 * its result rather than minting ids during rendering.
 */
export function normalizeShapeCollectionInstances(
  value: unknown,
  type: Type,
  shapes: readonly Shape[] = [],
): unknown {
  if (typeof type === "string") return value;
  if (type.kind === "array") {
    if (!Array.isArray(value)) return value;
    const seen = new Set<ShapeInstanceId>();
    return value.map((item) => {
      if (typeof type.of !== "string" && type.of.kind === "shape") {
        const existingId = isShapeCollectionInstance(item) ? item.id : undefined;
        const id =
          existingId !== undefined && !seen.has(existingId)
            ? existingId
            : generateId("shapeInstance");
        seen.add(id);
        const raw = isShapeCollectionInstance(item) ? item.value : item;
        return createShapeCollectionInstance(
          normalizeShapeCollectionInstances(raw, type.of, shapes),
          id,
        );
      }
      return normalizeShapeCollectionInstances(item, type.of, shapes);
    });
  }
  const raw = shapeCollectionInstanceValue(value);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return value;
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  if (!shape) return value;
  const object = raw as Record<string, unknown>;
  const result = { ...object };
  for (const field of shape.fields) {
    const key = Object.prototype.hasOwnProperty.call(object, field.id)
      ? field.id
      : Object.prototype.hasOwnProperty.call(object, field.name)
        ? field.name
        : undefined;
    if (key !== undefined)
      result[key] = normalizeShapeCollectionInstances(object[key], field.type, shapes);
  }
  return result;
}

/** Removes the collection envelope before a Shape item enters data mapping. */
export function shapeCollectionInstanceValue(value: unknown): unknown {
  return isShapeCollectionInstance(value) ? value.value : value;
}

export function isImageAssetReference(value: unknown): value is ImageAssetReference {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.assetId === "string" &&
    record.assetId.length > 0 &&
    typeof record.revision === "string" &&
    record.revision.length > 0
  );
}
export function isResolvedImageValue(value: unknown): value is ResolvedImageValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.assetId === "string" &&
    typeof record.url === "string" &&
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    record.width > 0 &&
    typeof record.height === "number" &&
    Number.isFinite(record.height) &&
    record.height > 0 &&
    typeof record.alt === "string" &&
    typeof record.mimeType === "string" &&
    (record.blurHash === null || typeof record.blurHash === "string")
  );
}

/** Checks whether a JSON-like value conforms to a Type and its Shape references. */
export function conformsToType(value: unknown, type: Type, shapes: readonly Shape[] = []): boolean {
  try {
    assertValueConformsToType(value, type, shapes);
    return true;
  } catch {
    return false;
  }
}

export function assertValueConformsToType(
  value: unknown,
  type: Type,
  shapes: readonly Shape[] = [],
  path = "value",
): void {
  if (value === null || value === undefined) throw new InvalidShapeValueError(`${path} is absent.`);
  if (typeof type === "string") {
    const valid =
      type === "text" || type === "color" || type === "date" || type === "datetime"
        ? typeof value === "string"
        : type === "image"
          ? isImageAssetReference(value) || isResolvedImageValue(value)
          : type === "number"
            ? typeof value === "number" && Number.isFinite(value)
            : typeof value === "boolean";
    if (!valid) throw new InvalidShapeValueError(`${path} does not conform to ${type}.`);
    return;
  }
  if (type.kind === "array") {
    if (!Array.isArray(value)) throw new InvalidShapeValueError(`${path} is not an array.`);
    value.forEach((item, index) => {
      const unwrapped =
        typeof type.of !== "string" && type.of.kind === "shape"
          ? shapeCollectionInstanceValue(item)
          : item;
      assertValueConformsToType(unwrapped, type.of, shapes, `${path}[${index}]`);
    });
    return;
  }
  const shape = shapeMap(shapes).get(type.shapeId);
  if (!shape) throw new InvalidShapeValueError(`${path} references an unknown Shape.`);
  assertValueConformsToShape(shapeCollectionInstanceValue(value), shape, shapes, path);
}

export function conformsToShape(
  value: unknown,
  shape: Shape,
  shapes: readonly Shape[] = [shape],
): boolean {
  try {
    assertValueConformsToShape(value, shape, shapes);
    return true;
  } catch {
    return false;
  }
}

export function assertValueConformsToShape(
  value: unknown,
  shape: Shape,
  shapes: readonly Shape[] = [shape],
  path = "value",
): void {
  const allShapes = shapeMap(shapes);
  if (!allShapes.has(shape.id)) throw new InvalidShapeValueError(`Unknown Shape: ${shape.id}.`);
  const raw = shapeCollectionInstanceValue(value);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidShapeValueError(`${path} is not a Shape value.`);
  }
  const object = raw as Record<string, unknown>;
  for (const field of shape.fields) {
    const key = Object.prototype.hasOwnProperty.call(object, field.id)
      ? field.id
      : Object.prototype.hasOwnProperty.call(object, field.name)
        ? field.name
        : undefined;
    const fieldValue = key === undefined ? null : object[key];
    if (fieldValue === null || fieldValue === undefined) {
      if (field.required) throw new InvalidShapeValueError(`${path}.${field.name} is required.`);
      continue;
    }
    assertValueConformsToType(fieldValue, field.type, shapes, `${path}.${field.name}`);
  }
}

export interface Coercion {
  from: PrimitiveType;
  to: PrimitiveType;
  reason: string;
  /** Whether the conversion discards information that should be reported at publish. */
  lossy?: boolean;
  convert(value: unknown): unknown;
}

export class CoercionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoercionError";
  }
}

function parseText(value: unknown, target: string): string {
  if (typeof value !== "string") throw new CoercionError(`Cannot convert value to ${target}.`);
  return value.trim();
}

function parseDate(value: unknown): string {
  const text = parseText(value, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new CoercionError("Invalid date.");
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new CoercionError("Invalid date.");
  }
  return text;
}

function parseDatetime(value: unknown): string {
  const text = parseText(value, "datetime");
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new CoercionError("Invalid datetime.");
  return date.toISOString();
}

const coercions: Coercion[] = [
  {
    from: "number",
    to: "text",
    reason: "Numbers can be represented as text.",
    convert: (value) => String(value),
  },
  {
    from: "number",
    to: "boolean",
    reason: "Zero is false and non-zero numbers are true.",
    convert: (value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new CoercionError("Cannot convert value to boolean.");
      }
      return value !== 0;
    },
  },
  {
    from: "boolean",
    to: "text",
    reason: "Booleans can be represented as text.",
    convert: (value) => String(value),
  },
  {
    from: "datetime",
    to: "date",
    reason: "A datetime can be reduced to its calendar date (lossy).",
    lossy: true,
    convert: (value) => parseDatetime(value).slice(0, 10),
  },
  {
    from: "text",
    to: "number",
    reason: "Numeric text can be parsed as a number.",
    convert: (value) => {
      const text = parseText(value, "number");
      if (text === "") throw new CoercionError("Invalid number.");
      const number = Number(text);
      if (!Number.isFinite(number)) throw new CoercionError("Invalid number.");
      return number;
    },
  },
  {
    from: "text",
    to: "date",
    reason: "Text can be parsed as a calendar date.",
    convert: parseDate,
  },
  {
    from: "text",
    to: "datetime",
    reason: "Text can be parsed as a datetime.",
    convert: parseDatetime,
  },
  {
    from: "text",
    to: "boolean",
    reason: "Empty text, false, and numeric zero are false; other text is true.",
    convert: (value) => {
      const text = parseText(value, "boolean").toLowerCase();
      if (text.length === 0 || text === "false") return false;
      const numeric = Number(text);
      return Number.isFinite(numeric) ? numeric !== 0 : true;
    },
  },
];

/** The complete coercion table. Add a row here to add a supported coercion. */
export const COERCIONS: readonly Coercion[] = coercions;
export const COERCION_TABLE = COERCIONS;

export function findCoercion(from: PrimitiveType, to: PrimitiveType): Coercion | undefined {
  return COERCIONS.find((coercion) => coercion.from === from && coercion.to === to);
}

/** Returns the immediate fields of a named Shape type. */
export function fieldsForType(
  type: Type | null | undefined,
  shapes: readonly Shape[],
): ShapeField[] {
  if (!type || typeof type === "string" || type.kind !== "shape") return [];
  return shapes.find((shape) => shape.id === type.shapeId)?.fields ?? [];
}

/** Whether an assignment is supported by the coercion and Shape rules. */
export function areTypesCompatible(from: Type, to: Type, shapes: readonly Shape[] = []): boolean {
  if (from === to) return true;
  if (typeof from === "string" && typeof to === "string") return !!findCoercion(from, to);
  if (typeof to !== "string" && to.kind === "array") {
    return typeof from !== "string" && from.kind === "array"
      ? areTypesCompatible(from.of, to.of, shapes)
      : areTypesCompatible(from, to.of, shapes);
  }
  if (typeof from !== "string" && from.kind === "array") return false;
  if (
    typeof from !== "string" &&
    from.kind === "shape" &&
    typeof to !== "string" &&
    to.kind === "shape"
  ) {
    const source = shapes.find((shape) => shape.id === from.shapeId);
    const target = shapes.find((shape) => shape.id === to.shapeId);
    if (!source || !target) return false;
    return target.fields.every((targetField) => {
      const normal = targetField.name.replace(/\\s+/g, "").toLowerCase();
      const sourceField = source.fields.find(
        (field) => field.name.replace(/\\s+/g, "").toLowerCase() === normal,
      );
      return !sourceField || areTypesCompatible(sourceField.type, targetField.type, shapes);
    });
  }
  return false;
}

/** Resolves fuzzy Shape field matching once, using stable field ids thereafter. */
export function resolveShapeFieldMapping(
  from: Type,
  to: Type,
  shapes: readonly Shape[],
): Record<string, string> {
  if (
    typeof from === "string" ||
    typeof to === "string" ||
    from.kind !== "shape" ||
    to.kind !== "shape"
  ) {
    return {};
  }
  const source = shapes.find((shape) => shape.id === from.shapeId);
  const target = shapes.find((shape) => shape.id === to.shapeId);
  if (!source || !target) return {};
  const mapping: Record<string, string> = {};
  for (const targetField of target.fields) {
    const normal = targetField.name.replace(/\\s+/g, "").toLowerCase();
    const sourceField = source.fields.find(
      (field) => field.name.replace(/\\s+/g, "").toLowerCase() === normal,
    );
    if (sourceField) mapping[sourceField.id] = targetField.id;
  }
  return mapping;
}

export function coerceValue(
  value: unknown,
  from: Type,
  to: Type,
  shapes: readonly Shape[] = [],
): unknown {
  if (typeof from === "string" && typeof to === "string") {
    if (from === to) return value;
    const coercion = findCoercion(from, to);
    if (!coercion) throw new CoercionError(`No coercion exists from ${from} to ${to}.`);
    return coercion.convert(value);
  }
  if (typeof to !== "string" && to.kind === "array") {
    const sourceType = typeof from !== "string" && from.kind === "array" ? from.of : from;
    const values = Array.isArray(value) ? value : [value];
    return values.map((item) => {
      const existingId =
        typeof to.of !== "string" && to.of.kind === "shape" && isShapeCollectionInstance(item)
          ? item.id
          : undefined;
      const converted = coerceValue(shapeCollectionInstanceValue(item), sourceType, to.of, shapes);
      return typeof to.of !== "string" && to.of.kind === "shape"
        ? createShapeCollectionInstance(converted, existingId)
        : converted;
    });
  }
  if (typeof from !== "string" && from.kind === "array") {
    throw new CoercionError(`Cannot convert ${typeLabel(from)} to ${typeLabel(to)}.`);
  }
  if (
    typeof from !== "string" &&
    from.kind === "shape" &&
    typeof to !== "string" &&
    to.kind === "shape"
  ) {
    const source = shapeMap(shapes).get(from.shapeId);
    const target = shapeMap(shapes).get(to.shapeId);
    if (!source || !target) throw new CoercionError("Cannot convert an unknown Shape.");
    return coerceShapeValue(value, source, target, shapes).value;
  }
  throw new CoercionError(`Cannot convert ${typeLabel(from)} to ${typeLabel(to)}.`);
}

export interface ShapeValueLoss {
  /** Stable field ids, from the outer Shape to the field that lost data. */
  path: string[];
  fieldId: string;
  fieldName: string;
  reason: string;
}

export interface ShapeValueCoercion {
  value: unknown;
  losses: ShapeValueLoss[];
}

function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, copyValue(nested)]),
    );
  }
  return value;
}

function hasOwn(value: unknown, key: string): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key)
  );
}

function typeLabel(type: Type): string {
  if (typeof type === "string") return type;
  if (type.kind === "array") return `array of ${typeLabel(type.of)}`;
  return `Shape ${type.shapeId}`;
}

interface TypeCoercion {
  value: unknown;
  lossy: boolean;
}

function coerceTypeValue(
  value: unknown,
  from: Type,
  to: Type,
  shapes: readonly Shape[],
  path: string[],
  losses: ShapeValueLoss[],
  sourceOverrides: Readonly<Record<string, unknown>>,
): TypeCoercion {
  if (typeof from === "string" && typeof to === "string") {
    if (from === to) return { value: copyValue(value), lossy: false };
    const coercion = findCoercion(from, to);
    if (!coercion) throw new CoercionError(`No coercion exists from ${from} to ${to}.`);
    return { value: copyValue(coercion.convert(value)), lossy: coercion.lossy ?? false };
  }

  if (typeof to !== "string" && to.kind === "array") {
    const values = Array.isArray(value) ? value : [value];
    const sourceType = typeof from !== "string" && from.kind === "array" ? from.of : from;
    let lossy = false;
    const converted = values.map((item, index) => {
      const instance =
        typeof to.of !== "string" && to.of.kind === "shape" && isShapeCollectionInstance(item)
          ? item
          : undefined;
      const result = coerceTypeValue(
        shapeCollectionInstanceValue(item),
        sourceType,
        to.of,
        shapes,
        [...path, String(index)],
        losses,
        sourceOverrides,
      );
      lossy ||= result.lossy;
      return typeof to.of !== "string" && to.of.kind === "shape"
        ? createShapeCollectionInstance(result.value, instance?.id)
        : result.value;
    });
    return { value: converted, lossy };
  }

  if (typeof from !== "string" && from.kind === "array") {
    throw new CoercionError(`Cannot convert ${typeLabel(from)} to ${typeLabel(to)}.`);
  }

  if (
    typeof from !== "string" &&
    from.kind === "shape" &&
    typeof to !== "string" &&
    to.kind === "shape"
  ) {
    const source = shapeMap(shapes).get(from.shapeId);
    const target = shapeMap(shapes).get(to.shapeId);
    if (!source || !target) throw new CoercionError("Cannot convert an unknown Shape.");
    return {
      value: reconcileObject(value, source, target, shapes, path, losses, sourceOverrides),
      lossy: false,
    };
  }

  throw new CoercionError(`Cannot convert ${typeLabel(from)} to ${typeLabel(to)}.`);
}

function reconcileObject(
  value: unknown,
  oldShape: Shape,
  newShape: Shape,
  shapes: readonly Shape[],
  path: string[],
  losses: ShapeValueLoss[],
  sourceOverrides: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const oldObject: Record<string, unknown> =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const oldFields = new Map(oldShape.fields.map((field) => [field.id, field]));
  const result: Record<string, unknown> = {};

  for (const field of oldShape.fields) {
    if (
      !newShape.fields.some((candidate) => candidate.id === field.id) &&
      hasOwn(oldObject, field.id)
    ) {
      losses.push({
        path: [...path, field.id],
        fieldId: field.id,
        fieldName: field.name,
        reason: "Field was removed.",
      });
    }
  }

  for (const field of newShape.fields) {
    const previous = oldFields.get(field.id);
    const fieldPath = [...path, field.id];
    const key =
      previous && hasOwn(oldObject, previous.id)
        ? previous.id
        : previous && hasOwn(oldObject, previous.name)
          ? previous.name
          : undefined;
    const current = key === undefined ? null : oldObject[key];

    if (current === null || current === undefined) {
      if (!previous && hasOwn(sourceOverrides, field.id))
        result[field.id] = copyValue(sourceOverrides[field.id]);
      else if (field.required || (field.defaultValue !== null && field.defaultValue !== undefined))
        result[field.id] = copyValue(field.defaultValue);
      continue;
    }

    if (!previous) {
      result[field.id] = hasOwn(sourceOverrides, field.id)
        ? copyValue(sourceOverrides[field.id])
        : copyValue(field.defaultValue);
      continue;
    }

    try {
      const converted = coerceTypeValue(
        current,
        previous.type,
        field.type,
        shapes,
        fieldPath,
        losses,
        sourceOverrides,
      );
      result[field.id] = converted.value;
      if (converted.lossy)
        losses.push({
          path: fieldPath,
          fieldId: field.id,
          fieldName: field.name,
          reason: `Value was converted from ${typeLabel(previous.type)} to ${typeLabel(field.type)}.`,
        });
    } catch {
      result[field.id] = copyValue(field.defaultValue);
      losses.push({
        path: fieldPath,
        fieldId: field.id,
        fieldName: field.name,
        reason: `Value could not be converted from ${typeLabel(previous.type)} to ${typeLabel(field.type)}; default used.`,
      });
    }
  }

  return result;
}

/** Reconciles one live Shape value with a new Shape during publish. */
export function coerceShapeValue(
  value: unknown,
  oldShape: Shape,
  newShape: Shape,
  shapes: readonly Shape[] = [oldShape, newShape],
  sourceOverrides: Readonly<Record<string, unknown>> = {},
): ShapeValueCoercion {
  const losses: ShapeValueLoss[] = [];
  const reconciled = reconcileObject(
    value,
    oldShape,
    newShape,
    shapes,
    [],
    losses,
    sourceOverrides,
  );
  return { value: reconciled, losses };
}
