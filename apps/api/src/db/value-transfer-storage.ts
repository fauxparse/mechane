import {
  isEventStructuredValueId,
  isComputedStructuredValueId,
  isStructuredValueReference,
  isShapeStructuredValueTemplate,
  isArrayStructuredValueTemplate,
  type AnyStructuredValueId,
  type RuntimeValue,
  type StructuredValueRecord,
  type StructuredValueTemplate,
} from "@mechane/domain/structured-values";
import { isId } from "@mechane/domain/id";
import type { ImageAssetReference, PrimitiveType, Type } from "@mechane/domain/shapes";
import type { ValueTarget, ValueTransferDiagnostic } from "@mechane/domain/value-transfer";
import { z } from "zod";
import type { CurrentComparison } from "./value-transfer-current";
import type { ValueOperationReceipt } from "./value-transfer";

const PRIMITIVES: Readonly<Record<PrimitiveType, true>> = {
  text: true,
  number: true,
  boolean: true,
  color: true,
  date: true,
  datetime: true,
  image: true,
};
function object(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isType(value: unknown): value is Type {
  const pending = [value];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (!Object.hasOwn(PRIMITIVES, current)) return false;
      continue;
    }
    if (!object(current) || seen.has(current) || Object.keys(current).length !== 2) return false;
    seen.add(current);
    if (current.kind === "shape") {
      if (typeof current.shapeId !== "string" || !current.shapeId) return false;
    } else if (current.kind === "array" && Object.hasOwn(current, "of")) pending.push(current.of);
    else return false;
  }
  return true;
}
function isImage(value: unknown): value is ImageAssetReference {
  return (
    object(value) &&
    Object.keys(value).length === 2 &&
    typeof value.assetId === "string" &&
    value.assetId.length > 0 &&
    typeof value.revision === "string" &&
    value.revision.length > 0
  );
}
function scalar(value: unknown): value is Exclude<RuntimeValue, { ref: AnyStructuredValueId }> {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    isImage(value)
  );
}
function runtimeValue(value: unknown): value is RuntimeValue {
  return (
    scalar(value) ||
    (object(value) && Object.keys(value).length === 1 && isStructuredValueReference(value))
  );
}
function template(value: unknown): value is StructuredValueTemplate {
  const pending = [value];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const current = pending.pop();
    if (scalar(current)) continue;
    if (!object(current)) return false;
    if (seen.has(current)) continue;
    seen.add(current);
    if (
      Object.keys(current).length !== 3 ||
      typeof current.id !== "string" ||
      !isId("structuredValue", current.id)
    )
      return false;
    if (isShapeStructuredValueTemplate(current)) {
      for (const field of Object.values(current.fields)) pending.push(field);
    } else if (isArrayStructuredValueTemplate(current)) {
      for (const item of current.items) pending.push(item);
    } else return false;
  }
  return true;
}
const StoredIdSchema = z.custom<AnyStructuredValueId>(
  (value) =>
    typeof value === "string" &&
    (isId("structuredValue", value) ||
      isEventStructuredValueId(value) ||
      isComputedStructuredValueId(value)),
);
const RuntimeValueSchema = z.custom<RuntimeValue>(runtimeValue);
const TypeSchema = z.custom<Type>(isType);
const RecordSchema: z.ZodType<StructuredValueRecord> = z.discriminatedUnion("kind", [
  z
    .object({
      id: StoredIdSchema,
      kind: z.literal("shape"),
      type: z.object({ kind: z.literal("shape"), shapeId: z.string().min(1) }).strict(),
      fields: z.record(z.string(), RuntimeValueSchema),
    })
    .strict(),
  z
    .object({
      id: StoredIdSchema,
      kind: z.literal("array"),
      type: z.object({ kind: z.literal("array"), of: TypeSchema }).strict(),
      items: z.array(RuntimeValueSchema),
    })
    .strict(),
]);
const ImagesSchema: z.ZodType<readonly ImageAssetReference[]> = z.array(
  z.custom<ImageAssetReference>(isImage),
);
const commonPlan = {
  representation: z.enum(["typed", "plain"]),
  images: ImagesSchema,
  contractTypeCanonical: z.string(),
  labels: z
    .object({
      showName: z.string(),
      sourceLabel: z.string(),
      scopeLabel: z.string(),
      aliasEffects: z.string(),
    })
    .strict(),
};
const PlanSchema = z.discriminatedUnion("plane", [
  z
    .object({
      ...commonPlan,
      plane: z.literal("default"),
      template: z.custom<StructuredValueTemplate>(template),
    })
    .strict(),
  z
    .object({
      ...commonPlan,
      plane: z.literal("current"),
      value: RuntimeValueSchema,
      records: z.array(RecordSchema),
    })
    .strict(),
]);
export type StoredPlan = z.infer<typeof PlanSchema>;
export function storedPlan(value: unknown): StoredPlan {
  return PlanSchema.parse(value);
}
const ComparisonSchema = z
  .object({
    binding: z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("sourceRoot"), sourceId: z.string(), rootValue: z.string() })
        .strict(),
      z
        .object({
          kind: z.literal("recordField"),
          sourceId: z.string(),
          recordId: StoredIdSchema,
          fieldId: z.string(),
          rootValue: z.string(),
          pathBindings: z.array(z.string()),
        })
        .strict(),
    ]),
    selected: z.string(),
    closure: z.record(z.string(), z.string()),
  })
  .strict();
export function storedComparison(value: unknown): CurrentComparison {
  return ComparisonSchema.parse(value);
}
const DiagnosticSchema = z
  .object({
    category: z.enum(["rejected-input", "commit-rejected", "outcome-unknown", "browser-failure"]),
    stage: z.string(),
    code: z.string(),
    message: z.string(),
    path: z.array(z.string()),
    nextAction: z.string(),
  })
  .strict();
export function storedDiagnostic(value: unknown): ValueTransferDiagnostic {
  return DiagnosticSchema.parse(value);
}
const ReceiptSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("default"),
      target: z.unknown(),
      version: z.number().int().nonnegative(),
      updatedAt: z.string(),
      edits: z.array(z.unknown()),
      amendments: z.array(z.unknown()),
      published: z
        .object({ version: z.number().int().nonnegative(), updatedAt: z.string() })
        .strict()
        .nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("current"),
      target: z.unknown(),
      stateSequence: z.number().int().nonnegative(),
    })
    .strict(),
]);
export function storedReceipt(
  value: unknown,
  decodeTarget: (value: unknown) => ValueTarget,
): ValueOperationReceipt {
  const receipt = ReceiptSchema.parse(value);
  const target = decodeTarget(receipt.target);
  if (receipt.kind === "default" && target.kind === "default") return { ...receipt, target };
  if (receipt.kind === "current" && target.kind !== "default") return { ...receipt, target };
  throw new Error("Stored receipt plane and target do not match.");
}
