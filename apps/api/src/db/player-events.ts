import { resolveCueParameters } from "@mechane/domain/cue-parameters";
import type { ShowGraph } from "@mechane/domain/graph";
import {
  InvalidInteractionError,
  resolveRuntimeEvent,
  type Action,
  type BlockInstancePathSegment,
  type RuntimeEventObservation,
  type RuntimeEventPlan,
  type UpdateAction,
} from "@mechane/domain/interactions";
import { PAIRING_CODE_PATTERN } from "@mechane/domain/pairing-code";
import { isStructuredValueReference, type RunState } from "@mechane/domain/structured-values";
import {
  applyUpdateWrites as stageUpdateWrites,
  classifyUpdateActionScope,
  planUpdate,
  resolveUpdateHolderScope,
  type UpdateWrite,
} from "@mechane/domain/update-plan";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { readCanvas } from "./canvas";
import { db } from "./client";
import { drainPlayerInvalidations, enqueuePlayerInvalidations } from "./player-invalidation-outbox";
import { RunConfigurationError, withRunErrorLog } from "./run-errors";
import { readShowGraph } from "./show-graph";
import { readRunState } from "./runs";
import {
  devices,
  playerEvents,
  runDeviceStates,
  runs,
  runSourceValues,
  runStructuredValues,
} from "./schema";

const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface PlayerEventInput {
  eventId: string;
  publishedGraphVersion: number;
  sceneId: string;
  elementId: string;
  eventKind: string;
  /** The observed root-to-leaf Slot instance path; the server re-resolves it. */
  slotInstancePath?: readonly BlockInstancePathSegment[];
  /** Per-kind payload as the Player observed it; `keypress` carries `{ key }`. */
  params?: Record<string, unknown> | null;
  /**
   * Player-resolved values for each Show-scoped Action, keyed by Action id.
   * Each entry is the staged state at the point that Action ran (#628), so a
   * Show Action reads an Instance write made earlier in the same Cue.
   */
  evidence?: Record<string, PlayerActionEvidence>;
}

export interface PlayerActionEvidence {
  sourceValues: Record<string, unknown>;
  cueParameters: Record<string, unknown>;
}

/**
 * The observation a submitted Event stands for, or `null` when the input names
 * no kind this server understands.
 *
 * Deliberately lenient about the payload: an out-of-catalogue key simply
 * matches no Binding and lands on the existing `unbound-event` outcome. A
 * second error path distinguishing "key you can't bind" from "key nobody
 * bound" would tell a hostile client something and a legitimate one nothing.
 */
function observationFor(
  input: PlayerEventInput,
  sceneId: string,
  canvasId: string,
): RuntimeEventObservation | null {
  const base = {
    sceneId,
    canvasId,
    elementId: input.elementId,
    slotInstancePath: input.slotInstancePath ?? [],
  };
  if (input.eventKind === "tap") return { ...base, eventKind: "tap" };
  if (input.eventKind === "keypress") {
    const key = (input.params as { key?: unknown } | null | undefined)?.key;
    if (typeof key !== "string") return null;
    return { ...base, eventKind: "keypress", params: { key } };
  }
  return null;
}

export type PlayerEventIgnoreReason =
  | "no-active-run"
  | "unsupported-device"
  | "no-navigation-state"
  | "not-ready"
  | "stale-scene"
  | "unbound-event"
  | "invalid-slot-path";
export type PlayerEventResult =
  | { kind: "applied"; eventId: string; resultingSceneId: string; changed: boolean }
  | {
      kind: "duplicate";
      eventId: string;
      outcome: "applied" | "ignored" | "failed" | "accepted" | "rejected";
      changed: boolean;
      resultingSceneId: string | null;
      reason: string | null;
    }
  | { kind: "ignored"; eventId: string; reason: PlayerEventIgnoreReason }
  | { kind: "failed"; eventId: string; actionId: string; reason: string }
  | { kind: "accepted"; eventId: string }
  | {
      kind: "rejected";
      eventId: string;
      reason: "no-active-run" | "stale-publication" | "invalid-event";
    };

