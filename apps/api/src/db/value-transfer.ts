// Authenticated Source value clipboard operations (#897–#900): coherent
// reads, the durable prepare/commit/lookup operation ledger, and the Default
// and Current commit paths.
//
// The `value_operations` row is the authority this module exists around. A
// prepare freezes the actor, target, received handoff and derived replacement;
// a commit applies exactly that stored plan or refuses it, and records which
// happened in the same transaction as the mutation. A repeated commit returns
// the stored outcome instead of reapplying, and a lookup that cannot see a
// definitive answer reports `pending` — never a rejection (#872, #873).
//
// Default commits change authored data only, through the ordinary Show edit
// transaction (applyShowEditsTransaction) as one `graph.replaceSourceDefaults`
// edit. Current commits change one Run row set or one Shared Device
// Instance's columns under the Run row lock Player Events use, compare the
// selected value/closure/bindings rather than a global sequence, and
// propagate through the invalidation outbox. Neither writes the other's plane.
import { randomUUID } from "node:crypto";

import type { GraphEdit } from "@mechane/commands";
import { decodeValueHandoff, encodeGraphEdit, encodeValue } from "@mechane/commands";
import type { ShowGraph, SourceFieldDefault } from "@mechane/domain/graph";
import type { Shape, Type } from "@mechane/domain/shapes";
import { composeInstanceView, type RunState } from "@mechane/domain/structured-values";
import {
  canonicalValue,
  expandPortableValue,
  defaultReplacementEntries,
  prepareValueReplacement,
  projectDefaultValue,
  projectRuntimeValue,
  selectedValueContract,
  ValueTransferError,
  type TypedValueEnvelope,
  type ValidatedValue,
  type ValueHandoff,
  type ValueTarget,
  type ValueTransferDiagnostic,
  type PreparedValueReplacement,
} from "@mechane/domain/value-transfer";
import { and, eq } from "drizzle-orm";

import { db } from "./client";
import { readShowGraph, applyShowEditsTransaction, afterShowEdits } from "./show-graph";
import { drainPlayerInvalidations, enqueuePlayerInvalidations } from "./player-invalidation-outbox";
import { readRunState } from "./runs";
import { runDeviceStates, shows, valueOperations } from "./schema";
import { assertActiveValueImages } from "./value-transfer-resources";
import {
  storedPlan,
  storedComparison,
  storedReceipt,
  storedDiagnostic,
  type StoredPlan,
} from "./value-transfer-storage";
import {
  applyCurrentWriteToInstance,
  applyCurrentWriteToRunRows,
  applyCurrentWriteToState,
  buildCurrentComparison,
  currentComparisonMatches,
  evaluatedSourceValue,
  findSource,
  hasIncomingWiring,
  lockActiveRun,
  readActiveRunRow,
  readHolderValue,
  readInstanceCurrentState,
  resolveCurrentHolder,
  sharedInstanceEligibility,
  storedSelectedValue,
  type CurrentComparison,
  type CurrentRefusalDetail,
  type CurrentStateSnapshot,
  type Tx,
} from "./value-transfer-current";

type Executor = Tx | typeof db;

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/** What a Default commit did to authored state, for the save queue/history. */
export interface DefaultValueReceipt {
  readonly kind: "default";
  readonly target: ValueTarget;
  readonly version: number;
  readonly updatedAt: string;
  readonly published: { readonly version: number; readonly updatedAt: string } | null;
  /** The applied edit and server amendments, as flat wire objects. */
  readonly edits: unknown[];
  readonly amendments: unknown[];
}

/** What a Current commit did to live state. There is no live history. */
export interface CurrentValueReceipt {
  readonly kind: "current";
  readonly target: ValueTarget;
  readonly stateSequence: number;
}

export type ValueOperationReceipt = DefaultValueReceipt | CurrentValueReceipt;

/**
 * The authoritative answer to "what happened to my operation?". `pending`
 * covers both a still-prepared operation and one a lookup simply cannot see:
 * a missing result is not a definitive rejection (#873).
 */
export type ValueOperationOutcome =
  | { readonly kind: "pending" }
  | { readonly kind: "committed"; readonly receipt: ValueOperationReceipt }
  | { readonly kind: "rejected"; readonly diagnostic: ValueTransferDiagnostic };

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

type RefusalCategory = ValueTransferDiagnostic["category"];

/**
 * Builds the diagnostic every refusal carries: category, stage, stable code,
 * safe message, affected path and the next action the operator can take. No
 * private Show metadata leaks through these strings.
 */
function refusal(
  category: RefusalCategory,
  stage: string,
  code: string,
  message: string,
  path: readonly string[],
  nextAction: string,
): ValueTransferError {
  return new ValueTransferError({
    category,
    stage,
    code,
    message,
    path: [...path],
    nextAction,
  });
}

function captureRefusal(
  code: string,
  message: string,
  path: readonly string[] = [],
): ValueTransferError {
  return refusal(
    "rejected-input",
    "capture",
    code,
    message,
    path,
    "Refresh the value, then choose an eligible explicit target and paste again.",
  );
}

function currentRefusal(detail: CurrentRefusalDetail): ValueTransferError {
  const nextAction = currentNextAction(detail.code);
  return refusal("rejected-input", "capture", detail.code, detail.message, detail.path, nextAction);
}

