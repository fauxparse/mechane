import { runChannel } from "@mechane/realtime";
import type { Run, RunStatus, ShowGraph, SourceValues } from "@mechane/domain";
import { coerceShapeValue, defaultSourceValues } from "@mechane/domain";
import { and, desc, eq } from "drizzle-orm";

import { db } from "./client";
import { realtimeProvider } from "../realtime";
import { readShowGraph } from "./show-graph";
import { runs, shows } from "./schema";

export interface RunValueLoss {
  sourceId: string;
  fieldId: string;
  fieldName: string;
  path: string[];
  reason: string;
}

export interface ReconciledRunValues {
  runId?: string;
  sourceValues: SourceValues;
  losses: RunValueLoss[];
}

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

/**
 * Reconciles an active Run's Source values against a newly published graph.
 * The caller supplies its transaction so this update commits with publish.
 */
export async function reconcileActiveRunValues(
  showId: string,
  oldGraph: ShowGraph,
  newGraph: ShowGraph,
  executor: Executor = db,
): Promise<ReconciledRunValues> {
  const [run] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1)
    .for("update");
  if (!run) return { sourceValues: {}, losses: [] };

  const oldSources = new Map(
    oldGraph.nodes.filter((node) => node.kind === "source").map((node) => [node.id, node]),
  );
  const newSources = newGraph.nodes.filter((node) => node.kind === "source");
  const liveValues = run.sourceValues as SourceValues;
  const defaults = defaultSourceValues(newGraph);
  const sourceValues: SourceValues = {};
  const losses: RunValueLoss[] = [];

  for (const source of newSources) {
    const previous = oldSources.get(source.id);
    const previousType = previous?.type;
    const nextType = source.type;
    const current = liveValues[source.id];
    if (
      !previous ||
      typeof previousType !== "object" ||
      previousType.kind !== "shape" ||
      typeof nextType !== "object" ||
      nextType.kind !== "shape"
    ) {
      sourceValues[source.id] = current === undefined ? defaults[source.id] : current;
      continue;
    }

    const oldShape = oldGraph.shapes?.find((shape) => shape.id === previousType.shapeId);
    const newShape = newGraph.shapes?.find((shape) => shape.id === nextType.shapeId);
    if (!oldShape || !newShape) {
      sourceValues[source.id] = defaults[source.id];
      continue;
    }

    const overrides = Object.fromEntries(
      (source.fieldDefaults ?? [])
        .filter((override) => override.fieldPath.length === 1)
        .map((override) => [override.fieldPath[0], override.value]),
    );
    const result = coerceShapeValue(
      current,
      oldShape,
      newShape,
      [...(oldGraph.shapes ?? []), ...(newGraph.shapes ?? [])],
      overrides,
    );
    sourceValues[source.id] = result.value;
    losses.push(
      ...result.losses.map((loss) => ({
        sourceId: source.id,
        fieldId: loss.fieldId,
        fieldName: loss.fieldName,
        path: loss.path,
        reason: loss.reason,
      })),
    );
  }

  await executor
    .update(runs)
    .set({ sourceValues, updatedAt: new Date() })
    .where(eq(runs.id, run.id));
  return { runId: run.id, sourceValues, losses };
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
