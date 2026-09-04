import type { GraphNode, ShowGraph } from "@mechane/domain";
import { and, eq, isNull } from "drizzle-orm";

import { readCanvas } from "./db/canvas";
import { db } from "./db/client";
import { listImageAssets } from "./db/images";
import { RunConfigurationError, withRunErrorLog } from "./db/run-errors";
import { readActiveRun, readRunDeviceState, type RunDeviceState } from "./db/runs";
import { devices } from "./db/schema";
import { readShowGraph, type StoredShowGraph } from "./db/show-graph";
import { issueRealtimeGrant } from "./realtime-grants";

const PAIRING_CODE_PATTERN = /^[A-HJ-KM-NP-Z1-9]{5}$/;

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
  return { flowId: flow.id, defaultSceneId: flow.defaultSceneId, scenes: sceneCanvases };
}
/** Returns the authoritative snapshot a paired Player needs to render. */
export async function readPlayerSession(pairingCode: string) {
  const normalizedCode = pairingCode.trim().toUpperCase();
  if (!PAIRING_CODE_PATTERN.test(normalizedCode)) return null;

  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.pairingCode, normalizedCode), isNull(devices.retiredAt)));
  if (!device) return null;

  const [graph, run, imageAssets] = await Promise.all([
    readShowGraph(device.showId, "published"),
    readActiveRun(device.showId),
    listImageAssets(device.showId),
  ]);
  const deviceNode = graph.nodes.find((node) => node.id === device.id);
  const state = run ? await readRunDeviceState(run.id, device.id) : null;
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
  const playerGraph = {
    ...graph,
    nodes: graph.nodes.filter((node) => node.kind !== "device"),
    edges: graph.edges.filter((edge) => edge.kind !== "device"),
  };
  const grant = issueRealtimeGrant(device.id);
  return {
    device: {
      name: deviceNode?.name ?? device.id,
      perConnection: device.perConnection,
    },
    realtime: {
      channel: grant.channel,
      grant: grant.token,
      expiresAt: new Date(grant.expiresAt).toISOString(),
    },
    run: run
      ? {
          id: run.id,
          showId: run.showId,
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          endedAt: run.endedAt?.toISOString() ?? null,
          sourceValues: run.sourceValues,
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