function currentNextAction(code: string): string {
  switch (code) {
    case "no-active-run":
      return "Start the Run, then read and confirm the Current value again.";
    case "stale-version":
      return "Refresh the value, then read and confirm against the newly published Show.";
    case "cross-scope-target":
      return "Choose the Show-level target, or the Shared Device Instance that owns this value.";
    case "missing-instance-state":
      return "Start the Run so the Shared Device Instance has state, then select it explicitly.";
    case "device-not-eligible":
      return "Select a configured Shared Device that drives this Source's Flow.";
    case "incoming-wiring":
      return "This Source is copy-only. Paste into an unwired Source, or rewire it first.";
    default:
      return "Refresh the value and confirm again.";
  }
}

// ---------------------------------------------------------------------------
// Boundary decoding
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(holder: Record<string, unknown>, key: string): string {
  const value = holder[key];
  if (typeof value !== "string" || value.length === 0) {
    throw refusal(
      "rejected-input",
      "decode",
      "malformed-target",
      `The target's "${key}" must be a non-empty string.`,
      [],
      "Re-select the destination and paste again.",
    );
  }
  return value;
}

function requireVersion(holder: Record<string, unknown>, key: string): number {
  const value = holder[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw refusal(
      "rejected-input",
      "decode",
      "malformed-target",
      `The target's "${key}" must be a non-negative whole number.`,
      [],
      "Refresh the destination and paste again.",
    );
  }
  return value;
}

function requireFieldPath(holder: Record<string, unknown>): string[] {
  const value = holder.fieldPath;
  if (!Array.isArray(value) || value.some((segment) => typeof segment !== "string")) {
    throw refusal(
      "rejected-input",
      "decode",
      "malformed-target",
      'The target\'s "fieldPath" must be a list of Field names.',
      [],
      "Re-select the destination Field and paste again.",
    );
  }
  return [...value];
}

function requireNoUnknownFields(holder: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(holder)) {
    if (!keys.includes(key)) {
      throw refusal(
        "rejected-input",
        "decode",
        "malformed-target",
        `The target has an unknown field "${key}".`,
        [],
        "Re-select the destination and paste again.",
      );
    }
  }
}

/**
 * Strict decode of the target a client pinned before reading the clipboard.
 * Unknown fields, wrong kinds and non-integer versions reject here, at the
 * boundary, before anything reads a Show.
 */
export function decodeValueTargetInput(value: unknown): ValueTarget {
  if (!isPlainObject(value)) {
    throw refusal(
      "rejected-input",
      "decode",
      "malformed-target",
      "A value target must be an object.",
      [],
      "Re-select the destination and paste again.",
    );
  }
  const kind = value.kind;
  const shared = ["showId", "sourceId", "fieldPath"] as const;
  if (kind === "default") {
    requireNoUnknownFields(value, [...shared, "kind", "draftVersion"]);
    return {
      kind: "default",
      showId: requireString(value, "showId"),
      sourceId: requireString(value, "sourceId"),
      fieldPath: requireFieldPath(value),
      draftVersion: requireVersion(value, "draftVersion"),
    };
  }
  if (kind === "current-show") {
    requireNoUnknownFields(value, [...shared, "kind", "runId", "publishedVersion"]);
    return {
      kind: "current-show",
      showId: requireString(value, "showId"),
      sourceId: requireString(value, "sourceId"),
      fieldPath: requireFieldPath(value),
      runId: requireString(value, "runId"),
      publishedVersion: requireVersion(value, "publishedVersion"),
    };
  }
  if (kind === "current-instance") {
    requireNoUnknownFields(value, [
      ...shared,
      "kind",
      "runId",
      "publishedVersion",
      "deviceId",
      "flowId",
    ]);
    return {
      kind: "current-instance",
      showId: requireString(value, "showId"),
      sourceId: requireString(value, "sourceId"),
      fieldPath: requireFieldPath(value),
      runId: requireString(value, "runId"),
      publishedVersion: requireVersion(value, "publishedVersion"),
      deviceId: requireString(value, "deviceId"),
      flowId: requireString(value, "flowId"),
    };
  }
  throw refusal(
    "rejected-input",
    "decode",
    "unsupported-target-kind",
    "A value target must name the Default, Show Current or Shared Instance Current plane.",
    [],
    "Re-select the destination and paste again.",
  );
}

/**
 * Strict decode of the handoff wrapper: one chosen read's immutable list of
 * representations. The envelope semantics inside each representation are the
 * codec's to validate (decodeValueHandoff); this only pins the wrapper shape.
 */
