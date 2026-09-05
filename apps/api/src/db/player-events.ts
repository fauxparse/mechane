import {
  InvalidInteractionError,
  resolveRuntimeEvent,
  type BlockInstancePathSegment,
  type RuntimeEventObservation,
  type RuntimeEventPlan,
} from "@mechane/domain";
import { and, desc, eq, isNull } from "drizzle-orm";

import { readCanvas } from "./canvas";
import { db } from "./client";
import { drainPlayerInvalidations, enqueuePlayerInvalidation } from "./player-invalidation-outbox";
import { RunConfigurationError, withRunErrorLog } from "./run-errors";
import { readShowGraph } from "./show-graph";
import { devices, playerEvents, runDeviceStates, runs } from "./schema";

const PAIRING_CODE_PATTERN = /^[A-HJ-KM-NP-Z1-9]{5}$/;
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
  const base = { sceneId, canvasId, elementId: input.elementId };
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
  | { kind: "applied"; eventId: string; resultingSceneId: string }
  | {
      kind: "duplicate";
      eventId: string;
      outcome: "applied" | "ignored" | "accepted" | "rejected";
      resultingSceneId: string | null;
      reason: string | null;
    }
  | { kind: "ignored"; eventId: string; reason: PlayerEventIgnoreReason }
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
      resultingSceneId: row.resultingSceneId,
      reason: null,
    };
  }
  if (row.outcome === "accepted" || row.outcome === "rejected") {
    return {
      kind: "duplicate",
      eventId: row.eventId,
      outcome: row.outcome,
      resultingSceneId: row.resultingSceneId,
      reason: row.reason,
    };
  }
  return {
    kind: "duplicate",
    eventId: row.eventId,
    outcome: "ignored",
    resultingSceneId: row.resultingSceneId,
    reason: row.reason,
  };
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
    reason: result.kind === "ignored" || result.kind === "rejected" ? result.reason : null,
    resultingSceneId:
      result.kind === "applied"
        ? result.resultingSceneId
        : result.kind === "accepted"
          ? (resultingSceneId ?? null)
          : null,
  });
}

type DeviceRow = typeof devices.$inferSelect;

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
    .limit(1);
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
  const action = plan.actions[0];
  const target =
    action?.kind === "navigate"
      ? graph.nodes.find((node) => node.id === action.targetSceneId)
      : undefined;
  if (
    !action ||
    action.kind !== "navigate" ||
    action.cueId !== plan.cue.id ||
    !target ||
    target.kind !== "scene" ||
    target.parentId !== flow.id
  ) {
    throw new RunConfigurationError({
      showId: device.showId,
      runId: run.id,
      category: "invalidNavigateAction",
      deviceId: device.id,
      sceneId: observedScene.id,
      elementId: input.elementId,
      cueId: plan.cue.id,
      actionId: action?.id,
      publishedGraphVersion: graph.version,
    });
  }
  const result: PlayerEventResult = { kind: "accepted", eventId: input.eventId };
  await recordEvent(tx, run.id, device.showId, device.id, input, result, target.id);
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
          .limit(1);
        if (!run) return { kind: "ignored", eventId: input.eventId, reason: "no-active-run" };
        if (device.perConnection) {
          return { kind: "ignored", eventId: input.eventId, reason: "unsupported-device" };
        }

        const [state] = await tx
          .select()
          .from(runDeviceStates)
          .where(and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, device.id)))
          .for("update");
        if (!state) {
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
          const graph = await readShowGraph(device.showId, "published", tx);
          const driver = graph.edges.find(
            (edge) => edge.kind === "device" && edge.targetId === device.id,
          );
          const source = driver ? graph.nodes.find((node) => node.id === driver.sourceId) : null;
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
        const action = plan.actions[0];
        const target =
          action?.kind === "navigate"
            ? graph.nodes.find((node) => node.id === action.targetSceneId)
            : undefined;
        if (
          !action ||
          action.kind !== "navigate" ||
          action.cueId !== plan.cue.id ||
          !target ||
          target.kind !== "scene" ||
          target.parentId !== state.flowId
        ) {
          throw new RunConfigurationError({
            showId: device.showId,
            runId: run.id,
            category: "invalidNavigateAction",
            deviceId: device.id,
            sceneId: state.activeSceneId,
            elementId: input.elementId,
            cueId: plan.cue.id,
            actionId: action?.id,
            publishedGraphVersion: graph.version,
          });
        }

        const result: PlayerEventResult = {
          kind: "applied",
          eventId: input.eventId,
          resultingSceneId: target.id,
        };
        if (target.id !== state.activeSceneId) {
          invalidationScope = { showId: device.showId, deviceId: device.id };
          await tx
            .update(runDeviceStates)
            .set({ activeSceneId: target.id, updatedAt: new Date() })
            .where(and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, device.id)));
          await enqueuePlayerInvalidation(tx, device.showId, device.id);
        }
        await recordEvent(tx, run.id, device.showId, device.id, input, result);
        return result;
      })
      .then(async (result) => {
        if (result?.kind === "applied" && invalidationScope) {
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
