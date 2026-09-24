import {
  resolveRuntimeEvent,
  type RuntimeEventObservation,
} from "@mechane/domain";
import type { PlayerEventInput, PlayerEventResult, PlayerEventSubmitter } from "./api";

export function resolvePlayerEvent(
  graph: Parameters<typeof resolveRuntimeEvent>[0],
  observation: RuntimeEventObservation,
) {
  return resolveRuntimeEvent(graph, observation);
}

export function playerEventInput(
  observation: RuntimeEventObservation,
  publishedGraphVersion: number,
): PlayerEventInput {
  return {
    eventId: crypto.randomUUID(),
    publishedGraphVersion,
    sceneId: observation.sceneId,
    elementId: observation.elementId,
    slotInstancePath: observation.slotInstancePath ?? [],
    ...(observation.eventKind === "keypress"
      ? { eventKind: "keypress" as const, params: observation.params }
      : { eventKind: "tap" as const }),
  };
}

/**
 * Resolve and submit a Shared Device event. Unbound observations stay local;
 * resolver failures submit so the server's Run Error policy records them.
 */
export function dispatchSharedPlayerEvent({
  graph,
  observation,
  publishedGraphVersion,
  submitEvent,
}: {
  graph: Parameters<typeof resolveRuntimeEvent>[0];
  observation: RuntimeEventObservation;
  publishedGraphVersion: number;
  submitEvent: PlayerEventSubmitter;
}): boolean {
  try {
    if (resolvePlayerEvent(graph, observation).kind === "unbound") return false;
  } catch {
    void submitEvent(playerEventInput(observation, publishedGraphVersion)).catch(() => undefined);
    return true;
  }
  void submitEvent(playerEventInput(observation, publishedGraphVersion)).catch(() => undefined);
  return true;
}

export type PlayerEventDispatchResult = PlayerEventResult;
