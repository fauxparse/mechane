// Reading and writing the Run error log (#459). The category set, the record
// shape, and the prose each category renders all live in @mechane/domain's
// `run-errors` module; this is the storage and capture side.
import type { RunError, RunErrorCategory, RunErrorDetail } from "@mechane/domain";
import { describeRunError } from "@mechane/domain";
import { and, desc, eq } from "drizzle-orm";

import { db } from "./client";
import { withUniqueId } from "./ids";
import { runErrors } from "./schema";

/** Where a failure happened, which the failing site knows and the detail doesn't. */
export interface RunErrorScope {
  readonly showId: string;
  /** The Run underway, or `null` when the failure preceded one. */
  readonly runId: string | null;
}

export type RunErrorEntry = RunErrorScope & RunErrorDetail;

/**
 * A persisted configuration that cannot be executed for a live Show — a Scene
 * with no Canvas, a Device belonging to no Flow, a Cue leading nowhere.
 *
 * The structured entry is the primary payload and the message is rendered from
 * it, so the exception a developer reads and the log line an operator reads
 * cannot drift apart. Callers translate this into whatever their boundary
 * shows a Player, which is deliberately much less than this carries.
 */
export class RunConfigurationError extends Error {
  constructor(readonly entry: RunErrorEntry) {
    super(describeRunError(entry));
    this.name = "RunConfigurationError";
  }
}

const MAX_ENTRIES = 500;
const DEFAULT_ENTRIES = 100;

function toRunError(row: typeof runErrors.$inferSelect): RunError {
  return {
    id: row.id as RunError["id"],
    showId: row.showId as RunError["showId"],
    runId: row.runId as RunError["runId"],
    category: row.category as RunErrorCategory,
    deviceId: row.deviceId ?? undefined,
    sceneId: row.sceneId ?? undefined,
    elementId: row.elementId ?? undefined,
    cueId: row.cueId ?? undefined,
    actionId: row.actionId ?? undefined,
    eventId: row.eventId ?? undefined,
    publishedGraphVersion: row.publishedGraphVersion ?? undefined,
    occurredAt: row.occurredAt,
  };
}

/**
 * Records one entry on its own connection.
 *
 * Deliberately never joins a caller's transaction. Every failure this log
 * exists to capture aborts the transaction that discovered it — dispatch reads
 * the graph, finds it contradictory, and rolls back — so an entry written
 * inside that transaction would vanish along with the evidence.
 */
export async function recordRunError(entry: RunErrorEntry): Promise<RunError> {
  const [row] = await withUniqueId("runError", (id) =>
    db
      .insert(runErrors)
      .values({
        id,
        showId: entry.showId,
        runId: entry.runId,
        category: entry.category,
        deviceId: entry.deviceId ?? null,
        sceneId: entry.sceneId ?? null,
        elementId: entry.elementId ?? null,
        cueId: entry.cueId ?? null,
        actionId: entry.actionId ?? null,
        eventId: entry.eventId ?? null,
        publishedGraphVersion: entry.publishedGraphVersion ?? null,
      })
      .returning(),
  );
  if (!row) throw new Error(`Failed to record a Run error for Show "${entry.showId}".`);
  return toRunError(row);
}

/**
 * Runs `work`, recording any `RunConfigurationError` it throws before letting
 * it propagate unchanged.
 *
 * A failed write is swallowed rather than raised: the log is an account of the
 * dispatch failure, and replacing that failure with "couldn't write it down"
 * would lose the thing the caller actually has to handle.
 */
export async function withRunErrorLog<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RunConfigurationError) {
      await recordRunError(error.entry).catch(() => undefined);
    }
    throw error;
  }
}

export interface RunErrorFilter {
  /** Entries for one Run only; omit for every entry the Show has recorded. */
  readonly runId?: string;
  readonly category?: RunErrorCategory;
  readonly limit?: number;
}

/** A Show's log, newest first. */
export async function listRunErrors(
  showId: string,
  filter: RunErrorFilter = {},
): Promise<RunError[]> {
  const conditions = [eq(runErrors.showId, showId)];
  if (filter.runId !== undefined) conditions.push(eq(runErrors.runId, filter.runId));
  if (filter.category !== undefined) conditions.push(eq(runErrors.category, filter.category));
  const rows = await db
    .select()
    .from(runErrors)
    .where(and(...conditions))
    .orderBy(desc(runErrors.occurredAt), desc(runErrors.id))
    .limit(Math.min(Math.max(filter.limit ?? DEFAULT_ENTRIES, 1), MAX_ENTRIES));
  return rows.map(toRunError);
}