export class PlayerEventInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerEventInputError";
  }
}

function validSlotInstancePath(path: readonly BlockInstancePathSegment[] | undefined): boolean {
  return (
    path === undefined ||
    path.every(
      (segment) =>
        typeof segment.slotElementId === "string" &&
        segment.slotElementId.length > 0 &&
        Number.isInteger(segment.index) &&
        segment.index >= 0,
    )
  );
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PlayerEventRow = typeof playerEvents.$inferSelect;

function duplicateResult(row: PlayerEventRow): PlayerEventResult {
  if (row.outcome === "failed") {
    return {
      kind: "duplicate",
      eventId: row.eventId,
      outcome: "failed",
      changed: row.changed,
      resultingSceneId: row.resultingSceneId,
      reason: row.reason,
    };
  }
  if (row.outcome === "applied") {
    if (!row.resultingSceneId) {
      throw new RunConfigurationError({
        showId: row.showId,
        runId: row.runId,
        category: "incompleteEventRecord",
        deviceId: row.deviceId,
        eventId: row.eventId,
        publishedGraphVersion: row.publishedGraphVersion,
      });
    }
    return {
      kind: "duplicate",
      eventId: row.eventId,
      outcome: "applied",
      changed: row.changed,
      resultingSceneId: row.resultingSceneId,
      reason: null,
    };
  }
  return {
    kind: "duplicate",
    eventId: row.eventId,
    outcome: row.outcome as "ignored" | "accepted" | "rejected",
    changed: row.changed,
    resultingSceneId: row.resultingSceneId,
    reason: row.reason,
  };
}
function evidenceReferencesReachable(
  graph: ShowGraph,
  state: RunState,
  evidence: PlayerActionEvidence | undefined,
): boolean {
  if (!evidence) return true;
  const reachable = new Set<string>();
  const visit = (value: unknown): void => {
    if (!isStructuredValueReference(value) || reachable.has(value.ref)) return;
    const record = state.structuredValues[value.ref];
    if (!record) return;
    reachable.add(value.ref);
    const values = record.kind === "array" ? record.items : Object.values(record.fields);
    values.forEach(visit);
  };
  for (const source of graph.nodes) {
    if (source.kind === "source" && source.parentId === null) visit(state.sourceValues[source.id]);
  }
  const containsOnlyReachableReferences = (value: unknown): boolean => {
    if (isStructuredValueReference(value)) return reachable.has(value.ref);
    if (Array.isArray(value)) return value.every(containsOnlyReachableReferences);
    if (value !== null && typeof value === "object") {
      return Object.values(value).every(containsOnlyReachableReferences);
    }
    return true;
  };
  return (
    containsOnlyReachableReferences(evidence.sourceValues) &&
    containsOnlyReachableReferences(evidence.cueParameters)
  );
}
async function recordEvent(
  tx: Tx,
  runId: string,
  showId: string,
  deviceId: string,
  input: PlayerEventInput,
  result: PlayerEventResult,
  resultingSceneId?: string | null,
): Promise<void> {
  const outcome =
    result.kind === "applied" || result.kind === "accepted"
      ? result.kind
      : result.kind === "failed"
        ? "failed"
        : result.kind === "rejected"
          ? "rejected"
          : "ignored";
  await tx.insert(playerEvents).values({
    runId,
    showId,
    deviceId,
    eventId: input.eventId,
    publishedGraphVersion: input.publishedGraphVersion,
    observedSceneId: input.sceneId,
    elementId: input.elementId,
    eventKind: input.eventKind,
    params: input.params ?? null,
    slotInstancePath: input.slotInstancePath ?? [],
    outcome,
    changed: result.kind === "applied" ? result.changed : false,
    reason:
      result.kind === "ignored" || result.kind === "rejected" || result.kind === "failed"
        ? result.reason
        : null,
    failingActionId: result.kind === "failed" ? result.actionId : null,
    resultingSceneId:
      result.kind === "applied"
        ? result.resultingSceneId
        : result.kind === "accepted"
          ? (resultingSceneId ?? null)
          : null,
  });
}

type DeviceRow = typeof devices.$inferSelect;

/**
 * The evidence a per-connection Player sent for one Action, if any. The input
 * is client JSON, so an entry that is not an object counts as absent rather
 * than as a crash.
 */
function actionEvidence(
  input: PlayerEventInput,
  actionId: string,
): PlayerActionEvidence | undefined {
  const { evidence } = input;
  if (typeof evidence !== "object" || evidence === null || !Object.hasOwn(evidence, actionId)) {
    return undefined;
  }
  const entry: unknown = evidence[actionId];
  return typeof entry === "object" && entry !== null ? (entry as PlayerActionEvidence) : undefined;
}

type CueUpdateRouting =
  /**
   * A Shared Device's state is the server's, so it resolves the Cue
   * Parameters itself and accepts no evidence.
   */
  | { kind: "shared"; cueParameters: Readonly<Record<string, unknown>> }
  /**
   * A per-connection Device owns its Flow-local values (ADR-0018) and sends
   * them, with the Cue Parameters, as evidence the server validates rather
   * than trusts as storage.
   */
  | { kind: "perConnection"; input: PlayerEventInput };

type CueUpdatePlan =
  | { kind: "planned"; writes: readonly UpdateWrite[]; changed: boolean }
  | { kind: "failed"; actionId: string; reason: string };

/**
 * Plans a Cue's server-side Updates in declared order (#535, #628).
 *
 * Each Update plans against the state the Updates before it left, so a later
 * Action reads an earlier one's write. Nothing touches a row until every
 * Update has planned, which is what makes Show scope all-or-nothing: a
 * failure part-way leaves the Run exactly as the Cue found it.
 *
 * The `eventId` names the Event these Updates run for: it is what a reset's
 * fresh Structured Value identities derive from, so a Player planning the
 * same Event mints the same ones (#884).
 */
function planCueUpdates(
  graph: ShowGraph,
  state: RunState,
  sceneId: string,
  eventId: string,
  updates: readonly UpdateAction[],
  routing: CueUpdateRouting,
): CueUpdatePlan {
  let staged = state;
  const writes: UpdateWrite[] = [];
  let changed = false;
  for (const action of updates) {
    let routed = staged;
    let cueParameters: Readonly<Record<string, unknown>>;
    if (routing.kind === "shared") {
      cueParameters = routing.cueParameters;
    } else {
      const evidence = actionEvidence(routing.input, action.id);
      const scope = classifyUpdateActionScope(graph, action);
      // A Flow-local holder path is the Player's to resolve. Without evidence
      // it resolved into the Player's own Instance scope, and with evidence it
      // still may have; either way the write is not the server's to apply.
      if (scope === "depends" && !evidence) continue;
      if (evidence) {
        routed = {
          sourceValues: {
            ...staged.sourceValues,
            ...(evidence.sourceValues as RunState["sourceValues"]),
          },
          structuredValues: staged.structuredValues,
        };
      }
      if (scope === "depends" && resolveUpdateHolderScope(graph, routed, action) === "instance") {
        continue;
      }
      if (!evidenceReferencesReachable(graph, staged, evidence)) {
        return { kind: "failed", actionId: action.id, reason: "detached-reference" };
      }
      cueParameters = evidence?.cueParameters ?? {};
    }
    const plan = planUpdate(graph, routed, sceneId, action, eventId, cueParameters);
    if (plan.kind === "failed") {
      return { kind: "failed", actionId: action.id, reason: plan.reason };
    }
    staged = stageUpdateWrites(staged, plan.writes);
    writes.push(...plan.writes);
    changed ||= plan.changed;
  }
  return { kind: "planned", writes, changed };
}

type CueNavigation =
  | { kind: "valid"; targetSceneId: string | null }
  | { kind: "invalid"; actionId: string };

/**
 * The Scene a Cue navigates to, if any. At most one Navigate per Cue (#535),
 * and it must target a Scene in the Device's Flow; a Device driven straight
 * by a Scene has no Flow, so any Navigate there is invalid.
 */
function resolveCueNavigation(
  graph: ShowGraph,
  cueId: string,
  actions: readonly Action[],
  flowId: string | null,
): CueNavigation {
  let targetSceneId: string | null = null;
  for (const action of actions) {
    if (action.kind !== "navigate") continue;
    const target = graph.nodes.find((node) => node.id === action.targetSceneId);
    if (
      targetSceneId !== null ||
      action.cueId !== cueId ||
      flowId === null ||
      target?.kind !== "scene" ||
      target.parentId !== flowId
    ) {
      return { kind: "invalid", actionId: action.id };
    }
    targetSceneId = target.id;
  }
  return { kind: "valid", targetSceneId };
}

/**
 * Plans and persists a Shared Device Cue's Updates. A Shared Device's state is
 * the server's, so the Cue Parameters are resolved from the Canvas and the Run
 * as the Cue starts, the same point a per-connection Player resolves them.
 */
async function executeSharedCueUpdates(
  tx: Tx,
  runId: string,
  graph: ShowGraph,
  canvas: Parameters<typeof resolveCueParameters>[0]["canvas"],
  sceneId: string,
  eventId: string,
  plan: Extract<RuntimeEventPlan, { kind: "planned" }>,
): Promise<CueUpdatePlan> {
  const updates = plan.actions.filter((action): action is UpdateAction => action.kind === "update");
  const [first] = updates;
  if (!first) return { kind: "planned", writes: [], changed: false };
  const state = await readRunState(runId, tx);
  const resolved = resolveCueParameters({
    graph,
    canvas,
    sceneId,
    state,
    blocks: graph.blocks ?? [],
    parameters: plan.parameters,
  });
  if (resolved.kind === "failed") {
    return { kind: "failed", actionId: first.id, reason: resolved.reason };
  }
  const planned = planCueUpdates(graph, state, sceneId, eventId, updates, {
    kind: "shared",
    cueParameters: resolved.values,
  });
  if (planned.kind === "planned") await persistUpdateWrites(tx, runId, planned.writes);
  return planned;
}

/**
 * Applies a plan as row operations.
 *
 * Each write touches one row, which is what `replaceRunState` — deleting and
 * reinserting every row for the Run — could never do, and what gives the
 * eventual row-level locking something to hold. A field write is a `jsonb_set`
 * on the addressed record rather than a read-modify-write in JavaScript, so
 * the update is the database's to serialize.
 */
async function persistUpdateWrites(
  tx: Tx,
  runId: string,
  writes: readonly UpdateWrite[],
): Promise<void> {
  for (const write of writes) {
    if (write.kind === "record") {
      const { record } = write;
      await tx
        .insert(runStructuredValues)
        .values({
          runId,
          structuredValueId: record.id,
          kind: record.kind,
          type: record.type,
          payload: record.kind === "array" ? record.items : record.fields,
        })
        .onConflictDoUpdate({
          target: [runStructuredValues.runId, runStructuredValues.structuredValueId],
          set: {
            kind: record.kind,
            type: record.type,
            payload: record.kind === "array" ? record.items : record.fields,
          },
        });
      continue;
    }

    if (write.kind === "sourceRoot") {
      await tx
        .insert(runSourceValues)
        .values({ runId, sourceId: write.sourceId, value: write.value })
        .onConflictDoUpdate({
          target: [runSourceValues.runId, runSourceValues.sourceId],
          set: { value: write.value },
        });
      continue;
    }

    await tx
      .update(runStructuredValues)
      .set({
        payload: sql`jsonb_set(${runStructuredValues.payload}, ARRAY[${write.fieldId}], ${JSON.stringify(write.value ?? null)}::jsonb)`,
      })
      .where(
        and(
          eq(runStructuredValues.runId, runId),
          eq(runStructuredValues.structuredValueId, write.recordId),
        ),
      );
  }
}

async function dispatchPerConnectionEvent(
  tx: Tx,
  device: DeviceRow,
  input: PlayerEventInput,
): Promise<PlayerEventResult> {
  const [run] = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.showId, device.showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1)
    .for("update");
  if (!run) return { kind: "rejected", eventId: input.eventId, reason: "no-active-run" };

  const [existing] = await tx
    .select()
    .from(playerEvents)
    .where(
      and(
        eq(playerEvents.runId, run.id),
        eq(playerEvents.deviceId, device.id),
        eq(playerEvents.eventId, input.eventId),
      ),
    );
  if (existing) return duplicateResult(existing);
  if (!validSlotInstancePath(input.slotInstancePath)) {
    const result: PlayerEventResult = {
      kind: "ignored",
      eventId: input.eventId,
      reason: "invalid-slot-path",
    };
    await recordEvent(tx, run.id, device.showId, device.id, input, result);
    return result;
  }

  const graph = await readShowGraph(device.showId, "published", tx);
  if (input.publishedGraphVersion !== graph.version) {
    const result: PlayerEventResult = {
      kind: "rejected",
      eventId: input.eventId,
      reason: "stale-publication",
    };
    await recordEvent(tx, run.id, device.showId, device.id, input, result);
    return result;
  }
  const driver = graph.edges.find((edge) => edge.kind === "device" && edge.targetId === device.id);
  const flow = driver
    ? graph.nodes.find((node) => node.id === driver.sourceId && node.kind === "flow")
    : undefined;
  if (!flow || flow.kind !== "flow") {
    throw new RunConfigurationError({
      showId: device.showId,
      runId: run.id,
      category: "deviceWithoutFlow",
      deviceId: device.id,
      publishedGraphVersion: graph.version,
    });
  }
  const observedScene = graph.nodes.find(
    (node) => node.id === input.sceneId && node.kind === "scene",
  );
  if (!observedScene || observedScene.kind !== "scene" || observedScene.parentId !== flow.id) {
    const result: PlayerEventResult = {
      kind: "rejected",
      eventId: input.eventId,
      reason: "invalid-event",
    };
    await recordEvent(tx, run.id, device.showId, device.id, input, result);
    return result;
  }
  const canvas = await readCanvas(
    device.showId,
    "published",
    { sceneNodeId: observedScene.id },
    tx,
  );
  if (!canvas) {
    throw new RunConfigurationError({
      showId: device.showId,
      runId: run.id,
      category: "missingSceneCanvas",
      deviceId: device.id,
      sceneId: observedScene.id,
      publishedGraphVersion: graph.version,
    });
  }
  const observation = observationFor(input, observedScene.id, canvas.id);
  if (!observation) {
    return { kind: "rejected", eventId: input.eventId, reason: "invalid-event" };
  }
  let plan: RuntimeEventPlan;
  try {
    plan = resolveRuntimeEvent(graph, observation);
  } catch (error) {
    if (error instanceof InvalidInteractionError) {
      throw new RunConfigurationError({
        showId: device.showId,
        runId: run.id,
        category: "invalidInteractions",
        deviceId: device.id,
        sceneId: observedScene.id,
        elementId: input.elementId,
        publishedGraphVersion: graph.version,
      });
    }
    throw error;
  }
  if (plan.kind === "unbound") {
    const result: PlayerEventResult = {
      kind: "rejected",
      eventId: input.eventId,
      reason: "invalid-event",
    };
    await recordEvent(tx, run.id, device.showId, device.id, input, result);
    return result;
  }
  const navigation = resolveCueNavigation(graph, plan.cue.id, plan.actions, flow.id);
  if (navigation.kind === "invalid") {
    throw new RunConfigurationError({
      showId: device.showId,
      runId: run.id,
      category: "invalidNavigateAction",
      deviceId: device.id,
      sceneId: observedScene.id,
      elementId: input.elementId,
      cueId: plan.cue.id,
      actionId: navigation.actionId,
      publishedGraphVersion: graph.version,
    });
  }
  // ADR-0018: the Player owns the current values of Flow-local Sources on a
  // per-connection Device, so an Instance-scoped write is acknowledged and
  // never applied here. Without this the server would both fail the Action it
  // has no operand for and, given one, store one connection's value where
  // every connection reads it.
  const updates = plan.actions.filter(
    (candidate): candidate is UpdateAction =>
      candidate.kind === "update" && classifyUpdateActionScope(graph, candidate) !== "instance",
  );
  if (updates.length > 0) {
    const planned = planCueUpdates(
      graph,
      await readRunState(run.id, tx),
      observedScene.id,
      input.eventId,
      updates,
      { kind: "perConnection", input },
    );
    if (planned.kind === "failed") {
      const result: PlayerEventResult = {
        kind: "failed",
        eventId: input.eventId,
        actionId: planned.actionId,
        reason: planned.reason,
      };
      await recordEvent(tx, run.id, device.showId, device.id, input, result);
      return result;
    }
    await persistUpdateWrites(tx, run.id, planned.writes);
    if (planned.changed) await enqueuePlayerInvalidations(tx, device.showId);
  }
  const result: PlayerEventResult = { kind: "accepted", eventId: input.eventId };
  await recordEvent(tx, run.id, device.showId, device.id, input, result, navigation.targetSceneId);
  return result;
}

