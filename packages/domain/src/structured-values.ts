import { generateId, isId, type StructuredValueId } from "./id";
import type { ShowGraph } from "./graph";
import {
  assertValueConformsToType,
  type ImageAssetReference,
  type Shape,
  type Type,
} from "./shapes";
export type ComputedStructuredValueId = StructuredValueId & {
  readonly __computedStructuredValue: true;
};
/** Stored identity derived from an Event, Action, and structural path. */
export type EventStructuredValueId = StructuredValueId & {
  readonly __eventStructuredValue: true;
};
export type AnyStructuredValueId =
  | StructuredValueId
  | ComputedStructuredValueId
  | EventStructuredValueId;

export interface StructuredValueReference {
  readonly ref: AnyStructuredValueId;
}

export type SimpleValue = string | number | boolean | ImageAssetReference;

/** A live value is scalar data or a reference into a stored or computed overlay. */
export type RuntimeValue = SimpleValue | null | StructuredValueReference;
export type SourceValues = Record<string, RuntimeValue>;

export interface ShapeStructuredValueRecord {
  readonly id: AnyStructuredValueId;
  readonly kind: "shape";
  readonly type: Extract<Type, { kind: "shape" }>;
  readonly fields: Readonly<Record<string, RuntimeValue>>;
}

export interface ArrayStructuredValueRecord {
  readonly id: AnyStructuredValueId;
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
export function isComputedStructuredValueId(value: string): value is ComputedStructuredValueId {
  const [namespace, transformerId, typeKey, pathKey, extra] = value.split(":");
  return (
    namespace === "y" &&
    transformerId !== undefined &&
    transformerId.length > 0 &&
    typeKey !== undefined &&
    typeKey.length > 0 &&
    pathKey !== undefined &&
    extra === undefined
  );
}

/** Builds the reversible identity for one computed structured result. */
export function computedStructuredValueId(
  transformerId: string,
  type: Type,
  path: readonly string[],
): ComputedStructuredValueId {
  const typeKey = encodeURIComponent(JSON.stringify(type));
  const pathKey = path.map((segment) => encodeURIComponent(segment)).join("/");
  const id = `y:${encodeURIComponent(transformerId)}:${typeKey}:${pathKey}`;
  if (!isComputedStructuredValueId(id)) {
    throw new InvalidStructuredValueError("Could not encode a computed Structured Value id.");
  }
  return id;
}

export function isEventStructuredValueId(value: string): value is EventStructuredValueId {
  const [namespace, eventKey, actionKey, pathKey, extra] = value.split(":");
  return (
    namespace === "x" &&
    eventKey !== undefined &&
    eventKey.length > 0 &&
    actionKey !== undefined &&
    actionKey.length > 0 &&
    pathKey !== undefined &&
    extra === undefined
  );
}

/** Encodes Event, Action, and path in the stored namespace, separate from computed ids. */
export function eventStructuredValueId(
  eventId: string,
  actionId: string,
  path: readonly string[],
): EventStructuredValueId {
  const eventKey = encodeURIComponent(eventId);
  const actionKey = encodeURIComponent(actionId);
  const pathKey = path.map((segment) => encodeURIComponent(segment)).join("/");
  const id = `x:${eventKey}:${actionKey}:${pathKey}`;
  if (!isEventStructuredValueId(id)) {
    throw new InvalidStructuredValueError("Could not encode an Event Structured Value id.");
  }
  return id;
}

/** Stored record keys may be random or Event-derived, never computed. */
function isStoredStructuredValueId(value: string): value is StructuredValueId {
  return isId("structuredValue", value) || isEventStructuredValueId(value);
}

export function isStructuredValueReference(value: unknown): value is StructuredValueReference {
  const candidate = object(value);
  return (
    candidate !== null &&
    typeof candidate.ref === "string" &&
    (isStoredStructuredValueId(candidate.ref) || isComputedStructuredValueId(candidate.ref))
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
    isStoredStructuredValueId(candidate.id) &&
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
    isStoredStructuredValueId(candidate.id) &&
    Array.isArray(candidate.items)
  );
}

/**
 * Normalizes authored templates, preserving existing ids by default.
 * A derivation creates fresh ids at every node, including nested authored defaults.
 */
export function normalizeStructuredValueTemplate(
  value: unknown,
  type: Type,
  shapes: readonly Shape[] = [],
  deriveNodeId?: (path: readonly string[]) => StructuredValueId,
): StructuredValueTemplate {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  let result: StructuredValueTemplate = null;
  const pending: Array<{
    value: unknown;
    type: Type;
    path: readonly string[];
    emit: (value: StructuredValueTemplate) => void;
  }> = [
    {
      value,
      type,
      path: [],
      emit: (value) => {
        result = value;
      },
    },
  ];
  while (pending.length > 0) {
    const slot = pending.pop()!;
    if (slot.value === null) {
      slot.emit(null);
      continue;
    }
    if (typeof slot.type === "string") {
      slot.emit(slot.value as SimpleValue);
      continue;
    }
    if (slot.type.kind === "array") {
      const existing = isArrayStructuredValueTemplate(slot.value) ? slot.value : null;
      const input = existing?.items ?? (Array.isArray(slot.value) ? slot.value : []);
      const items: StructuredValueTemplate[] = [];
      slot.emit({
        id: deriveNodeId?.(slot.path) ?? existing?.id ?? generateId("structuredValue"),
        kind: "array",
        items,
      });
      for (let index = input.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: input[index],
          type: slot.type.of,
          path: deriveNodeId ? [...slot.path, String(index)] : slot.path,
          emit: (value) => {
            items[index] = value;
          },
        });
      }
      continue;
    }
    const existing = isShapeStructuredValueTemplate(slot.value) ? slot.value : null;
    const raw = existing?.fields ?? object(slot.value) ?? {};
    const fields: Record<string, StructuredValueTemplate> = Object.create(null);
    slot.emit({
      id: deriveNodeId?.(slot.path) ?? existing?.id ?? generateId("structuredValue"),
      kind: "shape",
      fields,
    });
    const shape = byId.get(slot.type.shapeId);
    if (!shape) continue;
    for (let index = shape.fields.length - 1; index >= 0; index -= 1) {
      const field = shape.fields[index]!;
      const input = Object.hasOwn(raw, field.id)
        ? raw[field.id]
        : Object.hasOwn(raw, field.name)
          ? raw[field.name]
          : field.defaultValue;
      pending.push({
        value: input,
        type: field.type,
        path: deriveNodeId ? [...slot.path, field.id] : slot.path,
        emit: (value) => {
          fields[field.id] = value;
        },
      });
    }
  }
  return result;
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

