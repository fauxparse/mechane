/** The primitive members of the Shape type grammar. */
export const PRIMITIVE_TYPES = [
  "text",
  "number",
  "boolean",
  "image",
  "colour",
  "date",
  "datetime",
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

/** A recursive Type: primitive, array-of-Type, or a named Shape reference. */
export type Type =
  | PrimitiveType
  | { kind: "array"; of: Type }
  | { kind: "shape"; shapeId: string };

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
export interface ImageValue {
  kind: "image";
  value: string;
}
export interface ColourValue {
  kind: "colour";
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
export interface ObjectValue {
  kind: "object";
  value: Record<string, ShapeValue | null>;
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
  | ColourValue
  | DateValue
  | DateTimeValue
  | ObjectValue
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
  else references(type.of, result);
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
          assertValueConformsToType(field.defaultValue, field.type, shapes, `default ${shape.name}.${field.name}`);
        } catch (error) {
          throw new InvalidShapeError(error instanceof Error ? error.message : "Invalid Field default.");
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
      (type === "text" || type === "image" || type === "colour" || type === "date" || type === "datetime")
        ? typeof value === "string"
        : type === "number"
          ? typeof value === "number" && Number.isFinite(value)
          : typeof value === "boolean";
    if (!valid) throw new InvalidShapeValueError(`${path} does not conform to ${type}.`);
    return;
  }
  if (type.kind === "array") {
    if (!Array.isArray(value)) throw new InvalidShapeValueError(`${path} is not an array.`);
    value.forEach((item, index) => assertValueConformsToType(item, type.of, shapes, `${path}[${index}]`));
    return;
  }
  const shape = shapeMap(shapes).get(type.shapeId);
  if (!shape) throw new InvalidShapeValueError(`${path} references an unknown Shape.`);
  assertValueConformsToShape(value, shape, shapes, path);
}

export function conformsToShape(value: unknown, shape: Shape, shapes: readonly Shape[] = [shape]): boolean {
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidShapeValueError(`${path} is not a Shape value.`);
  }
  const object = value as Record<string, unknown>;
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
  { from: "number", to: "text", reason: "Numbers can be represented as text.", convert: (value) => String(value) },
  { from: "boolean", to: "text", reason: "Booleans can be represented as text.", convert: (value) => String(value) },
  {
    from: "datetime",
    to: "date",
    reason: "A datetime can be reduced to its calendar date (lossy).",
    convert: (value) => parseDatetime(value).slice(0, 10),
  },
  { from: "text", to: "number", reason: "Numeric text can be parsed as a number.", convert: (value) => {
    const text = parseText(value, "number");
    if (text === "") throw new CoercionError("Invalid number.");
    const number = Number(text);
    if (!Number.isFinite(number)) throw new CoercionError("Invalid number.");
    return number;
  } },
  { from: "text", to: "date", reason: "Text can be parsed as a calendar date.", convert: parseDate },
  { from: "text", to: "datetime", reason: "Text can be parsed as a datetime.", convert: parseDatetime },
  { from: "text", to: "boolean", reason: "Text can be parsed as a boolean.", convert: (value) => {
    const text = parseText(value, "boolean").toLowerCase();
    if (text === "true") return true;
    if (text === "false") return false;
    throw new CoercionError("Invalid boolean.");
  } },
];

/** The complete coercion table. Add a row here to add a supported coercion. */
export const COERCIONS: readonly Coercion[] = coercions;
export const COERCION_TABLE = COERCIONS;

export function findCoercion(from: PrimitiveType, to: PrimitiveType): Coercion | undefined {
  return COERCIONS.find((coercion) => coercion.from === from && coercion.to === to);
}

/** Whether an assignment is supported by the coercion and Shape rules. */
export function areTypesCompatible(
  from: Type,
  to: Type,
  shapes: readonly Shape[] = [],
): boolean {
  if (from === to) return true;
  if (typeof from === "string" && typeof to === "string") return !!findCoercion(from, to);
  if (typeof to !== "string" && to.kind === "array") {
    return typeof from !== "string" && from.kind === "array"
      ? areTypesCompatible(from.of, to.of, shapes)
      : areTypesCompatible(from, to.of, shapes);
  }
  if (typeof from !== "string" && from.kind === "array") return false;
  if (typeof from !== "string" && from.kind === "shape" && typeof to !== "string" && to.kind === "shape") {
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
  if (typeof from === "string" || typeof to === "string" || from.kind !== "shape" || to.kind !== "shape") {
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

export function coerceValue(value: unknown, from: PrimitiveType, to: PrimitiveType): unknown {
  if (from === to) return value;
  const coercion = findCoercion(from, to);
  if (!coercion) throw new CoercionError(`No coercion exists from ${from} to ${to}.`);
  return coercion.convert(value);
}
