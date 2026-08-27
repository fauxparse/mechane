import type { GraphNode, ShowGraph } from "@mechane/domain";
import { and, eq, isNull } from "drizzle-orm";

import { readCanvas } from "./db/canvas";
import { db } from "./db/client";
import { listImageAssets } from "./db/images";
import { readActiveRun } from "./db/runs";
import { devices } from "./db/schema";
import { readShowGraph } from "./db/show-graph";

const PAIRING_CODE_PATTERN = /^[A-HJ-KM-NP-Z1-9]{5}$/;

function sceneForDevice(graph: ShowGraph, deviceId: string): GraphNode | null {
  const edge = graph.edges.find(
    (candidate) => candidate.kind === "device" && candidate.targetId === deviceId,
  );
  if (!edge) return null;

  const source = graph.nodes.find((node) => node.id === edge.sourceId);
  if (source?.kind === "scene") return source;
  if (source?.kind !== "flow" || source.defaultSceneId === null) return null;

  const scene = graph.nodes.find((node) => node.id === source.defaultSceneId);
  return scene?.kind === "scene" ? scene : null;
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
  const scene = sceneForDevice(graph, device.id);
  const canvas = scene
    ? await readCanvas(device.showId, "published", { sceneNodeId: scene.id })
    : null;

  return {
    device: {
      id: device.id,
      name: deviceNode?.name ?? device.id,
      perConnection: device.perConnection,
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
    graph,
    scene,
    canvas,
    blocks: graph.blocks ?? [],
    imageAssets,
  };
}
