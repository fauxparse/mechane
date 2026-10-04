import type { ShowGraph } from "@mechane/domain/graph";
import { and, eq } from "drizzle-orm";

import { db } from "./client";
import { runDeviceTransformerSeeds, runTransformerSeeds } from "./schema";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function shuffleTransformerIds(graph: ShowGraph, parent: "show" | "instance"): string[] {
  return graph.nodes.flatMap((node) =>
    node.kind === "transformer" &&
    node.transform.kind === "shuffle" &&
    (parent === "show" ? node.parentId === null : node.parentId !== null)
      ? [node.id]
      : [],
  );
}

async function showSeeds(executor: Executor, runId: string, transformerIds: readonly string[]) {
  await executor
    .insert(runTransformerSeeds)
    .values(
      transformerIds.map((transformerId) => ({ runId, transformerId, seed: crypto.randomUUID() })),
    )
    .onConflictDoNothing();
  return executor.select().from(runTransformerSeeds).where(eq(runTransformerSeeds.runId, runId));
}

async function deviceSeeds(
  executor: Executor,
  runId: string,
  deviceId: string,
  transformerIds: readonly string[],
) {
  await executor
    .insert(runDeviceTransformerSeeds)
    .values(
      transformerIds.map((transformerId) => ({
        runId,
        deviceId,
        transformerId,
        seed: crypto.randomUUID(),
      })),
    )
    .onConflictDoNothing();
  return executor
    .select()
    .from(runDeviceTransformerSeeds)
    .where(
      and(
        eq(runDeviceTransformerSeeds.runId, runId),
        eq(runDeviceTransformerSeeds.deviceId, deviceId),
      ),
    );
}

/**
 * Reuses scope-owned seeds across snapshots and compatible publications. A
 * Player's snapshot and the Events it submits read the same seeds, so both
 * shuffle a list into the same order (#887).
 */
export async function readOrCreateTransformerSeeds(
  runId: string,
  deviceId: string,
  graph: ShowGraph,
  includeSharedInstance: boolean,
  executor: Executor = db,
): Promise<Readonly<Record<string, string>>> {
  const showIds = shuffleTransformerIds(graph, "show");
  const instanceIds = includeSharedInstance ? shuffleTransformerIds(graph, "instance") : [];
  // One after the other: a transaction is one connection, and runs one query at a time.
  const showRows = showIds.length > 0 ? await showSeeds(executor, runId, showIds) : [];
  const deviceRows =
    instanceIds.length > 0 ? await deviceSeeds(executor, runId, deviceId, instanceIds) : [];
  const activeIds = new Set([...showIds, ...instanceIds]);
  return Object.fromEntries(
    [...showRows, ...deviceRows]
      .filter((row) => activeIds.has(row.transformerId))
      .map((row) => [row.transformerId, row.seed]),
  );
}

/** Changes one Shuffle root without touching unrelated Transformer seeds. */
export async function reshuffleTransformer(
  runId: string,
  transformerId: string,
  deviceId?: string,
): Promise<void> {
  const seed = crypto.randomUUID();
  if (deviceId === undefined) {
    await db
      .insert(runTransformerSeeds)
      .values({ runId, transformerId, seed })
      .onConflictDoUpdate({
        target: [runTransformerSeeds.runId, runTransformerSeeds.transformerId],
        set: { seed },
      });
    return;
  }
  await db
    .insert(runDeviceTransformerSeeds)
    .values({ runId, deviceId, transformerId, seed })
    .onConflictDoUpdate({
      target: [
        runDeviceTransformerSeeds.runId,
        runDeviceTransformerSeeds.deviceId,
        runDeviceTransformerSeeds.transformerId,
      ],
      set: { seed },
    });
}