export function decodeValueHandoffInput(value: unknown): ValueHandoff {
  if (!Array.isArray(value)) {
    throw refusal(
      "rejected-input",
      "decode",
      "malformed-handoff",
      "A value handoff must be a list of representations.",
      [],
      "Copy the value again, then paste.",
    );
  }
  return value.map((representation) => {
    if (
      !isPlainObject(representation) ||
      typeof representation.mediaType !== "string" ||
      typeof representation.text !== "string"
    ) {
      throw refusal(
        "rejected-input",
        "decode",
        "malformed-handoff",
        "Each handoff representation needs a media type and its text.",
        [],
        "Copy the value again, then paste.",
      );
    }
    return { mediaType: representation.mediaType, text: representation.text };
  });
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

type ShowRow = typeof shows.$inferSelect;

/**
 * The owner check every operation repeats. A missing Show and someone else's
 * Show read the same way — "not found" — so the refusal leaks nothing about
 * which it was (#872).
 */
async function requireOwnedShow(
  executor: Executor,
  showId: string,
  userId: string,
  lock = false,
): Promise<ShowRow> {
  const query = executor.select().from(shows).where(eq(shows.id, showId));
  const [show] = await (lock ? query.for("update") : query);
  if (!show || show.userId !== userId) {
    throw refusal(
      "rejected-input",
      "authorization",
      "unavailable-or-not-authorized",
      "Show not found.",
      [],
      "Sign in as the Show's owner, then try again.",
    );
  }
  return show;
}

// ---------------------------------------------------------------------------
// Stored row payloads
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface SourceValueInstanceContext {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly flowId: string;
  readonly instanceId: string;
}

export interface SourceValueContext {
  readonly showId: string;
  readonly showName: string;
  readonly activeRun: { readonly runId: string; readonly publishedVersion: number } | null;
  readonly instances: readonly SourceValueInstanceContext[];
}

/**
 * The explicit selection facts a Current target needs (#899, #900): the exact
 * active Run and its published version, and the configured Shared Device
 * Instances that already hold state for the selected Source's Flow. No
 * connection is required or consulted, and nothing is initialized here.
 */
export async function readSourceValueContext(
  userId: string,
  showId: string,
  sourceId: string,
): Promise<SourceValueContext> {
  return db.transaction(
    async (tx) => {
      const show = await requireOwnedShow(tx, showId, userId);
      const run = await readActiveRunRow(showId, tx);
      if (!run) {
        return { showId, showName: show.name, activeRun: null, instances: [] };
      }
      const graph = await readShowGraph(showId, "published", tx);
      const source = findSource(graph, sourceId);
      const rows = await tx
        .select({
          deviceId: runDeviceStates.deviceId,
          flowId: runDeviceStates.flowId,
        })
        .from(runDeviceStates)
        .where(eq(runDeviceStates.runId, run.id));
      const flowId = source?.parentId ?? null;
      const instances: SourceValueInstanceContext[] = rows.flatMap((row) => {
        // A Flow-local Source is addressable only through the Instances of the
        // Flow that owns it; a Show-level Source has no Instance Current at all.
        if (flowId === null || row.flowId !== flowId) return [];
        const eligibility = sharedInstanceEligibility(graph, row.deviceId, row.flowId);
        if (!eligibility) return [];
        return [
          {
            deviceId: row.deviceId,
            deviceName: eligibility.deviceName,
            flowId: row.flowId,
            instanceId: `${run.id}:${row.deviceId}`,
          },
        ];
      });
      instances.sort((left, right) => left.deviceId.localeCompare(right.deviceId));
      return {
        showId,
        showName: show.name,
        activeRun: { runId: run.id, publishedVersion: graph.version },
        instances,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface SourceValueRead {
  readonly target: ValueTarget;
  readonly envelope: TypedValueEnvelope;
  readonly plainText: string;
  readonly typedText: string;
  readonly copyOnly: boolean;
  readonly scopeLabel: string;
  readonly sourceLabel: string;
}

/**
 * A coherent, owner-authorized read of the selected value in one plane.
 * Default reads expand authored inheritance; Current reads never fill
 * Defaults, and an incoming-wired Source's evaluated Current result is
 * copied rather than refused — but evaluation failures refuse rather than
 * becoming absence (#872).
 */
export async function readSourceValue(
  userId: string,
  target: ValueTarget,
): Promise<SourceValueRead> {
  return db.transaction(
    async (tx) => {
      await requireOwnedShow(tx, target.showId, userId);
      if (target.kind === "default") return readDefaultValue(tx, target);
      return readCurrentValue(tx, target);
    },
    { isolationLevel: "repeatable read" },
  );
}

async function readDefaultValue(
  tx: Tx,
  target: Extract<ValueTarget, { kind: "default" }>,
): Promise<SourceValueRead> {
  const graph = await readShowGraph(target.showId, "draft", tx);
  if (graph.version !== target.draftVersion) {
    throw captureRefusal(
      "stale-version",
      "The Show changed since this destination was pinned. Refresh and copy again.",
      target.fieldPath,
    );
  }
  requireSource(graph, target.sourceId, target.fieldPath);
  const contract = selectedValueContract(graph, target.sourceId, target.fieldPath);
  const envelope = projectDefaultValue({
    showId: target.showId,
    graph,
    sourceId: target.sourceId,
    fieldPath: target.fieldPath,
  });
  return {
    target,
    envelope,
    plainText: encodeValue(envelope, "plain").text,
    typedText: encodeValue(envelope, "typed").text,
    copyOnly: hasIncomingWiring(graph, target.sourceId),
    scopeLabel: "Default",
    sourceLabel: contract.label,
  };
}

async function readCurrentValue(
  tx: Tx,
  target: Extract<ValueTarget, { kind: "current-show" | "current-instance" }>,
): Promise<SourceValueRead> {
  const run = await readActiveRunRow(target.showId, tx);
  if (!run || run.id !== target.runId) {
    throw currentRefusal({
      code: "no-active-run",
      message: "That Run is no longer the Show's active Run.",
      path: target.fieldPath,
    });
  }
  const graph = await readShowGraph(target.showId, "published", tx);
  if (graph.version !== target.publishedVersion) {
    throw captureRefusal(
      "stale-version",
      "The Show was published again since this destination was pinned. Refresh and copy again.",
      target.fieldPath,
    );
  }
  const source = requireSource(graph, target.sourceId, target.fieldPath);
  const deviceId = target.kind === "current-instance" ? target.deviceId : null;
  if (target.kind === "current-show") {
    if (source.parentId !== null) {
      throw currentRefusal({
        code: "cross-scope-target",
        message:
          "That Source is Flow-local, so its Current value belongs to a Shared Device Instance.",
        path: target.fieldPath,
      });
    }
  } else {
    const eligibility = sharedInstanceEligibility(graph, target.deviceId, target.flowId);
    if (!eligibility) {
      throw currentRefusal({
        code: "device-not-eligible",
        message: "That Device is not a configured Shared Device driving the named Flow.",
        path: target.fieldPath,
      });
    }
    if (source.parentId !== target.flowId) {
      throw currentRefusal({
        code: "cross-scope-target",
        message: "That Source does not belong to the selected Shared Device Instance's Flow.",
        path: target.fieldPath,
      });
    }
  }

  const showState = await readRunState(run.id, tx);
  const snapshot =
    target.kind === "current-show"
      ? { runId: run.id, state: showState, evaluation: showState }
      : await readInstanceCurrentState(
          run.id,
          target.deviceId,
          showState,
          target.flowId,
          target.publishedVersion,
          tx,
        );
  if (!snapshot) {
    throw currentRefusal({
      code: "missing-instance-state",
      message: "That Shared Device Instance has no state in this Run.",
      path: target.fieldPath,
    });
  }

  const wired = hasIncomingWiring(graph, target.sourceId);
  const contract = selectedValueContract(graph, target.sourceId, target.fieldPath);
  const envelope = wired
    ? await projectedEvaluatedValue(
        tx,
        target,
        snapshot,
        graph,
        contract.type,
        contract.allowsAbsence,
        deviceId,
      )
    : projectedStoredValue(
        target,
        snapshot.evaluation,
        graph,
        contract.type,
        contract.allowsAbsence,
      );
  return {
    target,
    envelope,
    plainText: encodeValue(envelope, "plain").text,
    typedText: encodeValue(envelope, "typed").text,
    copyOnly: wired,
    scopeLabel:
      target.kind === "current-show"
        ? "Current · Show"
        : `Current · Shared Device ${sharedInstanceEligibility(graph, target.deviceId, target.flowId)?.deviceName} · Flow ${target.flowId}`,
    sourceLabel: contract.label,
  };
}

function projectedStoredValue(
  target: Extract<ValueTarget, { kind: "current-show" | "current-instance" }>,
  state: RunState,
  graph: ShowGraph,
  type: Type,
  allowsAbsence: boolean,
): TypedValueEnvelope {
  const selected = storedSelectedValue(state, target.sourceId, target.fieldPath);
  if (selected.kind === "failed") throw currentRefusal(selected.detail);
  return projectRuntimeValue({
    showId: target.showId,
    plane: "current",
    type,
    allowsAbsence,
    shapes: graph.shapes ?? [],
    value: selected.value,
    structuredValues: state.structuredValues,
  });
}

async function projectedEvaluatedValue(
  tx: Tx,
  target: Extract<ValueTarget, { kind: "current-show" | "current-instance" }>,
  snapshot: CurrentStateSnapshot,
  graph: ShowGraph,
  type: Type,
  allowsAbsence: boolean,
  deviceId: string | null,
): Promise<TypedValueEnvelope> {
  const evaluated = await evaluatedSourceValue(snapshot, graph, target.sourceId, deviceId, tx);
  if (evaluated.kind === "failed") throw currentRefusal(evaluated.detail);
  let selected = evaluated.value;
  for (const fieldId of target.fieldPath) {
    if (
      selected &&
      typeof selected === "object" &&
      "ref" in selected &&
      typeof selected.ref === "string"
    ) {
      const record = evaluated.structuredValues[selected.ref];
      if (record?.kind !== "shape" || !Object.hasOwn(record.fields, fieldId))
        throw captureRefusal(
          "unaddressable-target",
          "The Field path crosses an unavailable or absent holder.",
          target.fieldPath,
        );
      selected = record.fields[fieldId];
    } else if (
      selected &&
      typeof selected === "object" &&
      !Array.isArray(selected) &&
      Object.hasOwn(selected, fieldId)
    ) {
      selected = Reflect.get(selected, fieldId);
    } else {
      throw captureRefusal(
        "unaddressable-target",
        "The Field path crosses an unavailable or absent holder.",
        target.fieldPath,
      );
    }
  }
  return projectRuntimeValue({
    showId: target.showId,
    plane: "current",
    type,
    allowsAbsence,
    shapes: graph.shapes ?? [],
    value: selected,
    structuredValues: evaluated.structuredValues,
  });
}

function requireSource(graph: ShowGraph, sourceId: string, fieldPath: readonly string[]) {
  const source = findSource(graph, sourceId);
  if (!source) {
    throw captureRefusal(
      "unaddressable-target",
      "That Source is not in the selected graph state.",
      fieldPath,
    );
  }
  return source;
}

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

export interface PreparedSourceValue {
  readonly operationId: string;
  readonly target: ValueTarget;
  readonly oldValue: unknown;
  readonly replacementValue: unknown;
  readonly representation: "typed" | "plain";
  readonly showName: string;
  readonly sourceLabel: string;
  readonly scopeLabel: string;
  readonly aliasEffects: string;
  readonly copyOnly: false;
}

/**
 * Pins one explicit destination to one received handoff and stores the
 * binding as a `prepared` operation. Nothing is mutated: no Show, Run or
 * Instance write happens here, and the fresh clone is planned, not persisted
 * (#897). Each explicit preparation mints a new operation id.
 */
export async function prepareSourceValue(
  userId: string,
  target: ValueTarget,
  handoff: ValueHandoff,
): Promise<PreparedSourceValue> {
  const validated = decodeValueHandoff(handoff);
  return db.transaction(async (tx) => {
    const prepared =
      target.kind === "default"
        ? await prepareDefaultReplacement(tx, userId, target, validated)
        : await prepareCurrentReplacement(tx, userId, target, validated);
    const operationId = randomUUID();
    await tx.insert(valueOperations).values({
      id: operationId,
      showId: target.showId,
      userId,
      target,
      request: { handoff },
      plan: prepared.plan,
      comparison: prepared.comparison,
    });
    return {
      operationId,
      target,
      oldValue: prepared.oldValue,
      replacementValue: prepared.replacementValue,
      representation: prepared.plan.representation,
      showName: prepared.plan.labels.showName,
      sourceLabel: prepared.plan.labels.sourceLabel,
      scopeLabel: prepared.plan.labels.scopeLabel,
      aliasEffects: prepared.plan.labels.aliasEffects,
      copyOnly: false,
    };
  });
}

interface PreparedPlan {
  readonly plan: StoredPlan;
  readonly comparison: CurrentComparison | null;
  readonly oldValue: unknown;
  readonly replacementValue: unknown;
}

function validatedRepresentation(validated: ValidatedValue): "typed" | "plain" {
  return validated.kind === "typed" ? "typed" : "plain";
}

function replacementDisplay(
  target: ValueTarget,
  graph: ShowGraph,
  replacement: PreparedValueReplacement,
): unknown {
  const contract = selectedValueContract(graph, target.sourceId, target.fieldPath);
  return expandPortableValue(
    projectRuntimeValue({
      showId: target.showId,
      plane: target.kind === "default" ? "default" : "current",
      type: contract.type,
      allowsAbsence: contract.allowsAbsence,
      shapes: graph.shapes ?? [],
      value: replacement.value,
      structuredValues: replacement.structuredValues,
    }),
  );
}

async function prepareDefaultReplacement(
  tx: Tx,
  userId: string,
  target: Extract<ValueTarget, { kind: "default" }>,
  validated: ValidatedValue,
): Promise<PreparedPlan> {
  const show = await requireOwnedShow(tx, target.showId, userId, true);
  const graph = await readShowGraph(target.showId, "draft", tx);
  if (graph.version !== target.draftVersion) {
    throw captureRefusal(
      "stale-version",
      "The Show changed since this destination was pinned. Refresh and paste again.",
      target.fieldPath,
    );
  }
  const source = requireSource(graph, target.sourceId, target.fieldPath);
  refuseIncomingWiring(graph, target.sourceId, target.fieldPath);
  const contract = selectedValueContract(graph, target.sourceId, target.fieldPath);
  const replacement = prepareValueReplacement(validated, {
    type: contract.type,
    shapes: (graph.shapes ?? []) as readonly Shape[],
    allowsAbsence: contract.allowsAbsence,
  });
  await assertActiveValueImages(tx, target.showId, replacement.images);
  const oldEnvelope = projectDefaultValue({
    showId: target.showId,
    graph,
    sourceId: target.sourceId,
    fieldPath: target.fieldPath,
  });
  return {
    plan: {
      representation: validatedRepresentation(validated),
      plane: "default",
      template: replacement.template,
      images: replacement.images,
      contractTypeCanonical: canonicalValue(contract.type),
      labels: {
        showName: show.name,
        sourceLabel: contract.label,
        scopeLabel: "Default",
        aliasEffects:
          target.fieldPath.length === 0
            ? `Replaces ${source.name}'s authored Default. Sibling Sources, their overrides and their inheritance are untouched.`
            : `Replaces the authored Default for this Field of ${source.name}. Sibling Fields keep their overrides and inheritance.`,
      },
    },
    comparison: null,
    oldValue: expandPortableValue(oldEnvelope),
    replacementValue: replacementDisplay(target, graph, replacement),
  };
}

async function prepareCurrentReplacement(
  tx: Tx,
  userId: string,
  target: Extract<ValueTarget, { kind: "current-show" | "current-instance" }>,
  validated: ValidatedValue,
): Promise<PreparedPlan> {
  const show = await requireOwnedShow(tx, target.showId, userId, true);
  const run = await lockActiveRun(tx, target.showId);
  if (!run || run.id !== target.runId) {
    throw currentRefusal({
      code: "no-active-run",
      message: "That Run is no longer the Show's active Run.",
      path: target.fieldPath,
    });
  }
  const graph = await readShowGraph(target.showId, "published", tx);
  if (graph.version !== target.publishedVersion) {
    throw captureRefusal(
      "stale-version",
      "The Show was published again since this destination was pinned. Refresh and paste again.",
      target.fieldPath,
    );
  }
  const source = requireSource(graph, target.sourceId, target.fieldPath);
  refuseIncomingWiring(graph, target.sourceId, target.fieldPath);
  const contract = selectedValueContract(graph, target.sourceId, target.fieldPath);

  const showState = await readRunState(run.id, tx);
  let state: RunState;
  let ownedState: RunState;
  let scopeLabel: string;
  if (target.kind === "current-show") {
    if (source.parentId !== null) {
      throw currentRefusal({
        code: "cross-scope-target",
        message:
          "That Source is Flow-local, so its Current value belongs to a Shared Device Instance, not the Show.",
        path: target.fieldPath,
      });
    }
    state = showState;
    ownedState = showState;
    scopeLabel = "Current · Show";
  } else {
    const eligibility = sharedInstanceEligibility(graph, target.deviceId, target.flowId);
    if (!eligibility) {
      throw currentRefusal({
        code: "device-not-eligible",
        message: "That Device is not a configured Shared Device driving the named Flow.",
        path: target.fieldPath,
      });
    }
    if (source.parentId !== target.flowId) {
      throw currentRefusal({
        code: "cross-scope-target",
        message:
          "That Source does not belong to the selected Shared Device Instance's Flow. Choose the Instance whose Flow owns it, or the Show-level target.",
        path: target.fieldPath,
      });
    }
    const snapshot = await readInstanceCurrentState(
      run.id,
      target.deviceId,
      showState,
      target.flowId,
      target.publishedVersion,
      tx,
    );
    if (!snapshot) {
      throw currentRefusal({
        code: "missing-instance-state",
        message: "That Shared Device Instance has no state in this Run.",
        path: target.fieldPath,
      });
    }
    ownedState = snapshot.state;
    state = snapshot.evaluation;
    scopeLabel = `Current · Shared Device ${eligibility.deviceName} · Flow ${target.flowId}`;
  }

  // The comparison snapshot is built under the same locks a commit takes,
  // so the confirmation's old value is the value the first commit compares.
  const comparison = buildCurrentComparison(state, target.sourceId, target.fieldPath);
  if (comparison.kind === "failed") throw currentRefusal(comparison.detail);
  const holderValue = readHolderValue(state, holderFor(comparison.comparison));
  const holder = holderFor(comparison.comparison);
  if (
    holder.kind === "recordField" &&
    !Object.hasOwn(ownedState.structuredValues, holder.recordId)
  ) {
    throw currentRefusal({
      code: "cross-scope-target",
      message:
        "This Field's actual holder belongs to Show storage, not the selected Shared Instance. Select its Show-level Source, or replace the whole Instance Source root instead.",
      path: target.fieldPath,
    });
  }

  const replacement = prepareValueReplacement(validated, {
    type: contract.type,
    shapes: (graph.shapes ?? []) as readonly Shape[],
    allowsAbsence: contract.allowsAbsence,
  });
  await assertActiveValueImages(tx, target.showId, replacement.images);

  return {
    plan: {
      representation: validatedRepresentation(validated),
      plane: "current",
      value: replacement.value,
      records: Object.values(replacement.structuredValues),
      images: replacement.images,
      contractTypeCanonical: canonicalValue(contract.type),
      labels: {
        showName: show.name,
        sourceLabel: contract.label,
        scopeLabel,
        aliasEffects:
          target.fieldPath.length === 0
            ? `Rebinds only ${source.name}. Every other reference to its old value keeps the old value.`
            : `Writes the existing containing holder, so every alias to it observes the new Field value. Direct references to the old Field value keep the old value.`,
      },
    } satisfies StoredPlan,
    comparison: comparison.comparison,
    oldValue: expandPortableValue(
      projectRuntimeValue({
        showId: target.showId,
        plane: "current",
        type: contract.type,
        allowsAbsence: contract.allowsAbsence,
        shapes: graph.shapes ?? [],
        value: holderValue,
        structuredValues: state.structuredValues,
      }),
    ),
    replacementValue: replacementDisplay(target, graph, replacement),
  };
}

function holderFor(comparison: CurrentComparison) {
  if (comparison.binding.kind === "sourceRoot") {
    return { kind: "sourceRoot" as const, sourceId: comparison.binding.sourceId };
  }
  return {
    kind: "recordField" as const,
    recordId: comparison.binding.recordId,
    fieldId: comparison.binding.fieldId,
  };
}

function refuseIncomingWiring(
  graph: ShowGraph,
  sourceId: string,
  fieldPath: readonly string[],
): void {
  if (hasIncomingWiring(graph, sourceId)) {
    throw currentRefusal({
      code: "incoming-wiring",
      message: "That Source is fed by incoming wiring, so it is copy-only.",
      path: fieldPath,
    });
  }
}

// ---------------------------------------------------------------------------
// Commit and lookup
// ---------------------------------------------------------------------------

type OperationRow = typeof valueOperations.$inferSelect;

/**
 * Applies one prepared operation exactly as bound, or reports the stored
 * outcome for an identity that already resolved. The mutation and its
 * receipt/diagnostic commit together; a repeated identity cannot reapply or
 * bind another request (#897).
 */
export async function commitSourceValue(
  userId: string,
  operationId: string,
): Promise<ValueOperationOutcome> {
  const result = await db.transaction(
    async (
      tx,
    ): Promise<{ outcome: ValueOperationOutcome; afterCommit: (() => Promise<void>) | null }> => {
      const [row] = await tx
        .select()
        .from(valueOperations)
        .where(eq(valueOperations.id, operationId))
        .for("update");
      if (!row) return { outcome: { kind: "pending" }, afterCommit: null };
      if (row.userId !== userId)
        throw refusal(
          "rejected-input",
          "authorization",
          "unavailable-or-not-authorized",
          "Show not found.",
          [],
          "Sign in as the Show's owner, then try again.",
        );
      await requireOwnedShow(tx, row.showId, userId, true);
      if (row.status === "committed") {
        return {
          outcome: {
            kind: "committed",
            receipt: storedReceipt(row.receipt, decodeValueTargetInput),
          },
          afterCommit: null,
        };
      }
      if (row.status === "rejected") {
        return {
          outcome: { kind: "rejected", diagnostic: storedDiagnostic(row.diagnostic) },
          afterCommit: null,
        };
      }
      try {
        const applied = await tx.transaction((savepoint) =>
          applyPreparedOperation(savepoint, row, userId),
        );
        await tx
          .update(valueOperations)
          .set({ status: "committed", receipt: applied.receipt, resolvedAt: new Date() })
          .where(eq(valueOperations.id, operationId));
        return {
          outcome: { kind: "committed", receipt: applied.receipt },
          afterCommit: applied.afterCommit,
        };
      } catch (error) {
        const rejection =
          error instanceof ValueTransferError
            ? error
            : commitRefusal(
                "commit-failed",
                "The replacement could not be applied. Refresh and prepare it again.",
                [],
              );
        // A definitive refusal is part of the operation's outcome, so it
        // persists with the same atomicity a receipt would.
        const diagnostic: ValueTransferDiagnostic = {
          ...rejection.diagnostic,
          category: "commit-rejected",
        };
        await tx
          .update(valueOperations)
          .set({ status: "rejected", diagnostic, resolvedAt: new Date() })
          .where(eq(valueOperations.id, operationId));
        return { outcome: { kind: "rejected", diagnostic }, afterCommit: null };
      }
    },
  );
  if (result.afterCommit) await result.afterCommit();
  return result.outcome;
}

/**
 * The owner's exact lookup of one operation. Repeats the Show ownership
 * check, maps a still-prepared operation to `pending`, and — because a
 * missing result is not a definitive rejection — reports `pending` for an
 * operation it cannot see (#897).
 */
export async function lookupSourceValue(
  userId: string,
  showId: string,
  operationId: string,
): Promise<ValueOperationOutcome> {
  return db.transaction(
    async (tx) => {
      await requireOwnedShow(tx, showId, userId);
      const [row] = await tx
        .select()
        .from(valueOperations)
        .where(
          and(
            eq(valueOperations.id, operationId),
            eq(valueOperations.showId, showId),
            eq(valueOperations.userId, userId),
          ),
        );
      if (!row || row.status === "prepared") return { kind: "pending" };
      if (row.status === "committed") {
        return { kind: "committed", receipt: storedReceipt(row.receipt, decodeValueTargetInput) };
      }
      return { kind: "rejected", diagnostic: storedDiagnostic(row.diagnostic) };
    },
    { isolationLevel: "repeatable read" },
  );
}

interface AppliedOperation {
  readonly receipt: ValueOperationReceipt;
  readonly afterCommit: (() => Promise<void>) | null;
}

async function applyPreparedOperation(
  tx: Tx,
  row: OperationRow,
  userId: string,
): Promise<AppliedOperation> {
  if (row.userId !== userId) {
    throw refusal(
      "rejected-input",
      "authorization",
      "unavailable-or-not-authorized",
      "Show not found.",
      [],
      "Sign in as the Show's owner, then try again.",
    );
  }
  const target = decodeValueTargetInput(row.target);
  const plan = storedPlan(row.plan);
  // Every check prepare made is repeated here, under the mutation's locks:
  // ownership, version, Source identity, contract Type, wiring and images.
  await requireOwnedShow(tx, row.showId, userId);
  if (target.kind === "default") {
    if (plan.plane !== "default")
      throw commitRefusal(
        "malformed-operation",
        "The stored replacement plane does not match its target.",
        target.fieldPath,
      );
    return commitDefault(tx, row.showId, target, plan, userId);
  }
  if (plan.plane !== "current")
    throw commitRefusal(
      "malformed-operation",
      "The stored replacement plane does not match its target.",
      target.fieldPath,
    );
  return commitCurrent(tx, row.showId, target, plan, row.comparison);
}

async function commitDefault(
  tx: Tx,
  showId: string,
  target: Extract<ValueTarget, { kind: "default" }>,
  plan: Extract<StoredPlan, { plane: "default" }>,
  userId: string,
): Promise<AppliedOperation> {
  const graph = await readShowGraph(showId, "draft", tx);
  if (graph.version !== target.draftVersion) {
    throw commitRefusal(
      "stale-version",
      "The Show changed since this replacement was prepared. Refresh and paste again.",
      target.fieldPath,
    );
  }
  requireSource(graph, target.sourceId, target.fieldPath);
  refuseIncomingWiring(graph, target.sourceId, target.fieldPath);
  recheckContract(graph, target, plan);
  await assertActiveValueImages(tx, showId, plan.images);
  const after = defaultReplacementEntries(graph, target.sourceId, target.fieldPath, plan.template);
  // The atom replaces the Show's whole authored Default entry list, so the
  // undoable fact is the complete before/after pair — sibling and other-node
  // entries included, byte-identical unless this replacement changed them.
  const before: SourceFieldDefault[] = [...(graph.sourceFieldDefaults ?? [])];
  const edit: GraphEdit = { type: "graph.replaceSourceDefaults", before, after };
  const result = await applyShowEditsTransaction(
    tx,
    showId,
    [edit],
    [],
    target.draftVersion,
    userId,
  );
  const receipt: DefaultValueReceipt = {
    kind: "default",
    target,
    version: result.applied.version,
    updatedAt: result.applied.updatedAt.toISOString(),
    published: result.applied.published
      ? {
          version: result.applied.published.version,
          updatedAt: result.applied.published.updatedAt.toISOString(),
        }
      : null,
    edits: [encodeGraphEdit(edit)],
    amendments: result.applied.amendments.map(encodeGraphEdit),
  };
  return {
    receipt,
    // Publication effects (domain eviction and Player invalidation drainage)
    // run only after this transaction commits, exactly as applyShowEdits
    // orders them for an ordinary edit batch.
    afterCommit: () => afterShowEdits(showId, result),
  };
}

async function commitCurrent(
  tx: Tx,
  showId: string,
  target: Extract<ValueTarget, { kind: "current-show" | "current-instance" }>,
  plan: Extract<StoredPlan, { plane: "current" }>,
  comparison: unknown,
): Promise<AppliedOperation> {
  const run = await lockActiveRun(tx, showId);
  if (!run || run.id !== target.runId) {
    throw commitRefusal(
      "run-not-active",
      "That Run is no longer the Show's active Run, so the replacement cannot land.",
      target.fieldPath,
    );
  }
  const graph = await readShowGraph(showId, "published", tx);
  if (graph.version !== target.publishedVersion) {
    throw commitRefusal(
      "stale-version",
      "The Show was published again since this replacement was prepared. Refresh and confirm again.",
      target.fieldPath,
    );
  }
  const source = requireSource(graph, target.sourceId, target.fieldPath);
  refuseIncomingWiring(graph, target.sourceId, target.fieldPath);
  recheckContract(graph, target, plan);

  const showState = await readRunState(run.id, tx);
  let state: RunState;
  let ownedState: RunState;
  if (target.kind === "current-show") {
    if (source.parentId !== null) {
      throw commitRefusal(
        "cross-scope-target",
        "That Source is Flow-local; its Current value belongs to a Shared Device Instance.",
        target.fieldPath,
      );
    }
    state = showState;
    ownedState = showState;
  } else {
    const eligibility = sharedInstanceEligibility(graph, target.deviceId, target.flowId);
    if (!eligibility) {
      throw commitRefusal(
        "device-not-eligible",
        "That Device is no longer a configured Shared Device driving the named Flow.",
        target.fieldPath,
      );
    }
    if (source.parentId !== target.flowId) {
      throw commitRefusal(
        "cross-scope-target",
        "That Source no longer belongs to the selected Shared Device Instance's Flow.",
        target.fieldPath,
      );
    }
    const [deviceRow] = await tx
      .select()
      .from(runDeviceStates)
      .where(and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, target.deviceId)))
      .for("update");
    if (!deviceRow) {
      // Missing authoritative state is refused, never initialized (#900).
      throw commitRefusal(
        "missing-instance-state",
        "That Shared Device Instance has no state in this Run.",
        target.fieldPath,
      );
    }
    if (
      deviceRow.flowId !== target.flowId ||
      deviceRow.publishedGraphVersion !== target.publishedVersion
    ) {
      throw commitRefusal(
        "instance-changed",
        "That Shared Device Instance's Flow or published state changed. Select an eligible Instance and confirm again.",
        target.fieldPath,
      );
    }
    ownedState = {
      sourceValues: deviceRow.instanceSourceValues as RunState["sourceValues"],
      structuredValues: deviceRow.instanceStructuredValues as RunState["structuredValues"],
    };
    state = composeInstanceView(showState, ownedState);
  }

  // The selected-value comparison, under the locks the write will take: a
  // changed selected value, closure or holder binding rejects; a sibling-only
  // change leaves all three untouched and passes (#872).
  if (
    !currentComparisonMatches(
      storedComparison(comparison),
      state,
      target.sourceId,
      target.fieldPath,
    )
  ) {
    throw commitRefusal(
      "stale-value",
      "The selected Current value or its references changed. Refresh, re-read and confirm again.",
      target.fieldPath,
    );
  }
  await assertActiveValueImages(tx, showId, plan.images);
  const resolved = resolveCurrentHolder(state, target.sourceId, target.fieldPath);
  if (resolved.kind === "failed") throw currentRefusal(resolved.detail);
  if (
    resolved.holder.kind === "recordField" &&
    !Object.hasOwn(ownedState.structuredValues, resolved.holder.recordId)
  ) {
    throw commitRefusal(
      "cross-scope-target",
      "This Field's actual holder is Show-owned. Select its Show-level Source, or replace the whole Instance Source root instead.",
      target.fieldPath,
    );
  }
  const write = { holder: resolved.holder, value: plan.value, records: plan.records };

  if (target.kind === "current-show") {
    await applyCurrentWriteToRunRows(tx, run.id, write);
  } else {
    await applyCurrentWriteToInstance(
      tx,
      run.id,
      target.deviceId,
      applyCurrentWriteToState(ownedState, write),
    );
  }
  // Live propagation is mandatory: sequence plus outbox, in this transaction.
  const stateSequence = await enqueuePlayerInvalidations(
    tx,
    showId,
    target.kind === "current-instance" ? [target.deviceId] : undefined,
  );
  if (stateSequence === null) throw new Error("The locked Show disappeared.");
  const receipt: CurrentValueReceipt = { kind: "current", target, stateSequence };
  return {
    receipt,
    afterCommit: async () => {
      await drainPlayerInvalidations();
    },
  };
}

function recheckContract(
  graph: ShowGraph,
  target: Extract<ValueTarget, { fieldPath: readonly string[]; sourceId: string }>,
  plan: StoredPlan,
): void {
  const contract = selectedValueContract(graph, target.sourceId, target.fieldPath);
  if (canonicalValue(contract.type) !== plan.contractTypeCanonical) {
    throw commitRefusal(
      "incompatible-type",
      "The selected value's Type changed since this replacement was prepared.",
      target.fieldPath,
    );
  }
}

function commitRefusal(code: string, message: string, path: readonly string[]): ValueTransferError {
  return refusal(
    "commit-rejected",
    "application",
    code,
    message,
    path,
    "Refresh, re-read and confirm again.",
  );
}
