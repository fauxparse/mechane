import { generateId, isId, type StructuredValueId } from "./id";
import type { ShowGraph } from "./graph";
import {
  assertValueConformsToType,
  type ImageAssetReference,
  type Shape,
  type Type,
} from "./shapes";

export interface StructuredValueReference {
  readonly ref: StructuredValueId;
}

export type SimpleValue = string | number | boolean | ImageAssetReference;

/** A live value is either scalar data or a reference into the Run-owned graph. */
export type RuntimeValue = SimpleValue | null | StructuredValueReference;
export type SourceValues = Record<string, RuntimeValue>;

export interface ShapeStructuredValueRecord {
  readonly id: StructuredValueId;
  readonly kind: "shape";
  readonly type: Extract<Type, { kind: "shape" }>;
  readonly fields: Readonly<Record<string, RuntimeValue>>;
}

export interface ArrayStructuredValueRecord {
  readonly id: StructuredValueId;
  readonly kind: "array";
  readonly type: Extract<Type, { kind: "array" }>;
  readonly items: readonly RuntimeValue[];
}

export type StructuredValueRecord = ShapeStructuredValueRecord | ArrayStructuredValueRecord;
export type StructuredValues = Record<string, StructuredValueRecord>;

export interface RunState {
  readonly sourceValues: SourceValues;
  readonly structuredValues: StructuredValues;
}

export interface ShapeStructuredValueTemplate {
  readonly id: StructuredValueId;
  readonly kind: "shape";
  readonly fields: Readonly<Record<string, StructuredValueTemplate>>;
}

export interface ArrayStructuredValueTemplate {
  readonly id: StructuredValueId;
  readonly kind: "array";
  readonly items: readonly StructuredValueTemplate[];
}

/** Authored structured defaults are nested, immutable templates with stable node ids. */
export type StructuredValueTemplate =
  | SimpleValue
  | null
  | ShapeStructuredValueTemplate
  | ArrayStructuredValueTemplate;

export class InvalidStructuredValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStructuredValueError";
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isStructuredValueReference(value: unknown): value is StructuredValueReference {
  const candidate = object(value);
  return (
    candidate !== null &&
    typeof candidate.ref === "string" &&
    isId("structuredValue", candidate.ref)
  );
}

export function isShapeStructuredValueTemplate(
  value: unknown,
): value is ShapeStructuredValueTemplate {
  const candidate = object(value);
  return (
    candidate !== null &&
    candidate.kind === "shape" &&
    typeof candidate.id === "string" &&
    isId("structuredValue", candidate.id) &&
    object(candidate.fields) !== null
  );
}

export function isArrayStructuredValueTemplate(
  value: unknown,
): value is ArrayStructuredValueTemplate {
  const candidate = object(value);
  return (
    candidate !== null &&
    candidate.kind === "array" &&
    typeof candidate.id === "string" &&
    isId("structuredValue", candidate.id) &&
    Array.isArray(candidate.items)
  );
}

/** Adds stable identity to every structured node in an authored value. */
export function normalizeStructuredValueTemplate(
  value: unknown,
  type: Type,
  shapes: readonly Shape[] = [],
): StructuredValueTemplate {
  if (typeof type === "string") return value as SimpleValue | null;
  if (type.kind === "array") {
    const existing = isArrayStructuredValueTemplate(value) ? value : null;
    const items = existing?.items ?? (Array.isArray(value) ? value : []);
    return {
      id: existing?.id ?? generateId("structuredValue"),
      kind: "array",
      items: items.map((item) => normalizeStructuredValueTemplate(item, type.of, shapes)),
    };
  }

  const existing = isShapeStructuredValueTemplate(value) ? value : null;
  const raw = existing?.fields ?? object(value) ?? {};
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  const fields: Record<string, StructuredValueTemplate> = {};
  if (shape) {
    for (const field of shape.fields) {
      const rawValue = Object.prototype.hasOwnProperty.call(raw, field.id)
        ? raw[field.id]
        : Object.prototype.hasOwnProperty.call(raw, field.name)
          ? raw[field.name]
          : field.defaultValue;
      fields[field.id] = normalizeStructuredValueTemplate(rawValue, field.type, shapes);
    }
  }
  return {
    id: existing?.id ?? generateId("structuredValue"),
    kind: "shape",
    fields,
  };
}

