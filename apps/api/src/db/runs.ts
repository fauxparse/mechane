import type {
  Run,
  RunStatus,
  RunState,
  ShowGraph,
  SourceValues,
  StructuredValueRecord,
  StructuredValueTemplate,
  StructuredValues,
} from "@mechane/domain";
import {
  assertValidRunState,
  coerceShapeValue,
  defaultSourceValueTemplates,
  materializeRunState,
  materializeStructuredValue,
  normalizeStructuredValueTemplate,
  preserveStructuredValueTemplateIds,
  resolveRuntimeValue,
  resolveStructuredValueTemplate,
  sourceDefaultsFor,
} from "@mechane/domain";
import { and, desc, eq } from "drizzle-orm";

import { db } from "./client";
import { drainPlayerInvalidations, enqueuePlayerInvalidations } from "./player-invalidation-outbox";
import { readShowGraph } from "./show-graph";
import {
  playerEvents,
  runDeviceStates,
  runs,
  runSourceValues,
  runStructuredValues,
  shows,
} from "./schema";

export interface RunValueLoss {
  sourceId: string;
  fieldId: string;
  fieldName: string;
  path: string[];
  reason: string;
}

export interface ReconciledRunValues extends RunState {
  runId?: string;
  losses: RunValueLoss[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;
type RunRow = typeof runs.$inferSelect;

async function readRunState(runId: string, executor: Executor): Promise<RunState> {
  const [sourceRows, structuredRows] = await Promise.all([
    executor.select().from(runSourceValues).where(eq(runSourceValues.runId, runId)),
    executor.select().from(runStructuredValues).where(eq(runStructuredValues.runId, runId)),
  ]);
  const structuredValues: StructuredValues = Object.fromEntries(
    structuredRows.map((row) => {
      const base = {
        id: row.structuredValueId,
        kind: row.kind,
        type: row.type,
      };
      const record =
        row.kind === "array"
          ? { ...base, kind: "array" as const, items: row.payload }
          : { ...base, kind: "shape" as const, fields: row.payload };
      return [row.structuredValueId, record as StructuredValueRecord];
    }),
  );
  return {
    sourceValues: Object.fromEntries(
      sourceRows.map((row) => [row.sourceId, row.value]),
    ) as SourceValues,
    structuredValues,
  };
}

async function toRun(row: RunRow, executor: Executor): Promise<Run> {
  const [show] = await executor
    .select({ stateSequence: shows.stateSequence })
    .from(shows)
    .where(eq(shows.id, row.showId));
  return {
    id: row.id as Run["id"],
    showId: row.showId as Run["showId"],
    status: row.status as RunStatus,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    stateSequence: show?.stateSequence ?? 0,
    ...(await readRunState(row.id, executor)),
  };
}

async function replaceRunState(
  executor: Executor,
  runId: string,
  graph: ShowGraph,
  state: RunState,
): Promise<void> {
  assertValidRunState(state, graph);
  await executor.delete(runSourceValues).where(eq(runSourceValues.runId, runId));
  await executor.delete(runStructuredValues).where(eq(runStructuredValues.runId, runId));
  const sourceEntries = Object.entries(state.sourceValues);
  if (sourceEntries.length > 0) {
    await executor
      .insert(runSourceValues)
      .values(sourceEntries.map(([sourceId, value]) => ({ runId, sourceId, value })));
  }
  const structuredEntries = Object.values(state.structuredValues);
  if (structuredEntries.length > 0) {
    await executor.insert(runStructuredValues).values(
      structuredEntries.map((record) => ({
        runId,
        structuredValueId: record.id,
        kind: record.kind,
        type: record.type,
        payload: record.kind === "array" ? record.items : record.fields,
      })),
    );
  }
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
export function runStateForEditedSources(
  current: RunState,
  graph: ShowGraph,
  sourceNodeIds: ReadonlySet<string>,
): RunState {
  const templates = defaultSourceValueTemplates(graph);
  const next: RunState = {
    sourceValues: { ...current.sourceValues },
    structuredValues: { ...current.structuredValues },
  };
  for (const sourceNodeId of sourceNodeIds) {
    const source = graph.nodes.find((node) => node.kind === "source" && node.id === sourceNodeId);
    if (!source || source.kind !== "source") {
      delete next.sourceValues[sourceNodeId];
      continue;
    }
    const materialized = materializeStructuredValue(
      templates[sourceNodeId] ?? null,
      source.type,
      graph.shapes ?? [],
    );
    next.sourceValues[sourceNodeId] = materialized.value;
    Object.assign(next.structuredValues, materialized.structuredValues);
  }
  assertValidRunState(next, graph);
  return next;
}

export async function syncActiveRunSourceValues(
  showId: string,
  graph: ShowGraph,
  sourceNodeIds: ReadonlySet<string>,
  executor: Executor = db,
): Promise<boolean> {
  if (sourceNodeIds.size === 0) return false;
  if (executor === db) {
    return db.transaction((tx) => syncActiveRunSourceValues(showId, graph, sourceNodeIds, tx));
  }
  const [row] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1)
    .for("update");
  if (!row) return false;
  const current = await readRunState(row.id, executor);
  await replaceRunState(
    executor,
    row.id,
    graph,
    runStateForEditedSources(current, graph, sourceNodeIds),
  );
  return true;
}

export async function readActiveRun(showId: string, executor: Executor = db): Promise<Run | null> {
  const [row] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1);
  return row ? toRun(row, executor) : null;
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
      })
      .returning();
    if (!row) throw new Error(`Failed to start a Run for Show "${showId}".`);
    const state = materializeRunState(graph, defaultSourceValueTemplates(graph));
    await replaceRunState(tx, row.id, graph, state);
    await initializeRunDeviceStates(tx, row.id, showId, graph, graph.version);
    await enqueuePlayerInvalidations(tx, showId);
    return toRun(row, tx);
  });
  try {
    await drainPlayerInvalidations({ showId });
  } catch {
    // The worker retries the committed outbox row if the provider is down.
  }
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
  if (executor === db) {
    return db.transaction((tx) => reconcileActiveRunValues(showId, oldGraph, newGraph, tx));
  }
  const [row] = await executor
    .select()
    .from(runs)
    .where(and(eq(runs.showId, showId), eq(runs.status, "active")))
    .orderBy(desc(runs.startedAt))
    .limit(1)
    .for("update");
  if (!row) return { sourceValues: {}, structuredValues: {}, losses: [] };

  const current = await readRunState(row.id, executor);
  const oldSources = new Map(
    oldGraph.nodes.filter((node) => node.kind === "source").map((node) => [node.id, node]),
  );
  const templates = defaultSourceValueTemplates(newGraph);
  const next: RunState = {
    sourceValues: {},
    structuredValues: { ...current.structuredValues },
  };
  const losses: RunValueLoss[] = [];

  for (const source of newGraph.nodes) {
    if (source.kind !== "source") continue;
    const previous = oldSources.get(source.id);
    const currentValue = current.sourceValues[source.id];
    if (
      previous?.kind === "source" &&
      currentValue !== undefined &&
      (typeof source.type === "string" || source.type.kind === "array") &&
      JSON.stringify(previous.type) === JSON.stringify(source.type)
    ) {
      next.sourceValues[source.id] = currentValue;
      continue;
    }

    let template: StructuredValueTemplate = templates[source.id] ?? null;
    const previousType = previous?.kind === "source" ? previous.type : null;
    const sourceType = source.type;
    if (
      previousType !== null &&
      typeof previousType === "object" &&
      previousType.kind === "shape" &&
      typeof sourceType === "object" &&
      sourceType.kind === "shape" &&
      currentValue !== undefined
    ) {
      const oldShapeId = previousType.shapeId;
      const newShapeId = sourceType.shapeId;
      const oldShape = oldGraph.shapes?.find((shape) => shape.id === oldShapeId);
      const newShape = newGraph.shapes?.find((shape) => shape.id === newShapeId);
      if (oldShape && newShape) {
        const overrides = Object.fromEntries(
          sourceDefaultsFor(newGraph, source.id)
            .filter((override) => override.fieldPath.length === 1)
            .map((override) => [
              override.fieldPath[0],
              resolveStructuredValueTemplate(override.value as StructuredValueTemplate),
            ]),
        );
        const result = coerceShapeValue(
          resolveRuntimeValue(currentValue, current.structuredValues),
          oldShape,
          newShape,
          [...(oldGraph.shapes ?? []), ...(newGraph.shapes ?? [])],
          overrides,
        );
        template = preserveStructuredValueTemplateIds(
          normalizeStructuredValueTemplate(result.value, source.type, newGraph.shapes ?? []),
          source.type,
          currentValue,
          current.structuredValues,
          newGraph.shapes ?? [],
        );
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
    }
    const materialized = materializeStructuredValue(template, source.type, newGraph.shapes ?? []);
    next.sourceValues[source.id] = materialized.value;
    Object.assign(next.structuredValues, materialized.structuredValues);
  }

  await replaceRunState(executor, row.id, newGraph, next);
  return { runId: row.id, ...next, losses };
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
      await enqueuePlayerInvalidations(tx, showId);
    }
    return row ? toRun(row, tx) : null;
  });
  if (run) {
    try {
      await drainPlayerInvalidations({ showId });
    } catch {
      // The worker retries the committed outbox row if the provider is down.
    }
  }
  return run;
}
