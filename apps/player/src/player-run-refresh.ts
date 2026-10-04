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

/** The `stateSequence` an invalidation names, if it names one. */
export function invalidatedStateSequence(message: RealtimeMessage): number | undefined {
  const payload = message.payload;
  const sequence =
    typeof payload === "object" && payload !== null && "stateSequence" in payload
      ? payload.stateSequence
      : undefined;
  return typeof sequence === "number" ? sequence : undefined;
}

/**
 * Runs `read` (coalesced) for a change named by its `stateSequence`, unless
 * the session already holds that sequence or a read that started after the
 * change committed will bring it. A change with no sequence always reads.
 *
 * A Player's own write reaches it twice, as its Event result and as the
 * realtime echo, in either order (#885); whichever comes second finds the
 * first one's read in flight or done, so the write costs one read.
 */
export function sequencedReads(
  read: () => Promise<void>,
  heldSequence: () => number | undefined,
): (stateSequence?: number) => void {
  // The newest sequence a change has asked to be read.
  let requested = -1;
  // The newest sequence a started read is sure to reflect: every change that
  // asked before it started had committed by then.
  let covered = -1;
  const run = coalesced(async () => {
    covered = Math.max(covered, requested);
    await read();
  });
  return (stateSequence) => {
    if (stateSequence !== undefined) {
      const held = heldSequence();
      if ((held !== undefined && stateSequence <= held) || stateSequence <= covered) return;
      requested = Math.max(requested, stateSequence);
    }
    run();
  };
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