export function resolveStructuredValueTemplate(value: StructuredValueTemplate): unknown {
  if (isArrayStructuredValueTemplate(value)) return value.items.map(resolveStructuredValueTemplate);
  if (isShapeStructuredValueTemplate(value)) {
    return Object.fromEntries(
      Object.entries(value.fields).map(([fieldId, fieldValue]) => [
        fieldId,
        resolveStructuredValueTemplate(fieldValue),
      ]),
    );
  }
  return value;
}

function materialize(
  template: StructuredValueTemplate,
  type: Type,
  shapes: readonly Shape[],
  records: StructuredValues,
): RuntimeValue {
  if (typeof type === "string") return template as SimpleValue | null;
  const normalized = normalizeStructuredValueTemplate(template, type, shapes);
  if (type.kind === "array") {
    if (!isArrayStructuredValueTemplate(normalized)) {
      throw new InvalidStructuredValueError("Expected an array Structured Value Template.");
    }
    const record: ArrayStructuredValueRecord = {
      id: normalized.id,
      kind: "array",
      type,
      items: normalized.items.map((item) => materialize(item, type.of, shapes, records)),
    };
    insertRecord(records, record);
    return { ref: record.id };
  }
  if (!isShapeStructuredValueTemplate(normalized)) {
    throw new InvalidStructuredValueError("Expected a Shape Structured Value Template.");
  }
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  if (!shape) throw new InvalidStructuredValueError(`Unknown Shape "${type.shapeId}".`);
  const fields = Object.fromEntries(
    shape.fields.map((field) => [
      field.id,
      materialize(normalized.fields[field.id] ?? null, field.type, shapes, records),
    ]),
  );
  const record: ShapeStructuredValueRecord = {
    id: normalized.id,
    kind: "shape",
    type,
    fields,
  };
  insertRecord(records, record);
  return { ref: record.id };
}

function insertRecord(records: StructuredValues, record: StructuredValueRecord): void {
  const previous = records[record.id];
  if (previous && JSON.stringify(previous) !== JSON.stringify(record)) {
    throw new InvalidStructuredValueError(`Structured Value id "${record.id}" is duplicated.`);
  }
  records[record.id] = record;
}

export function materializeStructuredValue(
  template: StructuredValueTemplate,
  type: Type,
  shapes: readonly Shape[] = [],
): { value: RuntimeValue; structuredValues: StructuredValues } {
  const structuredValues: StructuredValues = {};
  return {
    value: materialize(template, type, shapes, structuredValues),
    structuredValues,
  };
}

/** Reuses canonical identities when reconciliation retained the same containers. */
export function preserveStructuredValueTemplateIds(
  template: StructuredValueTemplate,
  type: Type,
  currentValue: RuntimeValue | undefined,
  structuredValues: Readonly<Record<string, StructuredValueRecord>>,
  shapes: readonly Shape[] = [],
): StructuredValueTemplate {
  if (typeof type === "string" || !isStructuredValueReference(currentValue)) return template;
  const record = structuredValues[currentValue.ref];
  if (type.kind === "array") {
    if (record?.kind !== "array" || !isArrayStructuredValueTemplate(template)) return template;
    return {
      ...template,
      id: record.id,
      items: template.items.map((item, index) =>
        preserveStructuredValueTemplateIds(
          item,
          type.of,
          record.items[index],
          structuredValues,
          shapes,
        ),
      ),
    };
  }
  if (record?.kind !== "shape" || !isShapeStructuredValueTemplate(template)) return template;
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  if (!shape) return { ...template, id: record.id };
  return {
    ...template,
    id: record.id,
    fields: Object.fromEntries(
      shape.fields.map((field) => [
        field.id,
        preserveStructuredValueTemplateIds(
          template.fields[field.id] ?? null,
          field.type,
          record.fields[field.id],
          structuredValues,
          shapes,
        ),
      ]),
    ),
  };
}
export function materializeRunState(
  graph: ShowGraph,
  sourceTemplates: Readonly<Record<string, StructuredValueTemplate>>,
): RunState {
  const structuredValues: StructuredValues = {};
  const sourceValues: SourceValues = {};
  for (const source of graph.nodes) {
    if (source.kind !== "source") continue;
    sourceValues[source.id] = materialize(
      sourceTemplates[source.id] ?? null,
      source.type,
      graph.shapes ?? [],
      structuredValues,
    );
  }
  const state = { sourceValues, structuredValues };
  assertValidRunState(state, graph);
  return state;
}