export async function dispatchPlayerEvent(
  pairingCode: string,
  input: PlayerEventInput,
): Promise<PlayerEventResult | null> {
  const normalizedCode = pairingCode.trim().toUpperCase();
  if (!PAIRING_CODE_PATTERN.test(normalizedCode)) return null;
  if (!EVENT_ID_PATTERN.test(input.eventId)) {
    throw new PlayerEventInputError("Player Event ID must be a UUID.");
  }
  let invalidationScope: { showId: string; deviceId: string } | null = null;

  // The log wraps the transaction rather than living inside it: every
  // configuration failure below aborts this transaction, so an entry written
  // in `tx` would roll back with the evidence it was recording.
  return withRunErrorLog(() =>
    db
      .transaction(async (tx): Promise<PlayerEventResult | null> => {
        const [device] = await tx
          .select()
          .from(devices)
          .where(and(eq(devices.pairingCode, normalizedCode), isNull(devices.retiredAt)));
        if (!device) return null;
        if (device.perConnection) return dispatchPerConnectionEvent(tx, device, input);

        const [run] = await tx
          .select()
          .from(runs)
          .where(and(eq(runs.showId, device.showId), eq(runs.status, "active")))
          .orderBy(desc(runs.startedAt))
          .limit(1)
          .for("update");
        if (!run) return { kind: "ignored", eventId: input.eventId, reason: "no-active-run" };
        if (device.perConnection) {
          return { kind: "ignored", eventId: input.eventId, reason: "unsupported-device" };
        }

        const [state] = await tx
          .select()
          .from(runDeviceStates)
          .where(and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, device.id)))
          .for("update");
        const [existing] = await tx
          .select()
          .from(playerEvents)
          .where(
            and(
              eq(playerEvents.runId, run.id),
              eq(playerEvents.deviceId, device.id),
              eq(playerEvents.eventId, input.eventId),
            ),
          );
        if (existing) return duplicateResult(existing);

        if (!state) {
          const graph = await readShowGraph(device.showId, "published", tx);
          const driver = graph.edges.find(
            (edge) => edge.kind === "device" && edge.targetId === device.id,
          );
          const source = driver ? graph.nodes.find((node) => node.id === driver.sourceId) : null;
          if (source?.kind === "scene") {
            const canvas = await readCanvas(
              device.showId,
              "published",
              { sceneNodeId: source.id },
              tx,
            );
            if (!canvas) {
              throw new RunConfigurationError({
                showId: device.showId,
                runId: run.id,
                category: "missingSceneCanvas",
                deviceId: device.id,
                sceneId: source.id,
                publishedGraphVersion: graph.version,
              });
            }
            const observation = observationFor(input, source.id, canvas.id);
            if (!observation) {
              const result: PlayerEventResult = {
                kind: "rejected",
                eventId: input.eventId,
                reason: "invalid-event",
              };
              await recordEvent(tx, run.id, device.showId, device.id, input, result);
              return result;
            }
            let plan: RuntimeEventPlan;
            try {
              plan = resolveRuntimeEvent(graph, observation);
            } catch (error) {
              if (error instanceof InvalidInteractionError) {
                throw new RunConfigurationError({
                  showId: device.showId,
                  runId: run.id,
                  category: "invalidInteractions",
                  deviceId: device.id,
                  sceneId: source.id,
                  elementId: input.elementId,
                  publishedGraphVersion: graph.version,
                });
              }
              throw error;
            }
            if (plan.kind === "unbound") {
              const result: PlayerEventResult = {
                kind: "ignored",
                eventId: input.eventId,
                reason: plan.reason === "stale-scene" ? "stale-scene" : "unbound-event",
              };
              await recordEvent(tx, run.id, device.showId, device.id, input, result);
              return result;
            }
            const navigation = resolveCueNavigation(graph, plan.cue.id, plan.actions, null);
            if (plan.actions.length === 0 || navigation.kind === "invalid") {
              throw new RunConfigurationError({
                showId: device.showId,
                runId: run.id,
                category: "invalidNavigateAction",
                deviceId: device.id,
                sceneId: source.id,
                elementId: input.elementId,
                cueId: plan.cue.id,
                actionId: navigation.kind === "invalid" ? navigation.actionId : undefined,
                publishedGraphVersion: graph.version,
              });
            }
            const updates = await executeSharedCueUpdates(
              tx,
              run.id,
              graph,
              canvas,
              source.id,
              input.eventId,
              plan,
            );
            if (updates.kind === "failed") {
              const result: PlayerEventResult = {
                kind: "failed",
                eventId: input.eventId,
                actionId: updates.actionId,
                reason: updates.reason,
              };
              await recordEvent(tx, run.id, device.showId, device.id, input, result);
              return result;
            }
            if (updates.changed) {
              invalidationScope = { showId: device.showId, deviceId: device.id };
              await enqueuePlayerInvalidations(tx, device.showId);
            }
            const result: PlayerEventResult = { kind: "accepted", eventId: input.eventId };
            await recordEvent(tx, run.id, device.showId, device.id, input, result);
            return result;
          }
          if (source?.kind !== "flow") {
            const result: PlayerEventResult = {
              kind: "ignored",
              eventId: input.eventId,
              reason: "no-navigation-state",
            };
            await recordEvent(tx, run.id, device.showId, device.id, input, result);
            return result;
          }
          throw new RunConfigurationError({
            showId: device.showId,
            runId: run.id,
            category: "missingNavigationState",
            deviceId: device.id,
            publishedGraphVersion: graph.version,
          });
        }
        if (!validSlotInstancePath(input.slotInstancePath)) {
          const result: PlayerEventResult = {
            kind: "ignored",
            eventId: input.eventId,
            reason: "invalid-slot-path",
          };
          await recordEvent(tx, run.id, device.showId, device.id, input, result);
          return result;
        }

        if (state.activeSceneId === null) {
          const result: PlayerEventResult = {
            kind: "ignored",
            eventId: input.eventId,
            reason: "not-ready",
          };
          await recordEvent(tx, run.id, device.showId, device.id, input, result);
          return result;
        }
        if (input.sceneId !== state.activeSceneId) {
          const result: PlayerEventResult = {
            kind: "ignored",
            eventId: input.eventId,
            reason: "stale-scene",
          };
          await recordEvent(tx, run.id, device.showId, device.id, input, result);
          return result;
        }

        const graph = await readShowGraph(device.showId, "published", tx);
        const canvas = await readCanvas(
          device.showId,
          "published",
          { sceneNodeId: state.activeSceneId },
          tx,
        );
        if (!canvas) {
          throw new RunConfigurationError({
            showId: device.showId,
            runId: run.id,
            category: "missingSceneCanvas",
            deviceId: device.id,
            sceneId: state.activeSceneId,
            publishedGraphVersion: graph.version,
          });
        }
        const observation = observationFor(input, state.activeSceneId, canvas.id);
        if (!observation) {
          const result: PlayerEventResult = {
            kind: "rejected",
            eventId: input.eventId,
            reason: "invalid-event",
          };
          await recordEvent(tx, run.id, device.showId, device.id, input, result);
          return result;
        }
        let plan: RuntimeEventPlan;
        try {
          plan = resolveRuntimeEvent(graph, observation);
        } catch (error) {
          // Same corruption the per-connection path translates above: a
          // dangling Binding or a Cue naming a missing Action is the operator's
          // to repair, so it belongs in the log rather than in a masked 500.
          if (error instanceof InvalidInteractionError) {
            throw new RunConfigurationError({
              showId: device.showId,
              runId: run.id,
              category: "invalidInteractions",
              deviceId: device.id,
              sceneId: state.activeSceneId,
              elementId: input.elementId,
              publishedGraphVersion: graph.version,
            });
          }
          throw error;
        }
        if (plan.kind === "unbound") {
          const result: PlayerEventResult = {
            kind: "ignored",
            eventId: input.eventId,
            reason: plan.reason === "stale-scene" ? "stale-scene" : "unbound-event",
          };
          await recordEvent(tx, run.id, device.showId, device.id, input, result);
          return result;
        }
        const navigation = resolveCueNavigation(graph, plan.cue.id, plan.actions, state.flowId);
        if (plan.actions.length === 0 || navigation.kind === "invalid") {
          throw new RunConfigurationError({
            showId: device.showId,
            runId: run.id,
            category: "invalidNavigateAction",
            deviceId: device.id,
            sceneId: state.activeSceneId,
            elementId: input.elementId,
            cueId: plan.cue.id,
            actionId: navigation.kind === "invalid" ? navigation.actionId : undefined,
            publishedGraphVersion: graph.version,
          });
        }
        const updates = await executeSharedCueUpdates(
          tx,
          run.id,
          graph,
          canvas,
          state.activeSceneId,
          input.eventId,
          plan,
        );
        if (updates.kind === "failed") {
          const result: PlayerEventResult = {
            kind: "failed",
            eventId: input.eventId,
            actionId: updates.actionId,
            reason: updates.reason,
          };
          await recordEvent(tx, run.id, device.showId, device.id, input, result);
          return result;
        }
        const { targetSceneId } = navigation;
        const sceneChanged = targetSceneId !== null && targetSceneId !== state.activeSceneId;
        if (sceneChanged) {
          await tx
            .update(runDeviceStates)
            .set({ activeSceneId: targetSceneId, updatedAt: new Date() })
            .where(and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, device.id)));
        }
        // One enqueue per Cue, so `stateSequence` advances once however many
        // Actions it ran. A Show write reaches every Device; a Scene change
        // alone reaches only this one.
        if (updates.changed) {
          await enqueuePlayerInvalidations(tx, device.showId);
        } else if (sceneChanged) {
          await enqueuePlayerInvalidations(tx, device.showId, [device.id]);
        }
        if (updates.changed || sceneChanged) {
          invalidationScope = { showId: device.showId, deviceId: device.id };
        }
        const result: PlayerEventResult =
          targetSceneId === null
            ? { kind: "accepted", eventId: input.eventId }
            : {
                kind: "applied",
                eventId: input.eventId,
                resultingSceneId: targetSceneId,
                changed: sceneChanged || updates.changed,
              };
        await recordEvent(tx, run.id, device.showId, device.id, input, result);
        return result;
      })
      .then(async (result) => {
        if ((result?.kind === "applied" || result?.kind === "accepted") && invalidationScope) {
          try {
            await drainPlayerInvalidations(invalidationScope);
          } catch {
            // The worker retries the committed outbox row if the provider is down.
          }
        }
        return result;
      }),
  );
}
