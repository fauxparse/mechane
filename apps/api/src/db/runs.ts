import { playerChannel, runChannel } from "@mechane/realtime";
import type { Run, RunStatus, ShowGraph, SourceValues } from "@mechane/domain";
import { coerceShapeValue, defaultSourceValues, sourceDefaultsFor } from "@mechane/domain";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "./client";
import { realtimeProvider } from "../realtime";
import { readShowGraph } from "./show-graph";
import { devices, playerEvents, runDeviceStates, runs, shows } from "./schema";

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

/** Notifies every paired Player for a Show that its snapshot may have changed. */
export async function publishPlayerUpdates(showId: string): Promise<void> {
  const rows = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.showId, showId), isNull(devices.retiredAt)));
  await Promise.all(
    rows.map(({ id }) =>
      realtimeProvider.channel(playerChannel(id)).publish("player.updated", null),
    ),
  );
}

export interface RunDeviceState {
  runId: string;
  showId: string;
  deviceId: string;
  flowId: string;
  activeSceneId: string | null;
  publishedGraphVersion: number;
}

function toRunDeviceState(row: typeof runDeviceStates.$inferSelect): RunDeviceState {
  return {
    runId: row.runId,
    showId: row.showId,
    deviceId: row.deviceId,
    flowId: row.flowId,
    activeSceneId: row.activeSceneId,
    publishedGraphVersion: row.publishedGraphVersion,
  };
}

export async function readRunDeviceState(
  runId: string,
  deviceId: string,
  executor: Executor = db,
): Promise<RunDeviceState | null> {
  const [row] = await executor
    .select()
    .from(runDeviceStates)
    .where(and(eq(runDeviceStates.runId, runId), eq(runDeviceStates.deviceId, deviceId)));
  return row ? toRunDeviceState(row) : null;
}

interface FlowDeviceDriver {
  deviceId: string;
  flowId: string;
  defaultSceneId: string | null;
}

function flowDeviceDrivers(graph: ShowGraph): FlowDeviceDriver[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges.flatMap((edge) => {
    if (edge.kind !== "device") return [];
    const device = nodesById.get(edge.targetId);
    const flow = nodesById.get(edge.sourceId);
    if (device?.kind !== "device" || device.perConnection || flow?.kind !== "flow") return [];
    return [{ deviceId: device.id, flowId: flow.id, defaultSceneId: flow.defaultSceneId }];
  });
}

export async function initializeRunDeviceStates(
  tx: Tx,
  runId: string,
  showId: string,
  graph: ShowGraph,
  publishedGraphVersion: number,
): Promise<void> {
  const drivers = flowDeviceDrivers(graph);
  if (drivers.length === 0) return;
  await tx.insert(runDeviceStates).values(
    drivers.map((driver) => ({
      runId,
      showId,
      deviceId: driver.deviceId,
      flowId: driver.flowId,
      activeSceneId: driver.defaultSceneId,
      publishedGraphVersion,
    })),
  );
}

export async function reconcileActiveRunDeviceStates(
  showId: string,
  graph: ShowGraph,
  publishedGraphVersion: number,
  executor: Executor = db,
): Promise<void> {
  const [run] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1)
    .for("update");
  if (!run) return;

  const states = await executor
    .select()
    .from(runDeviceStates)
    .where(eq(runDeviceStates.runId, run.id))
    .for("update");
  const drivers = new Map(flowDeviceDrivers(graph).map((driver) => [driver.deviceId, driver]));
  const scenes = new Map(
    graph.nodes.filter((node) => node.kind === "scene").map((scene) => [scene.id, scene]),
  );
  const seen = new Set<string>();

  for (const state of states) {
    const driver = drivers.get(state.deviceId);
    if (!driver) {
      await executor
        .delete(runDeviceStates)
        .where(
          and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, state.deviceId)),
        );
      continue;
    }
    seen.add(driver.deviceId);
    const preserve =
      state.flowId === driver.flowId &&
      state.activeSceneId !== null &&
      scenes.get(state.activeSceneId)?.parentId === driver.flowId;
    await executor
      .update(runDeviceStates)
      .set({
        flowId: driver.flowId,
        activeSceneId: preserve ? state.activeSceneId : driver.defaultSceneId,
        publishedGraphVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, state.deviceId)));
  }

  const missing = [...drivers.values()].filter((driver) => !seen.has(driver.deviceId));
  if (missing.length > 0) {
    await executor.insert(runDeviceStates).values(
      missing.map((driver) => ({
        runId: run.id,
        showId,
        deviceId: driver.deviceId,
        flowId: driver.flowId,
        activeSceneId: driver.defaultSceneId,
        publishedGraphVersion,
      })),
    );
  }
}

/** Replaces the live values for Sources edited in the director. */
export function sourceValuesForEditedSources(
  current: SourceValues,
  graph: ShowGraph,
  sourceNodeIds: ReadonlySet<string>,
): SourceValues {
  const defaults = defaultSourceValues(graph);
  const next = { ...current };
  for (const sourceNodeId of sourceNodeIds) {
    if (sourceNodeId in defaults) next[sourceNodeId] = defaults[sourceNodeId];
    else delete next[sourceNodeId];
  }
  return next;
}

export async function syncActiveRunSourceValues(
  showId: string,
  graph: ShowGraph,
  sourceNodeIds: ReadonlySet<string>,
  executor: Executor = db,
): Promise<boolean> {
  if (sourceNodeIds.size === 0) return false;
  const [run] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1)
    .for("update");
  if (!run) return false;
  const sourceValues = sourceValuesForEditedSources(
    run.sourceValues as SourceValues,
    graph,
    sourceNodeIds,
  );
  await executor
    .update(runs)
    .set({ sourceValues, updatedAt: new Date() })
    .where(eq(runs.id, run.id));
  return true;
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
    await initializeRunDeviceStates(tx, row.id, showId, graph, graph.version);
    return toRun(row);
  });
  await Promise.all([
    realtimeProvider.channel(runChannel(run.id)).publish("run.started", run),
    publishPlayerUpdates(showId),
  ]);
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
      sourceDefaultsFor(newGraph, source.id)
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
    if (row) {
      await tx.delete(runDeviceStates).where(eq(runDeviceStates.runId, row.id));
      await tx.delete(playerEvents).where(eq(playerEvents.runId, row.id));
    }
    return row ? toRun(row) : null;
  });
  if (run) {
    await Promise.all([
      realtimeProvider.channel(runChannel(run.id)).publish("run.ended", run),
      publishPlayerUpdates(showId),
    ]);
  }
  return run;
}
