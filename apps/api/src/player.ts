import { createHash } from "node:crypto";

import type { GraphNode, ShowGraph } from "@mechane/domain/graph";
import { PAIRING_CODE_PATTERN } from "@mechane/domain/pairing-code";
import type { Run } from "@mechane/domain/runs";
import { transformerSnapshot } from "@mechane/domain/scene-variable-values";
import { and, eq, isNull } from "drizzle-orm";

import { readCanvas } from "./db/canvas";
import { db } from "./db/client";
import { listImageAssets } from "./db/images";
import { recordRunError, RunConfigurationError, withRunErrorLog } from "./db/run-errors";
import { readActiveRun, readRunDeviceState, type RunDeviceState } from "./db/runs";
import { readOrCreateTransformerSeeds } from "./db/transformer-seeds";
import { devices } from "./db/schema";
import { readShowGraph, type StoredShowGraph } from "./db/show-graph";
import { issueRealtimeGrant } from "./realtime-grants";
import { publishShowEvent } from "./show-events";

function sceneForDevice(
  graph: ShowGraph,
  deviceId: string,
  state: RunDeviceState | null,
): GraphNode | null {
  const edge = graph.edges.find(
    (candidate) => candidate.kind === "device" && candidate.targetId === deviceId,
  );
  if (!edge) return null;

  const source = graph.nodes.find((node) => node.id === edge.sourceId);
  if (source?.kind === "scene") return source;
  if (source?.kind !== "flow") return null;

  const device = graph.nodes.find((node) => node.id === deviceId);
  const sceneId =
    device?.kind === "device" && device.perConnection
      ? source.defaultSceneId
      : state?.activeSceneId;
  if (sceneId === null || sceneId === undefined) return null;
  const scene = graph.nodes.find((node) => node.id === sceneId);
  return scene?.kind === "scene" && scene.parentId === source.id ? scene : null;
}

async function flowBundleForDevice(
  showId: string,
  runId: string | null,
  graph: StoredShowGraph,
  deviceId: string,
  perConnection: boolean,
) {
  if (!perConnection) return null;
  const driver = graph.edges.find((edge) => edge.kind === "device" && edge.targetId === deviceId);
  const flow = driver
    ? graph.nodes.find((node) => node.id === driver.sourceId && node.kind === "flow")
    : undefined;
  if (!flow || flow.kind !== "flow") return null;
  const scenes = graph.nodes.filter(
    (node): node is Extract<GraphNode, { kind: "scene" }> =>
      node.kind === "scene" && node.parentId === flow.id,
  );
  const transformers = graph.nodes.filter(
    (node): node is Extract<GraphNode, { kind: "transformer" }> =>
      node.kind === "transformer" && node.parentId === flow.id,
  );
  const sceneCanvases = await Promise.all(
    scenes.map(async (scene) => {
      const canvas = await readCanvas(showId, "published", { sceneNodeId: scene.id });
      if (!canvas) {
        throw new RunConfigurationError({
          showId,
          runId,
          category: "missingSceneCanvas",
          deviceId,
          sceneId: scene.id,
          publishedGraphVersion: graph.version,
        });
      }
      return { scene, canvas };
    }),
  );
  return {
    flowId: flow.id,
    defaultSceneId: flow.defaultSceneId,
    scenes: sceneCanvases,
    transformers,
  };
}

/**
 * The graph a Player session carries. Scene assignment edges and the
 * Devices nothing reads from stay on the server, so a phone doesn't learn
 * every other Device's pairing code. A Device whose outputs are wired into
 * the graph (its QR Code, Join code or Address, #836) stays: its address is
 * on show by design, and a projector draws it for that Device.
 */
export function playerSessionGraph<T extends ShowGraph>(graph: T): T {
  const wiredDevices = new Set(
    graph.edges.flatMap((edge) => (edge.kind === "wiring" ? [edge.sourceId] : [])),
  );
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.kind !== "device" || wiredDevices.has(node.id)),
    edges: graph.edges.filter((edge) => edge.kind !== "device"),
  };
}

type DeviceRow = typeof devices.$inferSelect;

async function readPairedDevice(pairingCode: string): Promise<DeviceRow | null> {
  const normalizedCode = pairingCode.trim().toUpperCase();
  if (!PAIRING_CODE_PATTERN.test(normalizedCode)) return null;
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.pairingCode, normalizedCode), isNull(devices.retiredAt)));
  return device ?? null;
}

/**
 * The published graph, the active Run and this Device's Run state, read as
 * of one moment.
 *
 * A Run's `stateSequence` is a promise about the values it is read with, so
 * both come from one `REPEATABLE READ` snapshot (#573). A sequence newer than
 * its values would make a Player discard the snapshot that holds a write.
 */
