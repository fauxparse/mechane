import type { ShowGraph } from "@mechane/domain/graph";
import { showChannel, type RealtimeMessage, type RealtimeSubscription } from "@mechane/realtime";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./db/client";
import { endRun, readRunDeviceState, startRun } from "./db/runs";
import { publishShowGraph, readShowGraph, writeShowGraph } from "./db/show-graph";
import { runDeviceStates } from "./db/schema";
import { setupPostgresTest } from "./db/test-helpers";
import { readPlayerSession } from "./player";
import { realtimeProvider } from "./realtime";
import { verifyRealtimeGrant } from "./realtime-grants";
const { showId, createShow } = setupPostgresTest("player-state-test");

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
      kind: "player",
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

describe("Player session graph", () => {
  it("carries a Device another Device's Scene reads from, with its live address", async () => {
    await createShow();
    const wiredGraph: ShowGraph = {
      nodes: [
        ...graph.nodes.map((node) =>
          node.id === "scene_red"
            ? {
                ...node,
                variables: [{ id: "variable_address", name: "Address", type: "text" as const }],
              }
            : node,
        ),
        {
          id: "device_audience",
          kind: "device",
          name: "Audience",
          position: { x: 0, y: 0 },
          parentId: null,
          perConnection: true,
          pairingCode: null,
        },
        {
          id: "device_unwired",
          kind: "device",
          name: "Unwired",
          position: { x: 0, y: 0 },
          parentId: null,
          perConnection: false,
          pairingCode: null,
        },
      ],
      edges: [
        ...graph.edges,
        {
          id: "edge_audience_address",
          kind: "wiring",
          sourceId: "device_audience",
          targetId: "scene_red",
          sourcePath: ["address"],
          targetPath: ["variable_address"],
        },
      ],
    };
    await writeShowGraph(showId, "draft", wiredGraph);
    await publishShowGraph(showId);
    const published = await readShowGraph(showId, "published");
    const projector = published.nodes.find((node) => node.id === "device_navigation");
    if (projector?.kind !== "device" || !projector.pairingCode) throw new Error("No code.");

    const session = await readPlayerSession(projector.pairingCode);
    const devices = session?.graph.nodes.filter((node) => node.kind === "device") ?? [];

    expect(devices.map((node) => node.id)).toEqual(["device_audience"]);
    expect(devices[0]).toMatchObject({ pairingCode: expect.any(String), liveDomain: null });
    expect(session?.graph.edges.some((edge) => edge.kind === "device")).toBe(false);
  });
});

describe("Player session on a stopped Show", () => {
  const subscriptions: RealtimeSubscription[] = [];
  afterEach(() => {
    for (const subscription of subscriptions.splice(0)) subscription.close();
  });

  /** Device waiting notices published on the Show's channel from here on. */
  function listenForWaitingDevices(): RealtimeMessage[] {
    const messages: RealtimeMessage[] = [];
    // The test adapter replays its history to a new subscriber, synchronously.
    let live = false;
    subscriptions.push(
      realtimeProvider.channel(showChannel(showId)).subscribe((message) => {
        if (live && message.type === "device.waiting") messages.push(message);
      }),
    );
    live = true;
    return messages;
  }

  async function pairedDevice() {
    await createShow();
    await writeShowGraph(showId, "draft", graph);
    await publishShowGraph(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.kind === "device");
    if (device?.kind !== "device" || !device.pairingCode) throw new Error("Pairing code missing.");
    return { id: device.id, pairingCode: device.pairingCode };
  }

  it("asks the Show's Studio windows to start it when a Device connects", async () => {
    const device = await pairedDevice();
    const waiting = listenForWaitingDevices();

    const session = await readPlayerSession(device.pairingCode, { connecting: true });

    expect(session?.run).toBeNull();
    expect(waiting.map((message) => message.payload)).toEqual([
      { deviceId: device.id, deviceName: "Navigation Device" },
    ]);
  });

  it("does not ask when a connected Player refreshes after its Run ends", async () => {
    const device = await pairedDevice();
    await startRun(showId);
    await endRun(showId);
    const waiting = listenForWaitingDevices();

    await readPlayerSession(device.pairingCode);

    expect(waiting).toEqual([]);
  });

  it("does not ask when the Show is already running", async () => {
    const device = await pairedDevice();
    await startRun(showId);
    const waiting = listenForWaitingDevices();

    await readPlayerSession(device.pairingCode, { connecting: true });

    expect(waiting).toEqual([]);
  });
});
