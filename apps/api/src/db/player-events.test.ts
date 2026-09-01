import type { ShowGraph } from "@mechane/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import { dispatchPlayerEvent, PlayerDispatchConfigurationError } from "./player-events";
import { endRun, readRunDeviceState, startRun } from "./runs";
import { publishShowGraph, readShowGraph, writeShowGraph } from "./show-graph";
import { playerEvents, playerInvalidationOutbox, runDeviceStates, shows, user } from "./schema";
import { seedShow } from "./seeds/shows/navigation-proof/navigation-proof";

const userId = `player-events-db-test-${crypto.randomUUID()}`;
const showId = `player-events-db-show-${crypto.randomUUID()}`;

async function createShow(): Promise<void> {
  await db.insert(user).values({
    id: userId,
    name: "Player Events DB Test",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(shows).values({ id: showId, name: "Player Events DB Test", userId });
  await seedShow.seed(showId);
}

async function proofDevice(): Promise<{ id: string; pairingCode: string }> {
  const graph = await readShowGraph(showId, "published");
  const device = graph.nodes.find((node) => node.kind === "device");
  if (device?.kind !== "device" || !device.pairingCode)
    throw new Error("Proof Device is incomplete.");
  return { id: device.id, pairingCode: device.pairingCode };
}

function event(eventId: string, sceneId: string, destinationId: string) {
  return {
    eventId,
    publishedGraphVersion: 1,
    sceneId,
    elementId: `button_${sceneId}_${destinationId}`,
    eventKind: "tap",
  } as const;
}

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("dispatchPlayerEvent", () => {
  it("applies all six Navigation Proof transitions", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);
    const transitions = [
      ["scene_red", "scene_green"],
      ["scene_green", "scene_red"],
      ["scene_red", "scene_blue"],
      ["scene_blue", "scene_red"],
      ["scene_red", "scene_green"],
      ["scene_green", "scene_blue"],
      ["scene_blue", "scene_green"],
    ] as const;

    for (const [sceneId, destinationId] of transitions) {
      const result = await dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), sceneId, destinationId),
      );
      expect(result).toMatchObject({ kind: "applied", resultingSceneId: destinationId });
    }
    expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_green");
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toHaveLength(
      7,
    );
    await endRun(showId);
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toHaveLength(
      0,
    );
  });
  it("ignores Events when there is no active Run", async () => {
    await createShow();
    const device = await proofDevice();
    await expect(
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ).resolves.toMatchObject({ kind: "ignored", reason: "no-active-run" });
  });

  it("serializes concurrent taps and records the stale loser", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);
    const results = await Promise.all([
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ]);
    expect(results.map((result) => result?.kind).sort()).toEqual(["applied", "ignored"]);
    expect(results.find((result) => result?.kind === "ignored")).toMatchObject({
      reason: "stale-scene",
    });
    expect((await readRunDeviceState(run.id, device.id))?.activeSceneId).toBe("scene_green");
  });

  it("returns safe ignored outcomes for unbound and not-ready Events", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);

    await expect(
      dispatchPlayerEvent(device.pairingCode, {
        eventId: crypto.randomUUID(),
        publishedGraphVersion: 1,
        sceneId: "scene_red",
        elementId: "missing_element",
        eventKind: "tap",
      }),
    ).resolves.toMatchObject({ kind: "ignored", reason: "unbound-event" });

    await db
      .update(runDeviceStates)
      .set({ activeSceneId: null })
      .where(eq(runDeviceStates.runId, run.id));
    await expect(
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ).resolves.toMatchObject({ kind: "ignored", reason: "not-ready" });
  });

  it("records ignored Events for a Device without navigation state", async () => {
    await createShow();
    const device = await proofDevice();
    const directGraph: ShowGraph = {
      nodes: [
        {
          id: "scene_direct",
          kind: "scene",
          name: "Direct",
          position: { x: 0, y: 0 },
          parentId: null,
          variables: [],
        },
        {
          id: "device_navigation",
          kind: "device",
          name: "Navigation Device",
          position: { x: 0, y: 100 },
          parentId: null,
          perConnection: false,
          pairingCode: null,
        },
      ],
      edges: [
        {
          id: "edge_direct_device",
          kind: "device",
          sourceId: "scene_direct",
          targetId: "device_navigation",
          sourcePath: [],
          targetPath: [],
        },
      ],
    };
    await writeShowGraph(showId, "draft", directGraph);
    await publishShowGraph(showId);
    const run = await startRun(showId);
    await expect(
      dispatchPlayerEvent(device.pairingCode, {
        eventId: crypto.randomUUID(),
        publishedGraphVersion: 1,
        sceneId: "scene_red",
        elementId: "button_scene_red_scene_green",
        eventKind: "tap",
      }),
    ).resolves.toMatchObject({ kind: "ignored", reason: "no-navigation-state" });
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toHaveLength(
      1,
    );
  });
  it("fails closed when persisted navigation configuration is contradictory", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);
    await db
      .update(runDeviceStates)
      .set({ flowId: "missing_flow" })
      .where(eq(runDeviceStates.runId, run.id));

    await expect(
      dispatchPlayerEvent(
        device.pairingCode,
        event(crypto.randomUUID(), "scene_red", "scene_green"),
      ),
    ).rejects.toBeInstanceOf(PlayerDispatchConfigurationError);
  });
  it("accepts per-connection Events without server navigation state", async () => {
    await createShow();
    const draft = await readShowGraph(showId, "draft");
    const audienceGraph: ShowGraph = {
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.kind === "device" ? { ...node, perConnection: true } : node,
      ),
    };
    await writeShowGraph(showId, "draft", audienceGraph);
    await publishShowGraph(showId);
    const run = await startRun(showId);
    const published = await readShowGraph(showId, "published");
    const device = published.nodes.find((node) => node.kind === "device");
    if (device?.kind !== "device" || !device.pairingCode)
      throw new Error("Audience Device is incomplete.");
    const beforeOutbox = await db
      .select()
      .from(playerInvalidationOutbox)
      .where(eq(playerInvalidationOutbox.showId, showId));
    const input = event(crypto.randomUUID(), "scene_red", "scene_green");
    const result = await dispatchPlayerEvent(device.pairingCode, {
      ...input,
      publishedGraphVersion: published.version,
    });

    expect(result).toEqual({ kind: "accepted", eventId: input.eventId });
    expect(await readRunDeviceState("missing", device.id)).toBeNull();
    expect(await readRunDeviceState(run.id, device.id)).toBeNull();
    const rows = await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: "accepted",
      resultingSceneId: "scene_green",
      publishedGraphVersion: published.version,
    });
    expect(
      await db
        .select()
        .from(playerInvalidationOutbox)
        .where(eq(playerInvalidationOutbox.showId, showId)),
    ).toHaveLength(beforeOutbox.length);
  });
});
