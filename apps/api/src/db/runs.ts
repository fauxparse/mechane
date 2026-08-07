import { runChannel } from "@mechane/realtime";
import type { Run, RunStatus, SourceValues } from "@mechane/domain";
import { defaultSourceValues } from "@mechane/domain";
import { and, desc, eq } from "drizzle-orm";

import { db } from "./client";
import { realtimeProvider } from "../realtime";
import { readShowGraph } from "./show-graph";
import { runs, shows } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;
type RunRow = typeof runs.$inferSelect;

function toRun(row: RunRow): Run {
  return {
    id: row.id as Run["id"],
    showId: row.showId as Run["showId"],
    status: row.status as RunStatus,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    sourceValues: row.sourceValues as SourceValues,
  };
}

export async function readActiveRun(showId: string, executor: Executor = db): Promise<Run | null> {
  const [row] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1);
  return row ? toRun(row) : null;
}

/** Starts a Run atomically, ending the previous active Run first. */
export async function startRun(showId: string): Promise<Run> {
  const run = await db.transaction(async (tx) => {
    // Serialise starts for this Show. Without the lock, two technicians could
    // both end up believing they created the sole active Run.
    await tx.select({ id: shows.id }).from(shows).where(eq(shows.id, showId)).for("update");
    const graph = await readShowGraph(showId, "published", tx);
    const now = new Date();
    await tx
      .update(runs)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(and(eq(runs.showId, showId), eq(runs.status, "active")));
    const [row] = await tx
      .insert(runs)
      .values({
        showId,
        status: "active",
        startedAt: now,
        sourceValues: defaultSourceValues(graph),
      })
      .returning();
    if (!row) throw new Error(`Failed to start a Run for Show "${showId}".`);
    return toRun(row);
  });
  await realtimeProvider.channel(runChannel(run.id)).publish("run.started", run);
  return run;
}

/** Ends the active Run, if there is one, and returns the ended Run. */
export async function endRun(showId: string): Promise<Run | null> {
  const run = await db.transaction(async (tx) => {
    await tx.select({ id: shows.id }).from(shows).where(eq(shows.id, showId)).for("update");
    const now = new Date();
    const [row] = await tx
      .update(runs)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
      .returning();
    return row ? toRun(row) : null;
  });
  if (run) await realtimeProvider.channel(runChannel(run.id)).publish("run.ended", run);
  return run;
}
