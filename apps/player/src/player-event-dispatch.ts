import { resolveRuntimeEvent, type RuntimeEventObservation } from "@mechane/domain/interactions";
import type { PlayerEventInput, PlayerEventResult, PlayerEventSubmitter } from "./api";
import type { ShowWriteOutcome } from "./player-state";

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

/** How long a per-connection Player waits before each retry of a Show write. */
export const SHOW_WRITE_RETRY_DELAYS_MS: readonly number[] = [500, 1_000, 2_000, 4_000];

/**
 * Submits an Event, retrying a request that got no answer with the same
 * Event id (#628). The server records an Event once, so a retry after a lost
 * acknowledgement reports a duplicate instead of writing twice (#642).
 * Rejects only once every retry has failed too.
 */
export async function submitPlayerEventWithRetry(
  submitEvent: PlayerEventSubmitter,
  input: PlayerEventInput,
  {
    delays = SHOW_WRITE_RETRY_DELAYS_MS,
    // Executor form: this package's lib does not declare `Promise.withResolvers`.
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: { delays?: readonly number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<PlayerEventResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await submitEvent(input);
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined) throw error;
      await wait(delay);
    }
  }
}

/** What an Event result means for the Show write this Player predicted (#886). */
export function showWriteOutcome(result: PlayerEventResult): ShowWriteOutcome {
  switch (result.kind) {
    case "applied":
    case "accepted":
      return { kind: "acknowledged", stateSequence: result.stateSequence };
    case "failed":
    case "rejected":
      return { kind: "rolled-back" };
    case "ignored":
      return { kind: "dropped" };
    case "duplicate":
      if (result.outcome === "failed" || result.outcome === "rejected") {
        return { kind: "rolled-back" };
      }
      // An Event recorded before #885 has no sequence to wait for, so its
      // prediction goes and the snapshots carry its effect.
      return (result.outcome === "applied" || result.outcome === "accepted") &&
        result.stateSequence !== null
        ? { kind: "acknowledged", stateSequence: result.stateSequence }
        : { kind: "dropped" };
  }
}
