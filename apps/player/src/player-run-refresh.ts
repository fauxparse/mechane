// How a Player keeps its session current without reading all of it again
// (#881).
//
// An invalidation almost always means only the Run's values moved, so the
// Player reads those alone and keeps the graph, Canvases and image assets it
// already has. The server's `sessionKey` says when that is no longer enough:
// it changes with the Run, the published graph, a Shared Device's Scene and
// the Devices the graph shows, and a Player whose key no longer matches reads
// its whole session again.
import type { RealtimeMessage } from "@mechane/realtime";
import type { SourceValues, StructuredValues } from "@mechane/domain/structured-values";
import type { PlayerSession } from "./api";

/**
 * The part of a session that changes when Show state does: what the
 * `playerRunState` query returns. Not the Instance state `player-state.ts`
 * calls `PlayerRunState`, which this never touches.
 */
export interface PlayerRunSnapshot {
  readonly sessionKey: string;
  readonly stateSequence: number;
  readonly sourceValues: SourceValues;
  readonly structuredValues: StructuredValues;
}

export type PlayerRunSnapshotMerge =
  | { readonly kind: "stale" }
  | { readonly kind: "updated"; readonly session: PlayerSession }
  | { readonly kind: "session-changed" };

/**
 * What a run-state read means for the session a Player holds.
 *
 * Reads resolve out of order, so one at a lower `stateSequence` than the
 * session's changes nothing. One at the same sequence still applies when its
 * values differ, because not every Show write advances the sequence yet
 * (#882). A null read means no Run is active (or the pairing code has gone):
 * nothing new for a session already waiting for one, and a reason to read the
 * whole session for one that had a Run.
 */
export function mergePlayerRunSnapshot(
  session: PlayerSession,
  runState: PlayerRunSnapshot | null,
): PlayerRunSnapshotMerge {
  const run = session.run;
  if (!run && !runState) return { kind: "stale" };
  if (runState && run && runState.stateSequence < run.stateSequence) return { kind: "stale" };
  if (!runState || !run || runState.sessionKey !== session.sessionKey) {
    return { kind: "session-changed" };
  }
  if (
    runState.stateSequence === run.stateSequence &&
    JSON.stringify(run.sourceValues) === JSON.stringify(runState.sourceValues) &&
    JSON.stringify(run.structuredValues) === JSON.stringify(runState.structuredValues)
  ) {
    return { kind: "stale" };
  }
  return {
    kind: "updated",
    session: {
      ...session,
      run: {
        ...run,
        stateSequence: runState.stateSequence,
        sourceValues: runState.sourceValues,
        structuredValues: runState.structuredValues,
      },
    },
  };
}

/**
 * Whether a whole-session read predates the session already held, which a
 * slow read overtaken by a newer one does. The sequence is per Show, so it
 * orders reads across Runs too.
 */
export function predatesPlayerSession(held: PlayerSession | null, read: PlayerSession): boolean {
  return Boolean(held?.run && read.run && read.run.stateSequence < held.run.stateSequence);
}

/**
 * Whether an invalidation names state the session already holds: the
 * echo of a change a Player has already read, which needs no read of its own.
 */
export function holdsInvalidatedState(
  session: PlayerSession | null,
  message: RealtimeMessage,
): boolean {
  const payload = message.payload;
  const sequence =
    typeof payload === "object" && payload !== null && "stateSequence" in payload
      ? payload.stateSequence
      : undefined;
  const held = session?.run?.stateSequence;
  return typeof sequence === "number" && held !== undefined && sequence <= held;
}

/**
 * How long before it expires a held grant stops being worth presenting: a
 * grant checked on arrival must not lapse on the way there.
 */
const GRANT_EXPIRY_MARGIN_MS = 10_000;

/**
 * The grant a session already carries, if it will still be good when the
 * server checks it. A subscriber asks for a grant on every (re)connection, and
 * a grant that came with the session just read needs no request of its own.
 */
export function usableRealtimeGrant(
  realtime: PlayerSession["realtime"] | null,
  now: number,
): string | null {
  return realtime && Date.parse(realtime.expiresAt) - now > GRANT_EXPIRY_MARGIN_MS
    ? realtime.grant
    : null;
}

/**
 * Runs `task` one at a time. Calls while it runs collapse into one more run
 * after it, so a burst of invalidations costs at most two reads.
 */
export function coalesced(task: () => Promise<void>): () => void {
  let running = false;
  let again = false;
  const run = async () => {
    running = true;
    try {
      do {
        again = false;
        await task();
      } while (again);
    } finally {
      running = false;
    }
  };
  return () => {
    if (running) {
      again = true;
      return;
    }
    void run().catch(() => undefined);
  };
}
