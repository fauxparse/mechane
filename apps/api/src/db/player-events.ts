import type { EventBinding, ShowGraph } from "@mechane/domain";
import { and, desc, eq, isNull } from "drizzle-orm";

import { readCanvas } from "./canvas";
import { db } from "./client";
import { drainPlayerInvalidations, enqueuePlayerInvalidation } from "./player-invalidation-outbox";
import { readShowGraph } from "./show-graph";
import { devices, playerEvents, runDeviceStates, runs } from "./schema";

const PAIRING_CODE_PATTERN = /^[A-HJ-KM-NP-Z1-9]{5}$/;
const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface PlayerEventInput {
  eventId: string;
  sceneId: string;
  elementId: string;
  eventKind: string;
}

export type PlayerEventIgnoreReason =
  | "no-active-run"
  | "unsupported-device"
  | "no-navigation-state"
  | "not-ready"
  | "stale-scene"
  | "unbound-event";

export type PlayerEventResult =
  | { kind: "applied"; eventId: string; resultingSceneId: string }
  | {
      kind: "duplicate";
      eventId: string;
      outcome: "applied" | "ignored";
      resultingSceneId: string | null;
      reason: string | null;
    }
  | { kind: "ignored"; eventId: string; reason: PlayerEventIgnoreReason };

export class PlayerEventInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerEventInputError";
  }
}

export class PlayerDispatchConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerDispatchConfigurationError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PlayerEventRow = typeof playerEvents.$inferSelect;

function duplicateResult(row: PlayerEventRow): PlayerEventResult {
  if (row.outcome === "applied") {
    if (!row.resultingSceneId) {
      throw new PlayerDispatchConfigurationError(
        `Applied Player Event "${row.eventId}" has no resulting Scene.`,
      );
    }
    return {
      kind: "duplicate",
      eventId: row.eventId,
      outcome: "applied",
      resultingSceneId: row.resultingSceneId,
      reason: null,
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

function bindingFor(
  graph: ShowGraph,
  canvasId: string,
  input: PlayerEventInput,
): EventBinding | null {
  return (
    (graph.eventBindings ?? []).find(
      (binding) =>
        binding.canvasId === canvasId &&
        binding.elementId === input.elementId &&
        binding.eventKind === input.eventKind,
    ) ?? null
  );
}

async function recordEvent(
  tx: Tx,
  runId: string,
  showId: string,
  deviceId: string,
  input: PlayerEventInput,
  result: PlayerEventResult,
): Promise<void> {
  const outcome = result.kind === "applied" ? "applied" : "ignored";
  await tx.insert(playerEvents).values({
    runId,
    showId,
    deviceId,
    eventId: input.eventId,
    observedSceneId: input.sceneId,
    elementId: input.elementId,
    eventKind: input.eventKind,
    outcome,
    reason: result.kind === "ignored" ? result.reason : null,
    resultingSceneId:
      result.kind === "applied"
        ? result.resultingSceneId
        : result.kind === "duplicate"
          ? result.resultingSceneId
          : null,
  });
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

  return db
    .transaction(async (tx): Promise<PlayerEventResult | null> => {
      const [device] = await tx
        .select()
        .from(devices)
        .where(and(eq(devices.pairingCode, normalizedCode), isNull(devices.retiredAt)));
      if (!device) return null;

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
        throw new PlayerDispatchConfigurationError(
          `Run "${run.id}" has no navigation state for Device "${device.id}".`,
        );
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
        throw new PlayerDispatchConfigurationError(
          `Published Scene "${state.activeSceneId}" has no Canvas.`,
        );
      }
      const binding = bindingFor(graph, canvas.id, input);
      if (!binding) {
        const result: PlayerEventResult = {
          kind: "ignored",
          eventId: input.eventId,
          reason: "unbound-event",
        };
        await recordEvent(tx, run.id, device.showId, device.id, input, result);
        return result;
      }
      const cue = (graph.cues ?? []).find((candidate) => candidate.id === binding.cueId);
      const actionId = cue?.actionIds.length === 1 ? cue.actionIds[0] : undefined;
      const action = actionId
        ? (graph.actions ?? []).find((candidate) => candidate.id === actionId)
        : undefined;
      const target =
        action?.kind === "navigate"
          ? graph.nodes.find((node) => node.id === action.targetSceneId)
          : undefined;
      if (
        !cue ||
        cue.sceneId !== state.activeSceneId ||
        !action ||
        action.cueId !== cue.id ||
        !target ||
        target.kind !== "scene" ||
        target.parentId !== state.flowId
      ) {
        throw new PlayerDispatchConfigurationError(
          `Event Binding "${binding.id}" does not resolve to a valid Navigate Action.`,
        );
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
    });
}