function readDeviceRunSnapshot(device: DeviceRow) {
  return db.transaction(
    async (tx) => {
      const graph = await readShowGraph(device.showId, "published", tx);
      const run = await readActiveRun(device.showId, tx);
      const state = run ? await readRunDeviceState(run.id, device.id, tx) : null;
      return { graph, run, state };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * The Run values a Player renders: stored values, plus the outputs of every
 * Transformer the server owns for this Device (ADR-0004).
 */
async function playerRunValues(device: DeviceRow, graph: StoredShowGraph, run: Run) {
  const shuffleSeeds = await readOrCreateTransformerSeeds(
    run.id,
    device.id,
    graph,
    !device.perConnection,
  );
  const transformerRuntime = transformerSnapshot(
    graph,
    run.sourceValues,
    { structuredValues: run.structuredValues, shuffleSeeds },
    new Set(
      graph.nodes
        .filter(
          (node) =>
            node.kind === "transformer" && (!device.perConnection || node.parentId === null),
        )
        .map((node) => node.id),
    ),
  );
  const failedTransformerIds = new Set(
    transformerRuntime.diagnostics.flatMap((diagnostic) =>
      diagnostic.transformerId ? [diagnostic.transformerId] : [],
    ),
  );
  await Promise.all(
    [...failedTransformerIds].map((transformerId) =>
      recordRunError({
        showId: run.showId,
        runId: run.id,
        category: "formulaEvaluationFailure",
        transformerId,
        publishedGraphVersion: graph.version,
      }).catch(() => undefined),
    ),
  );
  return {
    sourceValues: { ...run.sourceValues, ...transformerRuntime.values },
    structuredValues: { ...run.structuredValues, ...transformerRuntime.computedStructuredValues },
  };
}

/**
 * Changes whenever anything a session carries, apart from the Run's values,
 * changes: the Run, the published graph, the Scene a Shared Device shows, and
 * the identities of the Devices the graph keeps. That last one moves without
 * a publication, because a Custom Domain going live rewrites a Device's
 * address in place (#836).
 *
 * A Player holding a session can refresh only the Run's values for as long
 * as this stays the same (#881); when it differs, the Player reads the whole
 * session again.
 */
function playerSessionKey(
  graph: StoredShowGraph,
  run: Run | null,
  scene: GraphNode | null,
): string {
  const devicesShown = playerSessionGraph(graph).nodes.filter((node) => node.kind === "device");
  return createHash("sha256")
    .update(JSON.stringify([graph.version, run?.id ?? null, scene?.id ?? null, devicesShown]))
    .digest("base64url");
}

/** Returns the authoritative snapshot a paired Player needs to render. */
export async function readPlayerSession(
  pairingCode: string,
  { connecting = false }: { connecting?: boolean } = {},
) {
  const device = await readPairedDevice(pairingCode);
  if (!device) return null;

  const [{ graph, run, state }, imageAssets] = await Promise.all([
    readDeviceRunSnapshot(device),
    listImageAssets(device.showId),
  ]);
  const deviceNode = graph.nodes.find((node) => node.id === device.id);
  // A per-connection Device carries its whole Flow, so this is where an
  // unrenderable Scene surfaces — and it surfaces whether or not a Run has
  // started, which is exactly the pre-Run failure the log has to cover.
  const flow = await withRunErrorLog(() =>
    flowBundleForDevice(device.showId, run?.id ?? null, graph, device.id, device.perConnection),
  );
  const scene = device.perConnection ? null : sceneForDevice(graph, device.id, state);
  const canvas = scene
    ? await readCanvas(device.showId, "published", { sceneNodeId: scene.id })
    : null;
  const values = run ? await playerRunValues(device, graph, run) : null;
  const playerGraph = playerSessionGraph(graph);
  const deviceName = deviceNode?.name ?? device.id;
  // A Device that connects to a stopped Show only waits. Whoever is editing
  // the Show is asked to start it, since that step is easy to forget (#467).
  // Only a connection asks: a Player refreshing because a Run ended or the
  // Show was published is not someone trying to join.
  if (connecting && !run) {
    await publishShowEvent(device.showId, {
      type: "device.waiting",
      payload: { deviceId: device.id, deviceName },
    });
  }
  const grant = issueRealtimeGrant({ kind: "player", deviceId: device.id });
  return {
    device: {
      name: deviceName,
      perConnection: device.perConnection,
    },
    realtime: {
      channel: grant.channel,
      grant: grant.token,
      expiresAt: new Date(grant.expiresAt).toISOString(),
    },
    sessionKey: playerSessionKey(graph, run, scene),
    run:
      run && values
        ? {
            id: run.id,
            showId: run.showId,
            status: run.status,
            startedAt: run.startedAt.toISOString(),
            endedAt: run.endedAt?.toISOString() ?? null,
            stateSequence: run.stateSequence,
            ...values,
          }
        : null,
    flow,
    graph: playerGraph,
    scene,
    canvas,
    blocks: playerGraph.blocks ?? [],
    imageAssets,
  };
}

/**
 * The part of a Player session that changes when Show state does (#881).
 *
 * Null when the pairing code is not active or no Run is. Either way the
 * Player reads its whole session again, which is what tells it which.
 */
export async function readPlayerRunState(pairingCode: string) {
  const device = await readPairedDevice(pairingCode);
  if (!device) return null;
  const { graph, run, state } = await readDeviceRunSnapshot(device);
  if (!run) return null;
  const scene = device.perConnection ? null : sceneForDevice(graph, device.id, state);
  return {
    sessionKey: playerSessionKey(graph, run, scene),
    stateSequence: run.stateSequence,
    ...(await playerRunValues(device, graph, run)),
  };
}
