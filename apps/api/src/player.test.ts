import type { ShowGraph } from "@mechane/domain";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./db/client";
import { readRunDeviceState, startRun } from "./db/runs";
import { publishShowGraph, readShowGraph, writeShowGraph } from "./db/show-graph";
import { runDeviceStates, shows, user } from "./db/schema";
import { readPlayerSession } from "./player";
import { verifyRealtimeGrant } from "./realtime-grants";
const userId = `player-state-test-${crypto.randomUUID()}`;
const showId = `player-state-show-${crypto.randomUUID()}`;

const graph: ShowGraph = {
  nodes: [
    {
      id: "flow_navigation",
      kind: "flow",
      name: "Navigation",
      position: { x: 0, y: 0 },
      parentId: null,
      defaultSceneId: "scene_red",
    },
    {
      id: "scene_red",
      kind: "scene",
      name: "Red",
      position: { x: 0, y: 0 },
      parentId: "flow_navigation",
      variables: [],
    },
    {
      id: "scene_green",
      kind: "scene",
      name: "Green",
      position: { x: 0, y: 0 },
      parentId: "flow_navigation",
      variables: [],
    },
    {
      id: "device_navigation",
      kind: "device",
      name: "Navigation Device",
      position: { x: 0, y: 0 },
      parentId: null,
      perConnection: false,
      pairingCode: null,
    },
  ],
  edges: [
    {
      id: "edge_navigation_device",
      kind: "device",
      sourceId: "flow_navigation",
      targetId: "device_navigation",
      sourcePath: [],
      targetPath: [],
    },
  ],
};

async function createShow(): Promise<void> {
  await db.insert(user).values({
    id: userId,
    name: "Player State Test",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(shows).values({
    id: showId,
    name: "Player State Test",
    userId,
  });
}

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("Player session runtime Scene", () => {
  it("reads Flow-driven Shared Device Scene from Run state", async () => {
    await createShow();
    await writeShowGraph(showId, "draft", graph);
    await publishShowGraph(showId);
    const run = await startRun(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.kind === "device");
    if (device?.kind !== "device" || !device.pairingCode) throw new Error("Pairing code missing.");

    const session = await readPlayerSession(device.pairingCode);
    expect(session?.scene?.id).toBe("scene_red");
    expect(session?.device).not.toHaveProperty("id");
    expect(session?.realtime.channel).not.toContain(device.id);
    expect(
      session?.realtime.grant ? verifyRealtimeGrant(session.realtime.grant) : null,
    ).toMatchObject({
      deviceId: device.id,
    });
    await db
      .update(runDeviceStates)
      .set({ activeSceneId: "scene_green" })
      .where(and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, device.id)));
    expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_green");
    expect((await readPlayerSession(device.pairingCode))?.scene?.id).toBe("scene_green");
  });
  it("returns no Scene when a Flow has no default", async () => {
    await createShow();
    const graphWithoutDefault = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === "flow" ? { ...node, defaultSceneId: null } : node,
      ),
    };
    await writeShowGraph(showId, "draft", graphWithoutDefault);
    await publishShowGraph(showId);
    await startRun(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.kind === "device");
    if (device?.kind !== "device" || !device.pairingCode) throw new Error("Pairing code missing.");
    expect((await readPlayerSession(device.pairingCode))?.scene).toBeNull();
  });
  it("loads the complete published Flow bundle for a per-connection Device", async () => {
    await createShow();
    const audienceGraph: ShowGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === "device" ? { ...node, perConnection: true } : node,
      ),
    };
    await writeShowGraph(showId, "draft", audienceGraph);
    await publishShowGraph(showId);
    await startRun(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.kind === "device");
    if (device?.kind !== "device" || !device.pairingCode) throw new Error("Pairing code missing.");

    const session = await readPlayerSession(device.pairingCode);
    expect(session?.scene).toBeNull();
    expect(session?.canvas).toBeNull();
    expect(session?.flow?.flowId).toBe("flow_navigation");
    expect(session?.flow?.defaultSceneId).toBe("scene_red");
    expect(
      session?.flow?.scenes.map(({ scene, canvas }) => [scene.id, canvas.ownerId]).sort(),
    ).toEqual([
      ["scene_green", "scene_green"],
      ["scene_red", "scene_red"],
    ]);
  });
});
