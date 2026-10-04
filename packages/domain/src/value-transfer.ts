import { generateId, type StructuredValueId } from "./id";
import type { ShowGraph, SourceFieldDefault } from "./graph";
import { typeAtPath } from "./property-values";
import { defaultSourceValueTemplate } from "./source-defaults";
import type { ImageAssetReference, Shape, ShapeField, Type } from "./shapes";
import {
  isArrayStructuredValueTemplate,
  isShapeStructuredValueTemplate,
  isStructuredValueReference,
  type ArrayStructuredValueRecord,
  type ArrayStructuredValueTemplate,
  type RuntimeValue,
  type ShapeStructuredValueRecord,
  type ShapeStructuredValueTemplate,
  type StructuredValueRecord,
  type StructuredValueTemplate,
  type StructuredValues,
} from "./structured-values";

/** The reserved format identifier of the typed Source-value envelope. */
export const SOURCE_VALUE_FORMAT = "mechane/source-value";
/** The graph fragment's reserved identifier, recognized only to be refused. */
export const SHOW_GRAPH_FORMAT = "mechane/show-graph";
/** Version 1 accepts version 1 only; a new wire field is a new version. */
export const SOURCE_VALUE_VERSION = 1;
/** Inclusive UTF-8 byte budget per supplied representation (#874). */
export const VALUE_MAX_BYTES = 10 * 1024 * 1024;
/** Inclusive logical-record budget, shared by producer and consumer. */
export const VALUE_MAX_LOGICAL_RECORDS = 100_000;

const MEMBERS = {
  envelope: {
    format: true,
    version: true,
    origin: true,
    type: true,
    root: true,
    shapes: true,
    records: true,
  },
  origin: { showId: true, plane: true },
  shape: { id: true, name: true, fields: true },
  field: { id: true, name: true, type: true, required: true },
  arrayType: { kind: true, of: true },
  shapeType: { kind: true, shapeId: true },
  arrayRecord: { id: true, kind: true, type: true, items: true },
  shapeRecord: { id: true, kind: true, type: true, fields: true },
} as const;
const PRIMITIVE_NAMES: Readonly<Record<string, true | undefined>> = {
  text: true,
  number: true,
  boolean: true,
  image: true,
  color: true,
  date: true,
  datetime: true,
};

// ---------------------------------------------------------------------------
// Targets and handoffs
// ---------------------------------------------------------------------------

/** Which of a Show's two value planes a target addresses (#872). */
export type ValuePlane = "default" | "current";

/**
 * One explicitly pinned destination. The Current Instance's authoritative
 * identity is the runId/deviceId composite — that is the DB's primary key —
 * so no Instance is ever inferred.
 */
export type ValueTarget =
  | {
      readonly kind: "default";
      readonly showId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly string[];
      readonly draftVersion: number;
    }
  | {
      readonly kind: "current-show";
      readonly showId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly string[];
      readonly runId: string;
      readonly publishedVersion: number;
    }
  | {
      readonly kind: "current-instance";
      readonly showId: string;
      readonly sourceId: string;
      readonly fieldPath: readonly string[];
      readonly runId: string;
      readonly publishedVersion: number;
      readonly deviceId: string;
      readonly flowId: string;
    };

/** One representation exposed by a chosen read; immutable text, never reread. */
export interface ValueHandoffRepresentation {
  readonly mediaType: string;
  readonly text: string;
}

export type ValueHandoff = readonly ValueHandoffRepresentation[];

// ---------------------------------------------------------------------------
// Portable envelope
// ---------------------------------------------------------------------------

/** The Type grammar travels unchanged: primitive, array-of, or named Shape. */
export type PortableType = Type;

/** Shape metadata as captured: identity and declared contract, no defaults. */
export interface PortableShapeField {
  readonly id: string;
  readonly name: string;
  readonly type: PortableType;
  readonly required: boolean;
}

export interface PortableShape {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly PortableShapeField[];
}

/** A value in the payload: scalar, explicit null, image pair, or token ref. */
export type PortableValue =
  | string
  | number
  | boolean
  | null
  | ImageAssetReference
  | { readonly ref: string };

export interface PortableShapeRecord {
  /** Payload-local token, not a live Structured Value id. */
  readonly id: string;
  readonly kind: "shape";
  readonly type: Extract<PortableType, { kind: "shape" }>;
  /** Source Field ids, interpreted through the supplied metadata. */
  readonly fields: Readonly<Record<string, PortableValue>>;
}

export interface PortableArrayRecord {
  readonly id: string;
  readonly kind: "array";
  readonly type: Extract<PortableType, { kind: "array" }>;
  readonly items: readonly PortableValue[];
}

export type PortableRecord = PortableShapeRecord | PortableArrayRecord;

/** The exact version-1 typed layout; every listed member is required. */
export interface TypedValueEnvelope {
  readonly format: typeof SOURCE_VALUE_FORMAT;
  readonly version: typeof SOURCE_VALUE_VERSION;
  readonly origin: { readonly showId: string; readonly plane: ValuePlane };
  readonly type: PortableType;
  readonly root: PortableValue;
  readonly shapes: readonly PortableShape[];
  readonly records: readonly PortableRecord[];
}

const validatedValue = Symbol("ValidatedValue");
export type ValidatedValue = (
  | { readonly kind: "typed"; readonly envelope: TypedValueEnvelope }
  | { readonly kind: "plain"; readonly value: unknown }
) & { readonly [validatedValue]: true };