export function resolveRuntimeValue(
  value: RuntimeValue,
  structuredValues: Readonly<Record<string, StructuredValueRecord>>,
  resolving: ReadonlySet<string> = new Set(),
): unknown {
  if (!isStructuredValueReference(value)) return value;
  const record = structuredValues[value.ref];
  if (!record) throw new InvalidStructuredValueError(`Dangling reference "${value.ref}".`);
  if (resolving.has(value.ref)) {
    throw new InvalidStructuredValueError(`Reference cycle through "${value.ref}".`);
  }
  const nested = new Set(resolving);
  nested.add(value.ref);
  if (record.kind === "array") {
    return record.items.map((item) => resolveRuntimeValue(item, structuredValues, nested));
  }
  return Object.fromEntries(
    Object.entries(record.fields).map(([fieldId, fieldValue]) => [
      fieldId,
      resolveRuntimeValue(fieldValue, structuredValues, nested),
    ]),
  );
}

export function resolveSourceValues(state: RunState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state.sourceValues).map(([sourceId, value]) => [
      sourceId,
      resolveRuntimeValue(value, state.structuredValues),
    ]),
  );
}

function assertRuntimeValue(
  value: RuntimeValue,
  type: Type,
  state: RunState,
  shapes: readonly Shape[],
  path: string,
  ancestors: ReadonlySet<string>,
): void {
  if (typeof type === "string") {
    if (isStructuredValueReference(value)) {
      throw new InvalidStructuredValueError(
        `${path} references a Structured Value for scalar ${type}.`,
      );
    }
    try {
      assertValueConformsToType(value, type, shapes);
    } catch (error) {
      throw new InvalidStructuredValueError(
        `${path} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }
  if (!isStructuredValueReference(value)) {
    throw new InvalidStructuredValueError(`${path} must be a Structured Value reference.`);
  }
  const record = state.structuredValues[value.ref];
  if (!record)
    throw new InvalidStructuredValueError(`${path} has dangling reference "${value.ref}".`);
  if (ancestors.has(record.id)) {
    throw new InvalidStructuredValueError(
      `${path} introduces a reference cycle at "${record.id}".`,
    );
  }
  const nested = new Set(ancestors);
  nested.add(record.id);
  if (type.kind === "array") {
    if (record.kind !== "array") {
      throw new InvalidStructuredValueError(
        `${path} references a Shape where an array is required.`,
      );
    }
    record.items.forEach((item, index) =>
      assertRuntimeValue(item, type.of, state, shapes, `${path}[${index}]`, nested),
    );
    return;
  }
  if (record.kind !== "shape" || record.type.shapeId !== type.shapeId) {
    throw new InvalidStructuredValueError(`${path} references the wrong Shape type.`);
  }
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  if (!shape)
    throw new InvalidStructuredValueError(`${path} references unknown Shape "${type.shapeId}".`);
  for (const field of shape.fields) {
    if (!Object.prototype.hasOwnProperty.call(record.fields, field.id)) {
      throw new InvalidStructuredValueError(`${path} is missing Field "${field.id}".`);
    }
    const fieldValue = record.fields[field.id];
    if (fieldValue === null && !field.required) continue;
    assertRuntimeValue(fieldValue!, field.type, state, shapes, `${path}.${field.id}`, nested);
  }
}

/** Validates id syntax, record/key agreement, complete closure, acyclicity and Type conformance. */
export function assertValidRunState(state: RunState, graph: ShowGraph): void {
  for (const [id, record] of Object.entries(state.structuredValues)) {
    if (!isId("structuredValue", id) || record.id !== id) {
      throw new InvalidStructuredValueError(`Invalid Structured Value record key "${id}".`);
    }
  }
  for (const source of graph.nodes) {
    if (source.kind !== "source") continue;
    if (!Object.prototype.hasOwnProperty.call(state.sourceValues, source.id)) {
      throw new InvalidStructuredValueError(`Missing live value for Source "${source.id}".`);
    }
    assertRuntimeValue(
      state.sourceValues[source.id]!,
      source.type,
      state,
      graph.shapes ?? [],
      `Source ${source.id}`,
      new Set(),
    );
  }
  for (const sourceId of Object.keys(state.sourceValues)) {
    if (!graph.nodes.some((node) => node.kind === "source" && node.id === sourceId)) {
      throw new InvalidStructuredValueError(`Live value belongs to unknown Source "${sourceId}".`);
    }
  }
}
