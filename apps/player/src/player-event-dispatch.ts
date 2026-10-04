import type { ShowGraph } from "@mechane/domain/graph";
import { resolveRuntimeEvent, type RuntimeEventObservation } from "@mechane/domain/interactions";
import type { RunState } from "@mechane/domain/structured-values";
import type { PlayerEventInput, PlayerEventResult, PlayerEventSubmitter } from "./api";
import { predictSharedCue, type PendingShowEvent, type ShowWriteOutcome } from "./player-state";

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
 *
 * A Cue that writes shows its writes at once (#887): `onPending` receives
 * them, predicted from `state`, before the request goes, and `onSettled`
 * what the server's answer means for them. Retries keep the Event id, as a
 * per-connection Player's do, so a lost acknowledgement counts once.
 */
export function dispatchSharedPlayerEvent({
  graph,
  canvas,
  blocks,
  state,
  observation,
  publishedGraphVersion,
  submitEvent,
  onPending,
  onSettled,
  retry,
}: {
  graph: ShowGraph;
  canvas: Parameters<typeof predictSharedCue>[0]["canvas"];
  blocks: Parameters<typeof predictSharedCue>[0]["blocks"];
  /** The Run as this Player displays it, its pending Events included. */
  state: RunState;
  observation: RuntimeEventObservation;
  publishedGraphVersion: number;
  submitEvent: PlayerEventSubmitter;
  onPending: (event: PendingShowEvent) => void;
  onSettled: (eventId: string, outcome: ShowWriteOutcome) => void;
  retry?: Parameters<typeof submitPlayerEventWithRetry>[2];
}): boolean {
  const input = playerEventInput(observation, publishedGraphVersion);
  let prediction: PendingShowEvent | null;
  try {
    const plan = resolvePlayerEvent(graph, observation);
    if (plan.kind === "unbound") return false;
    prediction = predictSharedCue({ graph, canvas, blocks, state, plan, eventId: input.eventId });
  } catch {
    prediction = null;
  }
  if (!prediction) {
    void submitEvent(input).catch(() => undefined);
    return true;
  }
  onPending(prediction);
  void submitPlayerEventWithRetry(submitEvent, input, retry).then(
    (result) => onSettled(input.eventId, showWriteOutcome(result)),
    () => onSettled(input.eventId, { kind: "rolled-back" }),
  );
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