export function validateValueInput(value: unknown): ValidatedValue {
  if (isPlainObject(value) && value.format === SHOW_GRAPH_FORMAT)
    reject("decode", "wrong-kind", "Show graph content cannot replace a Source value.");
  if (isPlainObject(value) && value.format === SOURCE_VALUE_FORMAT) {
    return { kind: "typed", envelope: assertValidValueEnvelope(value), [validatedValue]: true };
  }
  countPlainOccurrences(value);
  return { kind: "plain", value, [validatedValue]: true };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type ValueTransferDiagnosticCategory =
  | "browser-failure"
  | "rejected-input"
  | "commit-rejected"
  | "outcome-unknown";

export interface ValueTransferDiagnostic {
  readonly category: ValueTransferDiagnosticCategory;
  readonly stage: string;
  readonly code: string;
  readonly message: string;
  readonly path: readonly string[];
  readonly nextAction: string;
}

export class ValueTransferError extends Error {
  readonly diagnostic: ValueTransferDiagnostic;

  constructor(diagnostic: ValueTransferDiagnostic) {
    super(diagnostic.message);
    this.name = "ValueTransferError";
    this.diagnostic = diagnostic;
  }
}

const COPY_AGAIN = "Copy the value again, then paste.";
const MATCHING_TYPE = "Copy a value whose Type matches the destination, then paste.";

function reject(
  stage: string,
  code: string,
  message: string,
  path: DiagnosticPath = [],
  nextAction: string = COPY_AGAIN,
): never {
  throw new ValueTransferError({
    category: "rejected-input",
    stage,
    code,
    message,
    path: pathArray(path),
    nextAction,
  });
}

type DiagnosticPath =
  | readonly string[]
  | { readonly parent: DiagnosticPath; readonly segment: string };

function appendPath(parent: DiagnosticPath, segment: string): DiagnosticPath {
  return { parent, segment };
}

function pathArray(path: DiagnosticPath): readonly string[] {
  if (!("segment" in path)) return path;
  const suffix: string[] = [];
  let current: DiagnosticPath = path;
  while ("segment" in current) {
    suffix.push(current.segment);
    current = current.parent;
  }
  return [...current, ...suffix.reverse()];
}

function pathLabel(path: DiagnosticPath): string {
  const parts = pathArray(path);
  return parts.length === 0 ? "value" : `value.${parts.join(".")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

/** Exactly `{assetId, revision}` with non-empty strings — nothing broader. */
function isExactImagePair(value: unknown): value is ImageAssetReference {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("assetId") || !keys.includes("revision")) return false;
  return (
    typeof value.assetId === "string" &&
    value.assetId.length > 0 &&
    typeof value.revision === "string" &&
    value.revision.length > 0
  );
}

function simpleValueConforms(value: unknown, primitive: string): boolean {
  switch (primitive) {
    case "text":
    case "color":
    case "date":
    case "datetime":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "image":
      return isExactImagePair(value);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

function scalarJson(value: unknown): string | null {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        reject(
          "encode",
          "invalid-value",
          "A finite number is required; the value is not representable.",
        );
      }
      return String(value);
    case "string":
      return JSON.stringify(value);
    default:
      return null;
  }
}

type SerialFrame =
  | { readonly kind: "array"; readonly items: readonly unknown[]; index: number }
  | {
      readonly kind: "object";
      readonly keys: readonly string[];
      readonly source: Record<string, unknown>;
      index: number;
    };

const utf8 = new TextEncoder();

/** Iterative JSON serializer; bounded by data, not by the call stack. */
function serializeJson(value: unknown, sortKeys: boolean, limit = Infinity): string {
  const out: string[] = [];
  const stack: SerialFrame[] = [];
  let bytes = 0;
  const emit = (text: string) => {
    if (limit !== Infinity) {
      bytes += utf8.encode(text).byteLength;
      if (bytes > limit)
        reject(
          "encode",
          "byte-limit",
          "The value exceeds 10 MiB of UTF-8 text.",
          [],
          "Copy a smaller value.",
        );
    }
    out.push(text);
  };
  const emitValue = (subject: unknown): void => {
    if (
      typeof subject === "string" &&
      limit !== Infinity &&
      utf8.encode(subject).byteLength > limit
    ) {
      reject(
        "encode",
        "byte-limit",
        "The value exceeds 10 MiB of UTF-8 text.",
        [],
        "Copy a smaller value.",
      );
    }
    const scalar = scalarJson(subject);
    if (scalar !== null) {
      emit(scalar);
      return;
    }
    if (Array.isArray(subject)) {
      emit("[");
      stack.push({ kind: "array", items: subject, index: 0 });
      return;
    }
    if (isPlainObject(subject)) {
      emit("{");
      const keys = Object.keys(subject);
      if (sortKeys) keys.sort();
      stack.push({ kind: "object", keys, source: subject, index: 0 });
      return;
    }
    reject("encode", "invalid-value", "The value contains data JSON cannot represent.");
  };
  emitValue(value);
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    if (top.kind === "array") {
      if (top.index >= top.items.length) {
        emit("]");
        stack.pop();
        continue;
      }
      if (top.index > 0) emit(",");
      emitValue(top.items[top.index++]!);
    } else {
      if (top.index >= top.keys.length) {
        emit("}");
        stack.pop();
        continue;
      }
      if (top.index > 0) emit(",");
      const key = top.keys[top.index++]!;
      emit(`${JSON.stringify(key)}:`);
      emitValue(top.source[key]);
    }
  }
  return out.join("");
}

/**
 * Key-order-independent canonical JSON: object keys sort, arrays and Shape
 * Field order stay, so two structures that differ only in key order compare
 * equal while authored order still carries meaning.
 */
export function canonicalValue(value: unknown): string {
  return serializeJson(value, true);
}

/** Iterative JSON text in natural member order, for the portable channel. */
export function portableText(value: unknown): string {
  return serializeJson(value, false, VALUE_MAX_BYTES);
}

// ---------------------------------------------------------------------------
// Envelope validation
// ---------------------------------------------------------------------------

function assertExactMembers(
  value: Record<string, unknown>,
  expected: Readonly<Record<string, true | undefined>>,
  path: readonly string[] | (() => readonly string[]),
): void {
  const at = () => (typeof path === "function" ? path() : path);
  for (const key of Object.keys(value)) {
    if (expected[key] !== true)
      reject(
        "decode",
        "unknown-field",
        `Unexpected member "${key}" on the ${pathLabel(at())} envelope layout.`,
        [...at(), key],
      );
  }
  for (const key of Object.keys(expected)) {
    if (!hasOwn(value, key))
      reject("decode", "malformed-envelope", `The ${pathLabel(at())} is missing member "${key}".`, [
        ...at(),
        key,
      ]);
  }
}

function assertPortableType(
  type: unknown,
  path: readonly string[],
  refs: Set<string>,
): asserts type is PortableType {
  let current = type;
  let depth = 0;
  const seen = new WeakSet<object>();
  const at = () => path.concat(Array<string>(depth).fill("[]"));
  while (true) {
    if (typeof current === "string") {
      if (PRIMITIVE_NAMES[current] !== true)
        reject("decode", "malformed-envelope", `"${current}" is not a primitive Type.`, at());
      return;
    }
    if (!isPlainObject(current))
      reject("decode", "malformed-envelope", "The declared Type is malformed.", at());
    if (seen.has(current)) reject("decode", "cycle", "The declared Type is cyclic.", at());
    seen.add(current);
    if (current.kind === "array") {
      assertExactMembers(current, MEMBERS.arrayType, at);
      current = current.of;
      depth += 1;
      continue;
    }
    if (current.kind === "shape") {
      assertExactMembers(current, MEMBERS.shapeType, at);
      if (typeof current.shapeId !== "string" || current.shapeId.length === 0)
        reject("decode", "malformed-envelope", "The declared Type names no Shape.", at());
      refs.add(current.shapeId);
      return;
    }
    reject("decode", "malformed-envelope", "The declared Type is malformed.", at());
  }
}

interface EnvelopeContext {
  readonly shapes: Map<string, PortableShape>;
  readonly records: Map<string, PortableRecord>;
  readonly signatures: WeakMap<object, { depth: number; leaf: string }>;
}

const primitiveSignatures: Readonly<Record<string, { depth: number; leaf: string }>> = {
  text: { depth: 0, leaf: "text" },
  number: { depth: 0, leaf: "number" },
  boolean: { depth: 0, leaf: "boolean" },
  image: { depth: 0, leaf: "image" },
  date: { depth: 0, leaf: "date" },
  datetime: { depth: 0, leaf: "datetime" },
  color: { depth: 0, leaf: "color" },
};

function typeSignature(
  type: PortableType,
  cache: EnvelopeContext["signatures"],
): { depth: number; leaf: string } {
  if (typeof type === "string") return primitiveSignatures[type]!;
  const cached = cache.get(type);
  if (cached) return cached;
  const parents: object[] = [];
  let current = type;
  let signature: { depth: number; leaf: string };
  while (true) {
    const known = cache.get(current);
    if (known) {
      signature = known;
      break;
    }
    if (current.kind === "shape") {
      signature = { depth: 0, leaf: `shape:${current.shapeId}` };
      cache.set(current, signature);
      break;
    }
    parents.push(current);
    if (typeof current.of === "string") {
      signature = primitiveSignatures[current.of]!;
      break;
    }
    current = current.of;
  }
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    signature = { depth: signature.depth + 1, leaf: signature.leaf };
    cache.set(parents[index]!, signature);
  }
  return signature;
}

function refTokenOf(value: unknown): string | null {
  if (!isPlainObject(value)) return null;
  if (Object.keys(value).length !== 1 || typeof value.ref !== "string" || value.ref.length === 0) {
    return null;
  }
  return value.ref as string;
}
function portableSlot(value: unknown): PortableValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isExactImagePair(value)) return value;
  const ref = refTokenOf(value);
  if (ref !== null) return { ref };
  reject(
    "decode",
    "malformed-envelope",
    "A portable value must be a finite scalar, absence, exact image pair or local reference.",
  );
}

function assertPortableSlot(
  value: unknown,
  type: PortableType,
  context: EnvelopeContext,
  path: readonly string[],
  allowsNull: boolean,
): void {
  if (value === null) {
    if (!allowsNull) {
      reject(
        "decode",
        "prohibited-absence",
        `${pathLabel(path)} is absent where a value is required.`,
        path,
        MATCHING_TYPE,
      );
    }
    return;
  }
  if (typeof type === "string") {
    if (!simpleValueConforms(value, type)) {
      reject(
        "decode",
        "incompatible-type",
        `${pathLabel(path)} does not conform to ${type}.`,
        path,
        MATCHING_TYPE,
      );
    }
    return;
  }
  const token = refTokenOf(value);
  if (token === null) {
    reject(
      "decode",
      "malformed-envelope",
      `${pathLabel(path)} must be a {ref} reference to a structured record.`,
      path,
    );
  }
  const record = context.records.get(token);
  if (!record) {
    reject(
      "decode",
      "unresolved-reference",
      `${pathLabel(path)} references unknown record "${token}".`,
      path,
    );
  }
  if (type.kind === "array") {
    if (record.kind !== "array") {
      reject(
        "decode",
        "incompatible-type",
        `${pathLabel(path)} requires an array record.`,
        path,
        MATCHING_TYPE,
      );
    }
    const expected = typeSignature(type, context.signatures);
    const actual = typeSignature(record.type, context.signatures);
    if (expected.depth !== actual.depth || expected.leaf !== actual.leaf)
      reject(
        "decode",
        "incompatible-type",
        "An array record declares another item Type.",
        path,
        MATCHING_TYPE,
      );
    return;
  }
  if (record.kind !== "shape" || record.type.shapeId !== type.shapeId) {
    reject(
      "decode",
      "incompatible-type",
      `${pathLabel(path)} requires a "${type.shapeId}" record.`,
      path,
      MATCHING_TYPE,
    );
  }
}

function recordEdges(record: PortableRecord): string[] {
  const tokens: string[] = [];
  const values = record.kind === "shape" ? Object.values(record.fields) : record.items;
  for (const value of values) {
    const token = refTokenOf(value);
    if (token !== null) tokens.push(token);
  }
  return tokens;
}

function assertAcyclicReferences(
  nodes: Iterable<string>,
  edgesFor: (id: string) => Iterable<string> | undefined,
  layout: "shapes" | "records",
): void {
  const color = new Map<string, "visiting" | "done">();
  for (const id of nodes) {
    if (color.has(id)) continue;
    color.set(id, "visiting");
    const stack = [{ id, edges: edgesFor(id)![Symbol.iterator]() }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = top.edges.next();
      if (next.done) {
        color.set(top.id, "done");
        stack.pop();
        continue;
      }
      const state = color.get(next.value);
      if (state === "visiting")
        reject("decode", "cycle", `References form a cycle through "${next.value}".`, [
          layout,
          next.value,
        ]);
      if (state === "done") continue;
      const edges = edgesFor(next.value);
      if (!edges)
        reject(
          "decode",
          "unresolved-reference",
          `Reference "${next.value}" has no supplied definition.`,
          [layout, next.value],
        );
      color.set(next.value, "visiting");
      stack.push({ id: next.value, edges: edges[Symbol.iterator]() });
    }
  }
}

/**
 * Strict version-1 schema check over a decoded envelope: exact members,
 * closed Type grammar and Shape closure, complete records keyed by declared
 * Field ids, resolved reference targets, no cycles, and the shared
 * logical-record budget — including records the value never reaches.
 */
export function assertValidValueEnvelope(value: unknown): TypedValueEnvelope {
  if (!isPlainObject(value)) {
    reject("decode", "malformed-envelope", "A Source-value envelope must be a JSON object.", [
      "value",
    ]);
  }
  assertExactMembers(value, MEMBERS.envelope, ["value"]);
  if (value.format !== SOURCE_VALUE_FORMAT) {
    reject(
      "decode",
      "unsupported-format",
      `"${String(value.format)}" is not a Source-value envelope.`,
      ["value", "format"],
    );
  }
  if (typeof value.version !== "number" || value.version !== SOURCE_VALUE_VERSION) {
    reject("decode", "unsupported-version", `Unsupported Source-value version.`, [
      "value",
      "version",
    ]);
  }
  if (!isPlainObject(value.origin)) {
    reject("decode", "malformed-envelope", "The envelope origin must be an object.", [
      "value",
      "origin",
    ]);
  }
  assertExactMembers(value.origin, MEMBERS.origin, ["value", "origin"]);
  if (typeof value.origin.showId !== "string" || value.origin.showId.length === 0) {
    reject("decode", "malformed-envelope", "The envelope origin names no Show.", [
      "value",
      "origin",
      "showId",
    ]);
  }
  if (value.origin.plane !== "default" && value.origin.plane !== "current") {
    reject(
      "decode",
      "malformed-envelope",
      `The envelope origin plane must be "default" or "current".`,
      ["value", "origin", "plane"],
    );
  }
  const typeRefs = new Set<string>();
  assertPortableType(value.type, ["value", "type"], typeRefs);
  if (!Array.isArray(value.shapes)) {
    reject("decode", "malformed-envelope", "The envelope shapes must be an array.", [
      "value",
      "shapes",
    ]);
  }
  if (!Array.isArray(value.records)) {
    reject("decode", "malformed-envelope", "The envelope records must be an array.", [
      "value",
      "records",
    ]);
  }

  const shapes = new Map<string, PortableShape>();
  const fieldIds = new Set<string>();
  const shapeEdges = new Map<string, Set<string>>();
  let logicalRecords = 0;
  for (const entry of value.shapes) {
    if (!isPlainObject(entry)) {
      reject("decode", "malformed-envelope", "Each Shape must be an object.", ["value", "shapes"]);
    }
    assertExactMembers(entry, MEMBERS.shape, ["value", "shapes"]);
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      reject("decode", "malformed-envelope", "A Shape has no id.", ["value", "shapes"]);
    }
    if (shapes.has(entry.id)) {
      reject("decode", "malformed-envelope", `Duplicate Shape "${entry.id}".`, [
        "value",
        "shapes",
        entry.id,
      ]);
    }
    if (typeof entry.name !== "string") {
      reject("decode", "malformed-envelope", `Shape "${entry.id}" has no name.`, [
        "value",
        "shapes",
        entry.id,
      ]);
    }
    if (!Array.isArray(entry.fields)) {
      reject("decode", "malformed-envelope", `Shape "${entry.id}" fields must be an array.`, [
        "value",
        "shapes",
        entry.id,
      ]);
    }
    const fieldRefs = new Set<string>();
    const names = new Set<string>();
    const fields: PortableShapeField[] = [];
    for (const field of entry.fields) {
      if (!isPlainObject(field)) {
        reject("decode", "malformed-envelope", `Shape "${entry.id}" has a non-object Field.`, [
          "value",
          "shapes",
          entry.id,
        ]);
      }
      assertExactMembers(field, MEMBERS.field, ["value", "shapes", entry.id]);
      if (typeof field.id !== "string" || field.id.length === 0) {
        reject("decode", "malformed-envelope", `Shape "${entry.id}" has a Field with no id.`, [
          "value",
          "shapes",
          entry.id,
        ]);
      }
      if (fieldIds.has(field.id)) {
        reject("decode", "malformed-envelope", `Duplicate Field id "${field.id}".`, [
          "value",
          "shapes",
          entry.id,
          field.id,
        ]);
      }
      fieldIds.add(field.id);
      if (typeof field.name !== "string") {
        reject("decode", "malformed-envelope", `Field "${field.id}" has no name.`, [
          "value",
          "shapes",
          entry.id,
          field.id,
        ]);
      }
      if (names.has(field.name)) {
        reject(
          "decode",
          "malformed-envelope",
          `Shape "${entry.id}" has duplicate Field name "${field.name}".`,
          ["value", "shapes", entry.id],
        );
      }
      names.add(field.name);
      if (typeof field.required !== "boolean") {
        reject("decode", "malformed-envelope", `Field "${field.id}" required must be a boolean.`, [
          "value",
          "shapes",
          entry.id,
          field.id,
        ]);
      }
      assertPortableType(field.type, ["value", "shapes", entry.id, field.id], fieldRefs);
      fields.push({ id: field.id, name: field.name, type: field.type, required: field.required });
    }
    shapes.set(entry.id, { id: entry.id, name: entry.name, fields });
    shapeEdges.set(entry.id, fieldRefs);
    logicalRecords += 1 + entry.fields.length;
  }
  assertAcyclicReferences(shapeEdges.keys(), (id) => shapeEdges.get(id), "shapes");

  const records = new Map<string, PortableRecord>();
  logicalRecords += value.records.length;
  if (logicalRecords > VALUE_MAX_LOGICAL_RECORDS) {
    reject(
      "decode",
      "limit-exceeded",
      `The value carries ${logicalRecords} logical records; at most ${VALUE_MAX_LOGICAL_RECORDS} are portable.`,
      ["value"],
      "Copy a smaller value.",
    );
  }

  for (const ref of typeRefs) {
    if (!shapes.has(ref)) {
      reject(
        "decode",
        "unresolved-reference",
        `The declared Type references Shape "${ref}" the metadata omits.`,
        ["value", "type"],
      );
    }
  }
  for (const entry of value.records) {
    if (!isPlainObject(entry)) {
      reject("decode", "malformed-envelope", "Each record must be an object.", [
        "value",
        "records",
      ]);
    }
    if (entry.kind === "shape") {
      assertExactMembers(entry, MEMBERS.shapeRecord, ["value", "records"]);
    } else if (entry.kind === "array") {
      assertExactMembers(entry, MEMBERS.arrayRecord, ["value", "records"]);
    } else {
      reject("decode", "malformed-envelope", `Unknown record kind "${String(entry.kind)}".`, [
        "value",
        "records",
      ]);
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      reject("decode", "malformed-envelope", "A record has no token.", ["value", "records"]);
    }
    if (records.has(entry.id)) {
      reject("decode", "malformed-envelope", `Duplicate record token "${entry.id}".`, [
        "value",
        "records",
        entry.id,
      ]);
    }
    if (!isPlainObject(entry.type)) {
      reject("decode", "malformed-envelope", `Record "${entry.id}" has no Type.`, [
        "value",
        "records",
        entry.id,
      ]);
    }
    if (entry.kind === "shape") {
      assertExactMembers(entry.type, MEMBERS.shapeType, ["value", "records", entry.id, "type"]);
      if (entry.type.kind !== "shape") {
        reject("decode", "malformed-envelope", `Record "${entry.id}" must declare a shape Type.`, [
          "value",
          "records",
          entry.id,
        ]);
      }
      if (typeof entry.type.shapeId !== "string" || !shapes.has(entry.type.shapeId)) {
        reject(
          "decode",
          "unresolved-reference",
          `Record "${entry.id}" references unknown Shape metadata.`,
          ["value", "records", entry.id],
        );
      }
      if (!isPlainObject(entry.fields)) {
        reject("decode", "malformed-envelope", `Record "${entry.id}" fields must be an object.`, [
          "value",
          "records",
          entry.id,
        ]);
      }
      const fields: Record<string, PortableValue> = Object.create(null);
      for (const [id, value] of Object.entries(entry.fields)) fields[id] = portableSlot(value);
      records.set(entry.id, {
        id: entry.id,
        kind: "shape",
        type: { kind: "shape", shapeId: entry.type.shapeId },
        fields,
      });
    } else {
      assertExactMembers(entry.type, MEMBERS.arrayType, ["value", "records", entry.id, "type"]);
      if (entry.type.kind !== "array") {
        reject("decode", "malformed-envelope", `Record "${entry.id}" must declare an array Type.`, [
          "value",
          "records",
          entry.id,
        ]);
      }
      const itemRefs = new Set<string>();
      assertPortableType(entry.type.of, ["value", "records", entry.id, "type", "of"], itemRefs);
      for (const ref of itemRefs) {
        if (!shapes.has(ref)) {
          reject(
            "decode",
            "unresolved-reference",
            `Record "${entry.id}" item Type omits Shape "${ref}".`,
            ["value", "records", entry.id],
          );
        }
      }
      if (!Array.isArray(entry.items)) {
        reject("decode", "malformed-envelope", `Record "${entry.id}" items must be an array.`, [
          "value",
          "records",
          entry.id,
        ]);
      }
      records.set(entry.id, {
        id: entry.id,
        kind: "array",
        type: { kind: "array", of: entry.type.of },
        items: entry.items.map(portableSlot),
      });
    }
  }

  const context: EnvelopeContext = { shapes, records, signatures: new WeakMap() };
  const root = portableSlot(value.root);
  assertPortableSlot(root, value.type, context, ["value", "root"], true);
  for (const [token, record] of records) {
    if (record.kind === "shape") {
      const shape = shapes.get(record.type.shapeId)!;
      const declared = new Set(shape.fields.map((field) => field.id));
      for (const key of Object.keys(record.fields)) {
        if (!declared.has(key)) {
          reject(
            "decode",
            "unknown-field",
            `Record "${token}" has Field "${key}" its Shape does not declare.`,
            ["value", "records", token, key],
          );
        }
      }
      if (Object.keys(record.fields).length !== shape.fields.length) {
        reject("decode", "malformed-envelope", `Record "${token}" is missing a declared Field.`, [
          "value",
          "records",
          token,
        ]);
      }
      for (const field of shape.fields) {
        assertPortableSlot(
          record.fields[field.id]!,
          field.type,
          context,
          ["value", "records", token, field.id],
          !field.required,
        );
      }
      continue;
    }
    for (const [index, item] of record.items.entries()) {
      assertPortableSlot(
        item,
        record.type.of,
        context,
        ["value", "records", token, String(index)],
        false,
      );
    }
  }
  assertAcyclicReferences(
    records.keys(),
    (id) => {
      const record = records.get(id);
      return record ? recordEdges(record) : undefined;
    },
    "records",
  );
  const reachable = new Set<string>();
  const rootToken = refTokenOf(root);
  const pending = rootToken === null ? [] : [rootToken];
  while (pending.length > 0) {
    const token = pending.pop()!;
    if (reachable.has(token)) continue;
    reachable.add(token);
    const record = records.get(token)!;
    for (const child of recordEdges(record)) pending.push(child);
  }
  if (reachable.size !== records.size) {
    reject("decode", "unused-record", "The envelope contains records outside the selected value.", [
      "value",
      "records",
    ]);
  }
  return {
    format: SOURCE_VALUE_FORMAT,
    version: SOURCE_VALUE_VERSION,
    origin: { showId: value.origin.showId, plane: value.origin.plane },
    type: value.type,
    root,
    shapes: [...shapes.values()],
    records: [...records.values()],
  };
}

// ---------------------------------------------------------------------------
// Projection: live/authored values out, envelope form
// ---------------------------------------------------------------------------

export interface RuntimeValueProjectionInput {
  readonly showId: string;
  readonly plane: ValuePlane;
  readonly type: Type;
  readonly allowsAbsence: boolean;
  readonly shapes: readonly Shape[];
  /**
   * The selected value as its reader holds it: a `RuntimeValue`, or the
   * evaluated plain tree `resolveGraph` produces, whose structured slots may
   * carry nested `{ref}` references into `structuredValues`. `undefined` and
   * nonconforming values reject — evaluation failure is never absence.
   */
  readonly value: unknown;
  readonly structuredValues: Readonly<Record<string, StructuredValueRecord>>;
}

interface ProjectionSlot {
  readonly emit: (value: PortableValue) => void;
  readonly value: unknown;
  readonly type: Type;
  readonly allowsNull: boolean;
  readonly path: DiagnosticPath;
}
interface ProjectionItems {
  index: number;
  readonly items: readonly unknown[];
  readonly output: PortableValue[];
  readonly type: Type;
  readonly path: DiagnosticPath;
}

interface ProjectionContext {
  readonly shapeById: Map<string, Shape>;
  readonly tokensByRecordId: Map<string, string>;
  readonly records: PortableRecord[];
  readonly shapeOrder: string[];
  readonly shapeSeen: Set<string>;
  readonly slots: Array<ProjectionSlot | ProjectionItems>;
  nextToken: number;
  logicalRecords: number;
}

function portableShapeOf(shape: Shape): PortableShape {
  return {
    id: shape.id,
    name: shape.name,
    fields: shape.fields.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      required: field.required,
    })),
  };
}

type RecordSource =
  | { readonly kind: "shape"; readonly fields: Readonly<Record<string, unknown>> }
  | { readonly kind: "array"; readonly items: readonly unknown[] };

function expandRecordNode(
  context: ProjectionContext,
  type: Extract<Type, { kind: "shape" }> | Extract<Type, { kind: "array" }>,
  source: RecordSource,
  path: DiagnosticPath,
): string {
  if (++context.logicalRecords > VALUE_MAX_LOGICAL_RECORDS)
    reject("projection", "record-limit", "The value exceeds 100,000 logical records.", path);
  const token = `r${context.nextToken}`;
  context.nextToken += 1;
  if (type.kind === "shape") {
    if (source.kind !== "shape")
      reject("projection", "invalid-value", "A Shape record is required.", path);
    if (!context.shapeSeen.has(type.shapeId)) {
      context.shapeSeen.add(type.shapeId);
      context.shapeOrder.push(type.shapeId);
    }
    const shape = context.shapeById.get(type.shapeId);
    if (!shape) {
      reject(
        "projection",
        "unknown-shape",
        `${pathLabel(path)} references unknown Shape "${type.shapeId}".`,
        path,
      );
    }
    const fields: Record<string, PortableValue> = Object.create(null);
    context.records.push({ id: token, kind: "shape", type, fields });
    for (let index = shape.fields.length - 1; index >= 0; index -= 1) {
      const field = shape.fields[index]!;
      if (!hasOwn(source.fields as Record<string, unknown>, field.id)) {
        reject(
          "projection",
          "invalid-value",
          `${pathLabel(path)} is missing Field "${field.name}".`,
          path,
        );
      }
      context.slots.push({
        emit: (value) => {
          fields[field.id] = value;
        },
        value: source.fields[field.id],
        type: field.type,
        allowsNull: !field.required,
        path: appendPath(path, field.id),
      });
    }
    return token;
  }
  if (source.kind !== "array")
    reject("projection", "invalid-value", "An array record is required.", path);
  const items: PortableValue[] = [];
  context.records.push({ id: token, kind: "array", type, items });
  context.slots.push({ index: 0, items: source.items, output: items, type: type.of, path });
  return token;
}

/** Projects one complete selected value into its portable typed envelope. */
function projectValue(
  input: RuntimeValueProjectionInput & { readonly kind: "runtime" | "template" },
): TypedValueEnvelope {
  const context: ProjectionContext = {
    shapeById: new Map(input.shapes.map((shape) => [shape.id, shape])),
    tokensByRecordId: new Map(),
    records: [],
    shapeOrder: [],
    shapeSeen: new Set(),
    slots: [],
    nextToken: 0,
    logicalRecords: 0,
  };
  const signatures: EnvelopeContext["signatures"] = new WeakMap();
  let scalarBytes = 0;
  const declaredTypes: Type[] = [input.type];
  while (declaredTypes.length > 0) {
    const declared = declaredTypes.pop()!;
    if (typeof declared === "string") continue;
    if (declared.kind === "array") {
      declaredTypes.push(declared.of);
      continue;
    }
    if (context.shapeSeen.has(declared.shapeId)) continue;
    const shape = context.shapeById.get(declared.shapeId);
    if (!shape)
      reject(
        "projection",
        "unknown-shape",
        "The declared value Type references an unavailable Shape.",
      );
    context.logicalRecords += 1 + shape.fields.length;
    if (context.logicalRecords > VALUE_MAX_LOGICAL_RECORDS)
      reject(
        "projection",
        "record-limit",
        "The declared metadata exceeds 100,000 logical records.",
      );
    context.shapeSeen.add(shape.id);
    context.shapeOrder.push(shape.id);
    for (let index = shape.fields.length - 1; index >= 0; index -= 1)
      declaredTypes.push(shape.fields[index]!.type);
  }
  let root: PortableValue | null = null;
  let rootEmitted = false;
  context.slots.push({
    emit: (value) => {
      root = value;
      rootEmitted = true;
    },
    value: input.value,
    type: input.type,
    allowsNull: input.allowsAbsence,
    path: [],
  });
  while (context.slots.length > 0) {
    const slot = context.slots.pop()!;
    if ("index" in slot) {
      if (slot.index >= slot.items.length) continue;
      const index = slot.index++;
      context.slots.push(slot, {
        emit: (value) => {
          slot.output[index] = value;
        },
        value: slot.items[index],
        type: slot.type,
        allowsNull: false,
        path: appendPath(slot.path, String(index)),
      });
      continue;
    }
    const { value, type, allowsNull, path } = slot;
    const emit = (value: PortableValue) => {
      const text = scalarJson(value) ?? JSON.stringify(value);
      scalarBytes += utf8.encode(text).byteLength;
      if (scalarBytes > VALUE_MAX_BYTES)
        reject("projection", "byte-limit", "The value exceeds 10 MiB of UTF-8 text.", path);
      slot.emit(value);
    };
    if (value === undefined)
      reject(
        "projection",
        "unavailable-value",
        "The selected value is unavailable, not absent.",
        path,
      );
    if (value === null) {
      if (!allowsNull) {
        reject(
          "projection",
          "invalid-value",
          `${pathLabel(path)} cannot be absent.`,
          path,
          MATCHING_TYPE,
        );
      }
      emit(null);
      continue;
    }
    if (typeof type === "string") {
      if (!simpleValueConforms(value, type)) {
        reject(
          "projection",
          "invalid-value",
          `${pathLabel(path)} does not conform to ${type}.`,
          path,
          MATCHING_TYPE,
        );
      }
      if (type === "image") {
        const pair = value as ImageAssetReference;
        emit({ assetId: pair.assetId, revision: pair.revision });
        continue;
      }
      emit(value as PortableValue);
      continue;
    }
    if (
      input.kind === "template" &&
      (isShapeStructuredValueTemplate(value) || isArrayStructuredValueTemplate(value))
    ) {
      if (value.kind !== type.kind)
        reject(
          "projection",
          "invalid-value",
          "The authored template does not match its declared Type.",
          path,
        );
      const shared = context.tokensByRecordId.get(value.id);
      if (shared !== undefined) {
        emit({ ref: shared });
        continue;
      }
      const source: RecordSource =
        value.kind === "shape"
          ? { kind: "shape", fields: value.fields }
          : { kind: "array", items: value.items };
      const token = expandRecordNode(context, type, source, path);
      context.tokensByRecordId.set(value.id, token);
      emit({ ref: token });
      continue;
    }
    if (isStructuredValueReference(value)) {
      const record = input.structuredValues[value.ref];
      if (!record) {
        reject(
          "projection",
          "unresolved-reference",
          `${pathLabel(path)} has a dangling reference.`,
          path,
        );
      }
      if (type.kind === "array") {
        if (record.kind !== "array") {
          reject(
            "projection",
            "invalid-value",
            `${pathLabel(path)} requires an array value.`,
            path,
            MATCHING_TYPE,
          );
        }
        const expected = typeSignature(type, signatures);
        const actual = typeSignature(record.type, signatures);
        if (expected.depth !== actual.depth || expected.leaf !== actual.leaf)
          reject("projection", "invalid-value", "The stored array has another item Type.", path);
      } else if (record.kind !== "shape" || record.type.shapeId !== type.shapeId) {
        reject(
          "projection",
          "invalid-value",
          `${pathLabel(path)} requires a "${type.shapeId}" value.`,
          path,
          MATCHING_TYPE,
        );
      }
      const shared = context.tokensByRecordId.get(record.id);
      if (shared !== undefined) {
        emit({ ref: shared });
        continue;
      }
      const token = expandRecordNode(context, type, record, path);
      context.tokensByRecordId.set(record.id, token);
      emit({ ref: token });
      continue;
    }
    if (type.kind === "array") {
      if (!Array.isArray(value)) {
        reject(
          "projection",
          "invalid-value",
          `${pathLabel(path)} is not an array.`,
          path,
          MATCHING_TYPE,
        );
      }
      emit({ ref: expandRecordNode(context, type, { kind: "array", items: value }, path) });
      continue;
    }
    if (!isPlainObject(value)) {
      reject(
        "projection",
        "invalid-value",
        `${pathLabel(path)} is not a Shape value.`,
        path,
        MATCHING_TYPE,
      );
    }
    emit({ ref: expandRecordNode(context, type, { kind: "shape", fields: value }, path) });
  }
  if (!rootEmitted) {
    reject("projection", "invalid-value", "The selected value could not be projected.");
  }
  const envelope: TypedValueEnvelope = {
    format: SOURCE_VALUE_FORMAT,
    version: SOURCE_VALUE_VERSION,
    origin: { showId: input.showId, plane: input.plane },
    type: input.type,
    root: root!,
    shapes: context.shapeOrder.map((id) => portableShapeOf(context.shapeById.get(id)!)),
    records: context.records,
  };
  // The producer holds itself to the consumer's schema: a projection that
  // cannot survive strict validation never leaves this seam.
  return assertValidValueEnvelope(envelope);
}

/** Reads only Current storage or its evaluated overlay; never fills Defaults. */
export function projectRuntimeValue(input: RuntimeValueProjectionInput): TypedValueEnvelope {
  return projectValue({ ...input, kind: "runtime" });
}

export interface DefaultValueProjectionInput {
  readonly showId: string;
  readonly graph: ShowGraph;
  readonly sourceId: string;
  readonly fieldPath: readonly string[];
}

/**
 * The effective Default at a stable Field path — inherited values expanded,
 * authored sharing retained — as a complete typed envelope. Reads nothing
 * but the graph's own defaults; Current is the other plane's business.
 */
export function defaultTemplateAtPath(
  graph: ShowGraph,
  sourceId: string,
  fieldPath: readonly string[],
): StructuredValueTemplate {
  const source = graph.nodes.find((node) => node.id === sourceId);
  if (source?.kind !== "source")
    reject(
      "projection",
      "unaddressable-target",
      "The selected Source is unavailable.",
      [sourceId],
      SELECT_AGAIN,
    );
  let value = defaultSourceValueTemplate(source, graph);
  for (const fieldId of fieldPath) {
    if (!isShapeStructuredValueTemplate(value) || !hasOwn(value.fields, fieldId))
      reject(
        "projection",
        "unaddressable-target",
        "The Field path crosses an absent or unavailable ancestor.",
        [sourceId, ...fieldPath],
        SELECT_AGAIN,
      );
    value = value.fields[fieldId]!;
  }
  return value;
}

export function projectDefaultValue(input: DefaultValueProjectionInput): TypedValueEnvelope {
  const contract = selectedValueContract(input.graph, input.sourceId, input.fieldPath);
  return projectValue({
    kind: "template",
    showId: input.showId,
    plane: "default",
    type: contract.type,
    allowsAbsence: contract.allowsAbsence,
    shapes: input.graph.shapes ?? [],
    value: defaultTemplateAtPath(input.graph, input.sourceId, input.fieldPath),
    structuredValues: {},
  });
}

// ---------------------------------------------------------------------------
// Expansion: envelope in, plain tree out
// ---------------------------------------------------------------------------

interface ExpansionSlot {
  readonly emit: (value: unknown) => void;
  readonly value: PortableValue;
}

/**
 * The plain-JSON twin of a typed envelope: exact Field names, declared Field
 * order, explicit null for optional absence, arrays in item order. Sharing
 * is deliberately lost — each reference expands where it occurs.
 */
export function expandPortableValue(envelope: TypedValueEnvelope): unknown {
  const shapes = new Map(envelope.shapes.map((shape) => [shape.id, shape]));
  const records = new Map(envelope.records.map((record) => [record.id, record]));
  let root: unknown = null;
  const stack: Array<{ kind: "slot"; slot: ExpansionSlot } | { kind: "settle"; token: string }> = [
    {
      kind: "slot",
      slot: {
        emit: (value) => {
          root = value;
        },
        value: envelope.root,
      },
    },
  ];
  const expanding = new Set<string>();
  let occurrences = 0;
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === "settle") {
      expanding.delete(frame.token);
      continue;
    }
    const { emit, value } = frame.slot;
    if (value === null || typeof value !== "object") {
      emit(value);
      continue;
    }
    const token = refTokenOf(value);
    if (token === null) {
      // An image pair is a simple value even though it is an object.
      emit(value);
      continue;
    }
    const record = records.get(token);
    if (!record) {
      reject("decode", "unresolved-reference", `Unknown record "${token}".`, ["records", token]);
    }
    if (expanding.has(token)) {
      reject("decode", "cycle", `Record references form a cycle through "${token}".`, [
        "records",
        token,
      ]);
    }
    occurrences += 1;
    if (occurrences > VALUE_MAX_LOGICAL_RECORDS)
      reject(
        "encode",
        "record-limit",
        "The plain expansion exceeds 100,000 logical records.",
        [],
        "Copy the typed value, or a smaller value.",
      );
    expanding.add(token);
    stack.push({ kind: "settle", token });
    if (record.kind === "shape") {
      const shape = shapes.get(record.type.shapeId);
      if (!shape) {
        reject(
          "decode",
          "unresolved-reference",
          `Record "${token}" references missing Shape metadata.`,
          ["records", token],
        );
      }
      const out: Record<string, unknown> = Object.create(null);
      emit(out);
      for (let index = shape.fields.length - 1; index >= 0; index -= 1) {
        const field = shape.fields[index]!;
        if (!hasOwn(record.fields, field.id)) {
          reject(
            "decode",
            "malformed-envelope",
            `Record "${token}" is missing Field "${field.name}".`,
            ["records", token],
          );
        }
        stack.push({
          kind: "slot",
          slot: {
            emit: (child) => {
              out[field.name] = child;
            },
            value: record.fields[field.id]!,
          },
        });
      }
      continue;
    }
    const out: unknown[] = [];
    emit(out);
    for (let index = record.items.length - 1; index >= 0; index -= 1) {
      const item = record.items[index]!;
      stack.push({
        kind: "slot",
        slot: {
          emit: (child) => {
            out[index] = child;
          },
          value: item,
        },
      });
    }
  }
  return root;
}

// ---------------------------------------------------------------------------
// Compatibility and fresh-clone replacement
// ---------------------------------------------------------------------------

export interface ValueReplacementContract {
  readonly type: Type;
  readonly shapes: readonly Shape[];
  readonly allowsAbsence: boolean;
}

export interface PreparedValueReplacement {
  readonly value: RuntimeValue;
  readonly structuredValues: StructuredValues;
  readonly template: StructuredValueTemplate;
  readonly images: readonly ImageAssetReference[];
}

const SELECT_AGAIN = "Select the target again in the inspector.";

function assertTypesCompatible(
  source: PortableType,
  destination: PortableType,
  sourceShapes: Map<string, PortableShape>,
  destinationShapes: Map<string, Shape>,
): void {
  const settled = new Map<string, Set<string>>();
  const stack: Array<{ source: PortableType; destination: PortableType; path: DiagnosticPath }> = [
    { source, destination, path: [] },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const { source: at, destination: dt, path } = current;
    if (typeof at === "string" || typeof dt === "string") {
      if (at !== dt) {
        reject(
          "compatibility",
          "incompatible-type",
          `Copied Type ${typeof at === "string" ? at : at.kind} does not match destination Type ${
            typeof dt === "string" ? dt : dt.kind
          }.`,
          path,
          MATCHING_TYPE,
        );
      }
      continue;
    }
    if (at.kind !== dt.kind) {
      reject(
        "compatibility",
        "incompatible-type",
        "The copied Type and destination Type differ in kind.",
        path,
        MATCHING_TYPE,
      );
    }
    if (at.kind === "array") {
      if (dt.kind !== "array")
        reject(
          "compatibility",
          "incompatible-type",
          "The copied Type and destination Type differ in kind.",
          path,
          MATCHING_TYPE,
        );
      stack.push({ source: at.of, destination: dt.of, path: appendPath(path, "[]") });
      continue;
    }
    if (dt.kind !== "shape")
      reject(
        "compatibility",
        "incompatible-type",
        "The copied Type and destination Type differ in kind.",
        path,
        MATCHING_TYPE,
      );
    const sourceShape = sourceShapes.get(at.shapeId);
    const destinationShape = destinationShapes.get(dt.shapeId);
    if (!sourceShape || !destinationShape) {
      reject(
        "compatibility",
        "unknown-shape",
        "The destination does not define the Shape this value needs.",
        path,
        SELECT_AGAIN,
      );
    }
    let destinations = settled.get(at.shapeId);
    if (destinations?.has(dt.shapeId)) continue;
    if (!destinations) {
      destinations = new Set();
      settled.set(at.shapeId, destinations);
    }
    destinations.add(dt.shapeId);
    const sourceByName = new Map(sourceShape.fields.map((field) => [field.name, field]));
    for (const destinationField of destinationShape.fields) {
      const sourceField = sourceByName.get(destinationField.name);
      if (!sourceField) {
        if (destinationField.required) {
          reject(
            "compatibility",
            "missing-required-field",
            `Destination Field "${destinationField.name}" is required and the copied value does not supply it.`,
            appendPath(path, destinationField.name),
            MATCHING_TYPE,
          );
        }
        continue;
      }
      if (!sourceField.required && destinationField.required) {
        reject(
          "compatibility",
          "optional-to-required",
          `Copied Field "${sourceField.name}" is optional but the destination requires it.`,
          appendPath(path, sourceField.name),
          MATCHING_TYPE,
        );
      }
      stack.push({
        source: sourceField.type,
        destination: destinationField.type,
        path: appendPath(path, destinationField.name),
      });
    }
    const destinationNames = new Set(destinationShape.fields.map((field) => field.name));
    for (const sourceField of sourceShape.fields) {
      if (!destinationNames.has(sourceField.name)) {
        reject(
          "compatibility",
          "extra-source-field",
          `Copied Field "${sourceField.name}" does not exist on the destination Shape.`,
          appendPath(path, sourceField.name),
          MATCHING_TYPE,
        );
      }
    }
  }
}

interface ImageCollector {
  readonly images: ImageAssetReference[];
  readonly seen: Set<string>;
}

function collectImage(collector: ImageCollector, pair: ImageAssetReference): void {
  const key = `${pair.assetId}@${pair.revision}`;
  if (!collector.seen.has(key)) {
    collector.seen.add(key);
    collector.images.push({ assetId: pair.assetId, revision: pair.revision });
  }
}

function assertScalarReplacement(
  value: unknown,
  primitive: string,
  stage: string,
  path: DiagnosticPath,
  collector: ImageCollector,
): void {
  if (!simpleValueConforms(value, primitive)) {
    reject(
      stage,
      "incompatible-type",
      `${pathLabel(path)} does not conform to ${primitive}.`,
      path,
      MATCHING_TYPE,
    );
  }
  if (primitive === "image") collectImage(collector, value as ImageAssetReference);
}

interface TypedCloneSlot {
  readonly emit: (value: RuntimeValue, template: StructuredValueTemplate) => void;
  readonly portable: PortableValue;
  readonly destinationType: Type;
  readonly allowsNull: boolean;
  readonly path: DiagnosticPath;
}

function cloneTypedValue(
  envelope: TypedValueEnvelope,
  contract: ValueReplacementContract,
  sourceShapes: Map<string, PortableShape>,
  destinationShapes: Map<string, Shape>,
): PreparedValueReplacement {
  const recordsByToken = new Map(envelope.records.map((record) => [record.id, record]));
  const structuredValues: StructuredValues = {};
  const collector: ImageCollector = { images: [], seen: new Set() };
  const nodesByToken = new Map<
    string,
    { id: StructuredValueId; template: StructuredValueTemplate }
  >();
  const signatures: EnvelopeContext["signatures"] = new WeakMap();
  let resultValue: RuntimeValue | null = null;
  let resultTemplate: StructuredValueTemplate | null = null;
  let resultEmitted = false;
  const stack: TypedCloneSlot[] = [
    {
      emit: (value, template) => {
        resultValue = value;
        resultTemplate = template;
        resultEmitted = true;
      },
      portable: envelope.root,
      destinationType: contract.type,
      allowsNull: contract.allowsAbsence,
      path: [],
    },
  ];
  while (stack.length > 0) {
    const slot = stack.pop()!;
    const { emit, portable, destinationType, allowsNull, path } = slot;
    if (portable === null) {
      if (!allowsNull) {
        reject(
          "compatibility",
          "prohibited-absence",
          `${pathLabel(path)} is absent where a value is required.`,
          path,
          MATCHING_TYPE,
        );
      }
      emit(null, null);
      continue;
    }
    if (typeof destinationType === "string") {
      assertScalarReplacement(portable, destinationType, "compatibility", path, collector);
      emit(portable as RuntimeValue, portable as StructuredValueTemplate);
      continue;
    }
    const token = refTokenOf(portable);
    if (token === null) {
      reject(
        "compatibility",
        "incompatible-type",
        `${pathLabel(path)} must be a structured value.`,
        path,
        MATCHING_TYPE,
      );
    }
    const record = recordsByToken.get(token)!;
    const existing = nodesByToken.get(token);
    if (existing) {
      const expected = typeSignature(destinationType, signatures);
      const actual = typeSignature(structuredValues[existing.id]!.type, signatures);
      if (expected.depth !== actual.depth || expected.leaf !== actual.leaf)
        reject(
          "compatibility",
          "incompatible-sharing",
          "One shared value cannot have different destination Types.",
          path,
          MATCHING_TYPE,
        );
      // One fresh clone per token: repeated references stay shared.
      emit({ ref: existing.id }, existing.template);
      continue;
    }
    const id = generateId("structuredValue");
    if (destinationType.kind === "array") {
      if (record.kind !== "array") {
        reject(
          "compatibility",
          "incompatible-type",
          `${pathLabel(path)} requires an array value.`,
          path,
          MATCHING_TYPE,
        );
      }
      const templateItems: StructuredValueTemplate[] = [];
      const recordItems: RuntimeValue[] = [];
      const template: ArrayStructuredValueTemplate = { id, kind: "array", items: templateItems };
      const arrayRecord: ArrayStructuredValueRecord = {
        id,
        kind: "array",
        type: { kind: "array", of: destinationType.of },
        items: recordItems,
      };
      structuredValues[id] = arrayRecord;
      nodesByToken.set(token, { id, template });
      emit({ ref: id }, template);
      for (const [index, item] of record.items.entries()) {
        stack.push({
          emit: (value, itemTemplate) => {
            recordItems[index] = value;
            templateItems[index] = itemTemplate;
          },
          portable: item,
          destinationType: destinationType.of,
          allowsNull: false,
          path: appendPath(path, String(index)),
        });
      }
      continue;
    }
    if (record.kind !== "shape") {
      reject(
        "compatibility",
        "incompatible-type",
        `${pathLabel(path)} requires a Shape value.`,
        path,
        MATCHING_TYPE,
      );
    }
    const destinationShape = destinationShapes.get(destinationType.shapeId)!;
    const sourceShape = sourceShapes.get(record.type.shapeId)!;
    const templateFields: Record<string, StructuredValueTemplate> = Object.create(null);
    const recordFields: Record<string, RuntimeValue> = Object.create(null);
    const template: ShapeStructuredValueTemplate = { id, kind: "shape", fields: templateFields };
    const shapeRecord: ShapeStructuredValueRecord = {
      id,
      kind: "shape",
      type: { kind: "shape", shapeId: destinationType.shapeId },
      fields: recordFields,
    };
    structuredValues[id] = shapeRecord;
    nodesByToken.set(token, { id, template });
    emit({ ref: id }, template);
    for (const destinationField of destinationShape.fields) {
      const sourceField = sourceShape.fields.find((field) => field.name === destinationField.name);
      if (!sourceField) {
        // Destination-only optional Field: explicit Typed Absence.
        recordFields[destinationField.id] = null;
        templateFields[destinationField.id] = null;
        continue;
      }
      const portableChild = hasOwn(record.fields, sourceField.id)
        ? record.fields[sourceField.id]!
        : null;
      stack.push({
        emit: (value, fieldTemplate) => {
          recordFields[destinationField.id] = value;
          templateFields[destinationField.id] = fieldTemplate;
        },
        portable: portableChild,
        destinationType: destinationField.type,
        allowsNull: !destinationField.required,
        path: appendPath(path, destinationField.name),
      });
    }
  }
  if (!resultEmitted) {
    reject("compatibility", "invalid-value", "The copied value could not be applied.");
  }
  return {
    value: resultValue!,
    structuredValues,
    template: resultTemplate!,
    images: collector.images,
  };
}

interface PlainCloneSlot {
  readonly emit: (value: RuntimeValue, template: StructuredValueTemplate) => void;
  readonly plain: unknown;
  readonly destinationType: Type;
  readonly allowsNull: boolean;
  readonly path: DiagnosticPath;
}

function clonePlainValue(
  value: unknown,
  contract: ValueReplacementContract,
): PreparedValueReplacement {
  const destinationShapes = new Map(contract.shapes.map((shape) => [shape.id, shape]));
  const structuredValues: StructuredValues = {};
  const collector: ImageCollector = { images: [], seen: new Set() };
  let recordCount = 0;
  let resultValue: RuntimeValue | null = null;
  let resultTemplate: StructuredValueTemplate | null = null;
  let resultEmitted = false;
  const stack: PlainCloneSlot[] = [
    {
      emit: (replacement, template) => {
        resultValue = replacement;
        resultTemplate = template;
        resultEmitted = true;
      },
      plain: value,
      destinationType: contract.type,
      allowsNull: contract.allowsAbsence,
      path: [],
    },
  ];
  while (stack.length > 0) {
    const slot = stack.pop()!;
    const { emit, plain, destinationType, allowsNull, path } = slot;
    if (plain === null || plain === undefined) {
      if (!allowsNull) {
        reject(
          "compatibility",
          "prohibited-absence",
          `${pathLabel(path)} is absent where a value is required.`,
          path,
          MATCHING_TYPE,
        );
      }
      emit(null, null);
      continue;
    }
    if (typeof destinationType === "string") {
      assertScalarReplacement(plain, destinationType, "compatibility", path, collector);
      emit(plain as RuntimeValue, plain as StructuredValueTemplate);
      continue;
    }
    recordCount += 1;
    if (recordCount > VALUE_MAX_LOGICAL_RECORDS) {
      reject(
        "compatibility",
        "record-limit",
        "The replacement exceeds 100,000 structured records.",
        path,
      );
    }
    const id = generateId("structuredValue");
    if (destinationType.kind === "array") {
      if (!Array.isArray(plain)) {
        reject(
          "compatibility",
          "incompatible-type",
          `${pathLabel(path)} is not an array.`,
          path,
          MATCHING_TYPE,
        );
      }
      // Every plain occurrence is its own clone; nothing is shared.
      const templateItems: StructuredValueTemplate[] = [];
      const recordItems: RuntimeValue[] = [];
      const template: ArrayStructuredValueTemplate = { id, kind: "array", items: templateItems };
      structuredValues[id] = {
        id,
        kind: "array",
        type: { kind: "array", of: destinationType.of },
        items: recordItems,
      };
      emit({ ref: id }, template);
      for (const [index, item] of plain.entries()) {
        stack.push({
          emit: (itemValue, itemTemplate) => {
            recordItems[index] = itemValue;
            templateItems[index] = itemTemplate;
          },
          plain: item,
          destinationType: destinationType.of,
          allowsNull: false,
          path: appendPath(path, String(index)),
        });
      }
      continue;
    }
    if (!isPlainObject(plain)) {
      reject(
        "compatibility",
        "incompatible-type",
        `${pathLabel(path)} is not a Shape value.`,
        path,
        MATCHING_TYPE,
      );
    }
    const destinationShape = destinationShapes.get(destinationType.shapeId);
    if (!destinationShape) {
      reject(
        "compatibility",
        "unknown-shape",
        "The destination does not define the Shape this value needs.",
        path,
        SELECT_AGAIN,
      );
    }
    const destinationNames = new Set(destinationShape.fields.map((field) => field.name));
    for (const key of Object.keys(plain)) {
      if (!destinationNames.has(key)) {
        reject(
          "compatibility",
          "extra-source-field",
          `Field "${key}" does not exist on the destination Shape.`,
          appendPath(path, key),
          MATCHING_TYPE,
        );
      }
    }
    const templateFields: Record<string, StructuredValueTemplate> = Object.create(null);
    const recordFields: Record<string, RuntimeValue> = Object.create(null);
    const template: ShapeStructuredValueTemplate = { id, kind: "shape", fields: templateFields };
    structuredValues[id] = {
      id,
      kind: "shape",
      type: { kind: "shape", shapeId: destinationType.shapeId },
      fields: recordFields,
    };
    emit({ ref: id }, template);
    for (const destinationField of destinationShape.fields) {
      if (hasOwn(plain, destinationField.name)) {
        stack.push({
          emit: (fieldValue, fieldTemplate) => {
            recordFields[destinationField.id] = fieldValue;
            templateFields[destinationField.id] = fieldTemplate;
          },
          plain: plain[destinationField.name],
          destinationType: destinationField.type,
          allowsNull: !destinationField.required,
          path: appendPath(path, destinationField.name),
        });
        continue;
      }
      if (destinationField.required) {
        reject(
          "compatibility",
          "missing-required-field",
          `Field "${destinationField.name}" is required and the pasted value does not supply it.`,
          appendPath(path, destinationField.name),
          MATCHING_TYPE,
        );
      }
      recordFields[destinationField.id] = null;
      templateFields[destinationField.id] = null;
    }
  }
  if (!resultEmitted) {
    reject("compatibility", "invalid-value", "The pasted value could not be applied.");
  }
  return {
    value: resultValue!,
    structuredValues,
    template: resultTemplate!,
    images: collector.images,
  };
}

/**
 * Validates a decoded value against the destination's declared contract and
 * produces the replacement closure: metadata and records are checked before
 * anything is cloned, tokens become one fresh identity each, plain
 * occurrences clone separately, and destination-only optional Fields become
 * explicit Typed Absence. Types, defaults and Shapes are never imported.
 */
export function prepareValueReplacement(
  validated: ValidatedValue,
  contract: ValueReplacementContract,
): PreparedValueReplacement {
  if (validated.kind === "plain") {
    return clonePlainValue(validated.value, contract);
  }
  const envelope = assertValidValueEnvelope(validated.envelope);
  const sourceShapes = new Map(envelope.shapes.map((shape) => [shape.id, shape]));
  const destinationShapes = new Map(contract.shapes.map((shape) => [shape.id, shape]));
  assertTypesCompatible(envelope.type, contract.type, sourceShapes, destinationShapes);
  if (envelope.root === null) {
    if (!contract.allowsAbsence) {
      reject(
        "compatibility",
        "prohibited-absence",
        "The destination does not allow an absent value.",
        [],
        MATCHING_TYPE,
      );
    }
    return { value: null, structuredValues: {}, template: null, images: [] };
  }
  return cloneTypedValue(envelope, contract, sourceShapes, destinationShapes);
}

// ---------------------------------------------------------------------------
// Authored Default entries
// ---------------------------------------------------------------------------

export function assertTemplateConforms(
  template: unknown,
  type: Type,
  shapes: readonly Shape[],
  allowsAbsence: boolean,
  path: readonly string[],
): asserts template is StructuredValueTemplate {
  const stack: Array<{ value: unknown; type: Type; allowsNull: boolean; path: DiagnosticPath }> = [
    { value: template, type, allowsNull: allowsAbsence, path },
  ];
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const nodes = new Map<string, string>();
  const edges = new Map<string, string[]>();
  const signatures: EnvelopeContext["signatures"] = new WeakMap();
  const slotValue = (value: unknown) =>
    isShapeStructuredValueTemplate(value) || isArrayStructuredValueTemplate(value)
      ? { ref: value.id }
      : value;
  const register = (
    value: ShapeStructuredValueTemplate | ArrayStructuredValueTemplate,
    type: Type,
    here: DiagnosticPath,
  ): boolean => {
    const values = value.kind === "shape" ? Object.values(value.fields) : value.items;
    const body =
      value.kind === "shape"
        ? Object.fromEntries(
            Object.entries(value.fields).map(([id, value]) => [id, slotValue(value)]),
          )
        : values.map(slotValue);
    const content = canonicalValue({
      type: typeSignature(type, signatures),
      kind: value.kind,
      body,
    });
    const previous = nodes.get(value.id);
    if (previous !== undefined) {
      if (previous !== content)
        reject(
          "authoring",
          "identity-conflict",
          "One authored identity has inconsistent value or Type.",
          here,
        );
      return false;
    }
    nodes.set(value.id, content);
    if (nodes.size > VALUE_MAX_LOGICAL_RECORDS)
      reject(
        "authoring",
        "record-limit",
        "The replacement exceeds 100,000 structured records.",
        here,
      );
    edges.set(
      value.id,
      values.flatMap((value) =>
        isShapeStructuredValueTemplate(value) || isArrayStructuredValueTemplate(value)
          ? [value.id]
          : [],
      ),
    );
    return true;
  };
  while (stack.length > 0) {
    const { value, type: at, allowsNull, path: here } = stack.pop()!;
    if (value === undefined)
      reject("authoring", "invalid-value", "An authored absence must be explicit null.", here);
    if (value === null) {
      if (!allowsNull)
        reject(
          "authoring",
          "prohibited-absence",
          `${pathLabel(here)} cannot be absent.`,
          here,
          MATCHING_TYPE,
        );
      continue;
    }
    if (typeof at === "string") {
      if (!simpleValueConforms(value, at))
        reject(
          "authoring",
          "incompatible-type",
          "The authored scalar does not conform to its Type.",
          here,
          MATCHING_TYPE,
        );
      continue;
    }
    if (at.kind === "array") {
      if (!isArrayStructuredValueTemplate(value))
        reject("authoring", "invalid-value", `${pathLabel(here)} is not an array template.`, here);
      if (!register(value, at, here)) continue;
      for (const [index, item] of value.items.entries())
        stack.push({
          value: item,
          type: at.of,
          allowsNull: false,
          path: appendPath(here, String(index)),
        });
      continue;
    }
    if (!isShapeStructuredValueTemplate(value))
      reject("authoring", "invalid-value", `${pathLabel(here)} is not a Shape template.`, here);
    const shape = byId.get(at.shapeId);
    if (!shape)
      reject("authoring", "unknown-shape", `${pathLabel(here)} references an unknown Shape.`, here);
    if (!register(value, at, here)) continue;
    const declared = new Set(shape.fields.map((field) => field.id));
    for (const key of Object.keys(value.fields)) {
      if (!declared.has(key))
        reject(
          "authoring",
          "invalid-value",
          `${pathLabel(here)} has an undeclared Field.`,
          appendPath(here, key),
        );
    }
    if (Object.keys(value.fields).length !== shape.fields.length)
      reject("authoring", "invalid-value", `${pathLabel(here)} is missing a declared Field.`, here);
    for (const field of shape.fields)
      stack.push({
        value: value.fields[field.id],
        type: field.type,
        allowsNull: !field.required,
        path: appendPath(here, field.id),
      });
  }
  assertAcyclicReferences(edges.keys(), (id) => edges.get(id), "records");
}

function sameFieldPath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function selectedField(
  sourceType: Type,
  fieldPath: readonly string[],
  shapes: readonly Shape[],
): ShapeField | null {
  let current = sourceType;
  let selected: ShapeField | null = null;
  for (const fieldId of fieldPath) {
    if (typeof current === "string" || current.kind !== "shape") return null;
    const shapeId = current.shapeId;
    const shape = shapes.find((candidate) => candidate.id === shapeId);
    if (!shape) return null;
    const field = shape.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return null;
    selected = field;
    current = field.type;
  }
  return selected;
}

/**
 * The complete authored `sourceFieldDefaults` after replacing one selected
 * value, for the new whole-array replacement edit (#896).
 *
 * Sparse intent survives: every other node's entries and every untouched
 * sibling override stay byte-identical, with their stable template ids and
 * authored sharing. Replacing a whole Source drops all of its entries for
 * one root entry; replacing a Field drops that path's obsolete descendant
 * overrides. An explicit null is *stored*, never read as inheritance.
 */
export function defaultReplacementEntries(
  graph: ShowGraph,
  sourceId: string,
  fieldPath: readonly string[],
  template: StructuredValueTemplate,
): SourceFieldDefault[] {
  const source = graph.nodes.find((node) => node.kind === "source" && node.id === sourceId);
  if (!source || source.kind !== "source") {
    reject(
      "authoring",
      "unaddressable-target",
      `No Source "${sourceId}" in this Show.`,
      [sourceId],
      SELECT_AGAIN,
    );
  }
  const shapes = graph.shapes ?? [];
  const type = typeAtPath(source.type, fieldPath, shapes);
  if (!type) {
    reject(
      "authoring",
      "unaddressable-target",
      `The Field path does not address a Field of Source "${sourceId}".`,
      [sourceId, ...fieldPath],
      SELECT_AGAIN,
    );
  }
  const field = selectedField(source.type, fieldPath, shapes);
  const allowsAbsence = field ? !field.required : typeof type !== "string";
  if (
    fieldPath.length > 0 &&
    !isShapeStructuredValueTemplate(defaultTemplateAtPath(graph, sourceId, fieldPath.slice(0, -1)))
  ) {
    reject(
      "authoring",
      "unaddressable-target",
      "The selected Field has an absent containing value.",
      [sourceId, ...fieldPath],
      SELECT_AGAIN,
    );
  }
  assertTemplateConforms(template, type, shapes, allowsAbsence, [sourceId, ...fieldPath]);
  const retained = (graph.sourceFieldDefaults ?? []).filter((entry) => {
    if (entry.nodeId !== sourceId) return true;
    if (fieldPath.length === 0) return false;
    if (sameFieldPath(entry.fieldPath, fieldPath)) return false;
    if (entry.fieldPath.length < fieldPath.length) return true;
    return !fieldPath.every((segment, index) => entry.fieldPath[index] === segment);
  });
  return [...retained, { nodeId: sourceId, fieldPath: [...fieldPath], value: template }];
}

export interface SelectedValueSource {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly fieldPath: readonly string[];
}

export interface SelectedValueContract {
  readonly type: Type;
  readonly allowsAbsence: boolean;
  readonly label: string;
  readonly source: SelectedValueSource;
}

/**
 * The destination contract at a stable Field path, without traversing array
 * items. A Source root allows absence exactly where existing Source
 * semantics do — structured values — and a selected Field allows it only
 * when declared optional.
 */
export function selectedValueContract(
  graph: ShowGraph,
  sourceId: string,
  fieldPath: readonly string[],
): SelectedValueContract {
  const source = graph.nodes.find((node) => node.kind === "source" && node.id === sourceId);
  if (!source || source.kind !== "source") {
    reject(
      "authoring",
      "unaddressable-target",
      `No Source "${sourceId}" in this Show.`,
      [sourceId],
      SELECT_AGAIN,
    );
  }
  const shapes = graph.shapes ?? [];
  let current = source.type;
  const fieldNames: string[] = [];
  let lastField: ShapeField | null = null;
  for (const fieldId of fieldPath) {
    if (typeof current === "string" || current.kind !== "shape") {
      reject(
        "authoring",
        "unaddressable-target",
        `Field path segment "${fieldId}" does not address a Shape Field.`,
        [sourceId, ...fieldPath],
        SELECT_AGAIN,
      );
    }
    const shapeId = current.shapeId;
    const shape = shapes.find((candidate) => candidate.id === shapeId);
    const field = shape?.fields.find((candidate) => candidate.id === fieldId);
    if (!shape || !field) {
      reject(
        "authoring",
        "unaddressable-target",
        `Unknown Field "${fieldId}".`,
        [sourceId, ...fieldPath],
        SELECT_AGAIN,
      );
    }
    fieldNames.push(field!.name);
    lastField = field!;
    current = field!.type;
  }
  const allowsAbsence = lastField ? !lastField.required : typeof current !== "string";
  return {
    type: current,
    allowsAbsence,
    label: [source.name, ...fieldNames].join(" › "),
    source: { sourceId, sourceName: source.name, fieldPath: [...fieldPath] },
  };
}

// ---------------------------------------------------------------------------
// Logical-record accounting
// ---------------------------------------------------------------------------

function countPlainOccurrences(value: unknown): number {
  let count = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number" && Number.isFinite(current)) continue;
    if (typeof current !== "object" || current === null)
      reject("decode", "invalid-value", "A finite JSON value is required.");
    if (isExactImagePair(current)) continue;
    count += 1;
    if (count > VALUE_MAX_LOGICAL_RECORDS)
      reject("decode", "record-limit", "The value exceeds 100,000 logical records.");
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
    } else {
      if (!isPlainObject(current))
        reject("decode", "invalid-value", "Only JSON data objects are portable.");
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== null && prototype !== Object.prototype)
        reject("decode", "invalid-value", "Only JSON data objects are portable.");
      for (const key of Object.keys(current)) stack.push(current[key]);
    }
  }
  return count;
}

/**
 * The one exhaustive visitor shared by producer, consumer and authoritative
 * validation: Shape metadata and its Fields once each, every supplied typed
 * record once (used or not), and each plain object/array occurrence
 * separately. An image pair is a simple value, not a record.
 */
export function countValueLogicalRecords(value: ValidatedValue): number {
  if (value.kind === "plain") return countPlainOccurrences(value.value);
  let count = value.envelope.records.length;
  for (const shape of value.envelope.shapes) count += 1 + shape.fields.length;
  return count;
}