export function resolveStructuredValueTemplate(value: StructuredValueTemplate): unknown {
  let result: unknown;
  const pending: Array<{ value: StructuredValueTemplate; emit: (value: unknown) => void }> = [
    {
      value,
      emit: (value) => {
        result = value;
      },
    },
  ];
  while (pending.length > 0) {
    const slot = pending.pop()!;
    if (isArrayStructuredValueTemplate(slot.value)) {
      const items: unknown[] = [];
      slot.emit(items);
      for (let index = slot.value.items.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: slot.value.items[index]!,
          emit: (value) => {
            items[index] = value;
          },
        });
      }
    } else if (isShapeStructuredValueTemplate(slot.value)) {
      const fields: Record<string, unknown> = {};
      slot.emit(fields);
      const entries = Object.entries(slot.value.fields);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [fieldId, value] = entries[index]!;
        pending.push({
          value,
          emit: (value) => {
            Object.defineProperty(fields, fieldId, {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          },
        });
      }
    } else slot.emit(slot.value);
  }
  return result;
}

function materialize(
  template: StructuredValueTemplate,
  type: Type,
  shapes: readonly Shape[],
  records: StructuredValues,
): RuntimeValue {
  type Slot = {
    kind: "slot";
    template: StructuredValueTemplate;
    type: Type;
    emit: (value: RuntimeValue) => void;
  };
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  let result: RuntimeValue = null;
  const pending: Array<Slot | { kind: "record"; record: StructuredValueRecord }> = [
    {
      kind: "slot",
      template: normalizeStructuredValueTemplate(template, type, shapes),
      type,
      emit: (value) => {
        result = value;
      },
    },
  ];
  while (pending.length > 0) {
    const slot = pending.pop()!;
    if (slot.kind === "record") {
      insertRecord(records, slot.record);
      continue;
    }
    if (slot.template === null) {
      slot.emit(null);
      continue;
    }
    if (typeof slot.type === "string") {
      slot.emit(slot.template as SimpleValue);
      continue;
    }
    if (slot.type.kind === "array") {
      if (!isArrayStructuredValueTemplate(slot.template)) {
        throw new InvalidStructuredValueError("Expected an array Structured Value Template.");
      }
      const items: RuntimeValue[] = [];
      const record: ArrayStructuredValueRecord = {
        id: slot.template.id,
        kind: "array",
        type: slot.type,
        items,
      };
      slot.emit({ ref: record.id });
      pending.push({ kind: "record", record });
      for (let index = slot.template.items.length - 1; index >= 0; index -= 1) {
        pending.push({
          kind: "slot",
          template: slot.template.items[index]!,
          type: slot.type.of,
          emit: (value) => {
            items[index] = value;
          },
        });
      }
      continue;
    }
    if (!isShapeStructuredValueTemplate(slot.template)) {
      throw new InvalidStructuredValueError("Expected a Shape Structured Value Template.");
    }
    const shape = byId.get(slot.type.shapeId);
    if (!shape) throw new InvalidStructuredValueError(`Unknown Shape "${slot.type.shapeId}".`);
    const fields: Record<string, RuntimeValue> = {};
    const record: ShapeStructuredValueRecord = {
      id: slot.template.id,
      kind: "shape",
      type: slot.type,
      fields,
    };
    slot.emit({ ref: record.id });
    pending.push({ kind: "record", record });
    for (let index = shape.fields.length - 1; index >= 0; index -= 1) {
      const field = shape.fields[index]!;
      pending.push({
        kind: "slot",
        template: slot.template.fields[field.id] ?? null,
        type: field.type,
        emit: (value) => {
          Object.defineProperty(fields, field.id, {
            value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        },
      });
    }
  }
  return result;
}

function insertRecord(records: StructuredValues, record: StructuredValueRecord): void {
  const previous = records[record.id];
  if (previous && JSON.stringify(previous) !== JSON.stringify(record)) {
    throw new InvalidStructuredValueError(`Structured Value id "${record.id}" is duplicated.`);
  }
  records[record.id] = record;
}

export function materializeRunState(
  graph: ShowGraph,
  sourceTemplates: Readonly<Record<string, StructuredValueTemplate>>,
): RunState {
  const structuredValues: StructuredValues = {};
  const sourceValues: SourceValues = {};
  for (const source of graph.nodes) {
    if (source.kind !== "source" || source.parentId !== null) continue;
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

/** Materializes the Source records owned by one Flow/Device Instance. */
export function materializeInstanceState(
  graph: ShowGraph,
  flowId: string,
  sourceTemplates: Readonly<Record<string, StructuredValueTemplate>>,
): RunState {
  const structuredValues: StructuredValues = {};
  const sourceValues: SourceValues = {};
  for (const source of graph.nodes) {
    if (source.kind !== "source" || source.parentId !== flowId) continue;
    sourceValues[source.id] = materialize(
      sourceTemplates[source.id] ?? null,
      source.type,
      graph.shapes ?? [],
      structuredValues,
    );
  }
  return { sourceValues, structuredValues };
}

/** Creates the composed view used by a Device Instance without scope shadowing. */
export function composeInstanceView(shared: RunState, instance: RunState): RunState {
  return {
    sourceValues: { ...shared.sourceValues, ...instance.sourceValues },
    structuredValues: { ...shared.structuredValues, ...instance.structuredValues },
  };
}

export function resolveRuntimeValue(
  value: RuntimeValue,
  structuredValues: Readonly<Record<string, StructuredValueRecord>>,
  resolving?: ReadonlySet<string>,
): unknown {
  type Slot = { kind: "slot"; value: RuntimeValue; emit: (value: unknown) => void };
  let result: unknown;
  const expanding = new Set(resolving);
  const pending: Array<Slot | { kind: "leave"; ref: string }> = [
    {
      kind: "slot",
      value,
      emit: (value) => {
        result = value;
      },
    },
  ];
  while (pending.length > 0) {
    const slot = pending.pop()!;
    if (slot.kind === "leave") {
      expanding.delete(slot.ref);
      continue;
    }
    if (!isStructuredValueReference(slot.value)) {
      slot.emit(slot.value);
      continue;
    }
    const record = structuredValues[slot.value.ref];
    if (!record) throw new InvalidStructuredValueError(`Dangling reference "${slot.value.ref}".`);
    if (expanding.has(slot.value.ref)) {
      throw new InvalidStructuredValueError(`Reference cycle through "${slot.value.ref}".`);
    }
    expanding.add(slot.value.ref);
    pending.push({ kind: "leave", ref: slot.value.ref });
    if (record.kind === "array") {
      const items: unknown[] = [];
      slot.emit(items);
      for (let index = record.items.length - 1; index >= 0; index -= 1) {
        pending.push({
          kind: "slot",
          value: record.items[index]!,
          emit: (value) => {
            items[index] = value;
          },
        });
      }
    } else {
      const fields: Record<string, unknown> = {};
      slot.emit(fields);
      const entries = Object.entries(record.fields);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [fieldId, value] = entries[index]!;
        pending.push({
          kind: "slot",
          value,
          emit: (value) => {
            Object.defineProperty(fields, fieldId, {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          },
        });
      }
    }
  }
  return result;
}

/**
 * Reads a Field path without flattening the references it crosses, so the
 * result still carries the identity a Formula needs to read `item.field`.
 * Plain objects are walked too: authored defaults never became records.
 */
export function runtimeValueAtPath(
  value: unknown,
  path: readonly string[],
  structuredValues: Readonly<Record<string, StructuredValueRecord>>,
): unknown {
  let current = value;
  for (const fieldId of path) {
    if (isStructuredValueReference(current)) {
      const record = structuredValues[current.ref];
      if (record?.kind !== "shape") return undefined;
      current = record.fields[fieldId];
      continue;
    }
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
): void {
  type Slot = { kind: "slot"; value: RuntimeValue; type: Type; path: string };
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const ancestors = new Set<string>();
  const pending: Array<Slot | { kind: "leave"; id: string }> = [
    { kind: "slot", value, type, path },
  ];
  while (pending.length > 0) {
    const slot = pending.pop()!;
    if (slot.kind === "leave") {
      ancestors.delete(slot.id);
      continue;
    }
    if (
      slot.value === null &&
      typeof slot.type !== "string" &&
      slot.path.startsWith("Source ") &&
      !slot.path.includes(".") &&
      !slot.path.includes("[")
    )
      continue;
    if (typeof slot.type === "string") {
      if (isStructuredValueReference(slot.value)) {
        throw new InvalidStructuredValueError(
          `${slot.path} references a Structured Value for scalar ${slot.type}.`,
        );
      }
      try {
        assertValueConformsToType(slot.value, slot.type, shapes);
      } catch (error) {
        throw new InvalidStructuredValueError(
          `${slot.path} is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      continue;
    }
    if (!isStructuredValueReference(slot.value)) {
      throw new InvalidStructuredValueError(`${slot.path} must be a Structured Value reference.`);
    }
    const record = state.structuredValues[slot.value.ref];
    if (!record)
      throw new InvalidStructuredValueError(
        `${slot.path} has dangling reference "${slot.value.ref}".`,
      );
    if (ancestors.has(record.id)) {
      throw new InvalidStructuredValueError(
        `${slot.path} introduces a reference cycle at "${record.id}".`,
      );
    }
    ancestors.add(record.id);
    pending.push({ kind: "leave", id: record.id });
    if (slot.type.kind === "array") {
      if (record.kind !== "array") {
        throw new InvalidStructuredValueError(
          `${slot.path} references a Shape where an array is required.`,
        );
      }
      for (let index = record.items.length - 1; index >= 0; index -= 1) {
        pending.push({
          kind: "slot",
          value: record.items[index]!,
          type: slot.type.of,
          path: `${slot.path}[${index}]`,
        });
      }
      continue;
    }
    if (record.kind !== "shape" || record.type.shapeId !== slot.type.shapeId) {
      throw new InvalidStructuredValueError(`${slot.path} references the wrong Shape type.`);
    }
    const shape = byId.get(slot.type.shapeId);
    if (!shape)
      throw new InvalidStructuredValueError(
        `${slot.path} references unknown Shape "${slot.type.shapeId}".`,
      );
    for (let index = shape.fields.length - 1; index >= 0; index -= 1) {
      const field = shape.fields[index]!;
      if (!Object.prototype.hasOwnProperty.call(record.fields, field.id)) {
        throw new InvalidStructuredValueError(`${slot.path} is missing Field "${field.id}".`);
      }
      const fieldValue = record.fields[field.id];
      if (fieldValue === null && !field.required) continue;
      pending.push({
        kind: "slot",
        value: fieldValue!,
        type: field.type,
        path: `${slot.path}.${field.id}`,
      });
    }
  }
}

/** Validates id syntax, record/key agreement, complete closure, acyclicity and Type conformance. */
export function assertValidRunState(state: RunState, graph: ShowGraph): void {
  for (const [id, record] of Object.entries(state.structuredValues)) {
    if (!isStoredStructuredValueId(id) || record.id !== id) {
      throw new InvalidStructuredValueError(`Invalid Structured Value record key "${id}".`);
    }
  }
  for (const source of graph.nodes) {
    if (source.kind !== "source") continue;
    if (source.parentId !== null) {
      if (Object.prototype.hasOwnProperty.call(state.sourceValues, source.id)) {
        throw new InvalidStructuredValueError(
          `Run state cannot contain Flow-local Source "${source.id}".`,
        );
      }
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(state.sourceValues, source.id)) {
      throw new InvalidStructuredValueError(`Missing live value for Source "${source.id}".`);
    }
    assertRuntimeValue(
      state.sourceValues[source.id]!,
      source.type,
      state,
      graph.shapes ?? [],
      `Source ${source.id}`,
    );
  }
  for (const sourceId of Object.keys(state.sourceValues)) {
    if (!graph.nodes.some((node) => node.kind === "source" && node.id === sourceId)) {
      throw new InvalidStructuredValueError(`Live value belongs to unknown Source "${sourceId}".`);
    }
  }
}
