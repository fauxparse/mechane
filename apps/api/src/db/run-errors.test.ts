import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "./client";
import {
  listRunErrors,
  recordRunError,
  RunConfigurationError,
  withRunErrorLog,
} from "./run-errors";
import { endRun, startRun } from "./runs";
import { playerEvents, runErrors, shows, user } from "./schema";
import { readShowGraph } from "./show-graph";
import { seedShow } from "./seeds/shows/navigation-proof/navigation-proof";

const userId = `run-errors-db-test-${crypto.randomUUID()}`;
const showId = `run-errors-db-show-${crypto.randomUUID()}`;

async function createShow(): Promise<void> {
  await db.insert(user).values({
    id: userId,
    name: "Run Errors DB Test",
    email: `${userId}@example.test`,
    emailVerified: true,
  });
  await db.insert(shows).values({ id: showId, name: "Run Errors DB Test", userId });
  await seedShow.seed(showId);
}

async function proofDevice(): Promise<{ id: string; pairingCode: string }> {
  const graph = await readShowGraph(showId, "published");
  const device = graph.nodes.find((node) => node.kind === "device");
  if (device?.kind !== "device" || !device.pairingCode)
    throw new Error("Proof Device is incomplete.");
  return { id: device.id, pairingCode: device.pairingCode };
}

/** Spaces entries out so the newest-first ordering has something to order by. */
async function backdate(id: string, occurredAt: Date): Promise<void> {
  await db.update(runErrors).set({ occurredAt }).where(eq(runErrors.id, id));
}

afterEach(async () => {
  await db.delete(user).where(eq(user.id, userId));
});

describe("the Run error log", () => {
  it("records failures that happened before any Run existed", async () => {
    await createShow();
    const recorded = await recordRunError({
      showId,
      runId: null,
      category: "deviceWithoutFlow",
      deviceId: "dnoflow",
      publishedGraphVersion: 1,
    });

    expect(recorded.runId).toBeNull();
    expect(await listRunErrors(showId)).toEqual([recorded]);
  });

  it("reads a Show's log newest first, bounded by the requested limit", async () => {
    await createShow();
    const first = await recordRunError({ showId, runId: null, category: "deviceWithoutFlow" });
    const second = await recordRunError({ showId, runId: null, category: "missingSceneCanvas" });
    const third = await recordRunError({ showId, runId: null, category: "invalidInteractions" });
    await backdate(first.id, new Date("2026-01-01T00:00:00Z"));
    await backdate(second.id, new Date("2026-01-02T00:00:00Z"));
    await backdate(third.id, new Date("2026-01-03T00:00:00Z"));

    expect((await listRunErrors(showId)).map((error) => error.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
    expect((await listRunErrors(showId, { limit: 2 })).map((error) => error.id)).toEqual([
      third.id,
      second.id,
    ]);
  });

  it("filters by Run and by category", async () => {
    await createShow();
    const run = await startRun(showId);
    const inRun = await recordRunError({
      showId,
      runId: run.id,
      category: "missingNavigationState",
      deviceId: "ddevice",
    });
    const beforeRun = await recordRunError({
      showId,
      runId: null,
      category: "deviceWithoutFlow",
      deviceId: "ddevice",
    });

    expect(await listRunErrors(showId, { runId: run.id })).toEqual([inRun]);
    expect(await listRunErrors(showId, { category: "deviceWithoutFlow" })).toEqual([beforeRun]);
    expect(await listRunErrors(showId, { category: "invalidNavigateAction" })).toEqual([]);
    expect(await listRunErrors(showId)).toHaveLength(2);
  });

  it("outlives the Event ledger that ending a Run drops", async () => {
    await createShow();
    const device = await proofDevice();
    const run = await startRun(showId);
    await db.insert(playerEvents).values({
      runId: run.id,
      showId,
      deviceId: device.id,
      eventId: crypto.randomUUID(),
      publishedGraphVersion: 1,
      observedSceneId: "scene_red",
      elementId: "element",
      eventKind: "tap",
      outcome: "applied",
      resultingSceneId: "scene_green",
    });
    await recordRunError({
      showId,
      runId: run.id,
      category: "invalidInteractions",
      deviceId: device.id,
      sceneId: "scene_red",
    });

    await endRun(showId);

    // The ledger exists to make a retried Event idempotent within one Run, so
    // it goes with the Run. The log exists for the post-mortem, so it stays —
    // and it stays attributed to the Run it happened in.
    expect(await db.select().from(playerEvents).where(eq(playerEvents.runId, run.id))).toEqual([]);
    const remaining = await listRunErrors(showId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ runId: run.id, category: "invalidInteractions" });
  });

  it("records a pre-Run failure and still hands the caller the error", async () => {
    await createShow();
    // `readPlayerSession` is the one path that reads published configuration
    // before a Run exists, and its only failure — a Scene with no Canvas — is
    // held off by the deferred `canvases_owner_presence` trigger
    // (drizzle/0013_canvas-presence.sql), so the state cannot be staged from
    // here. What is worth pinning down is the wrapper every such site goes
    // through: the entry is written on its own connection, and the failure
    // still reaches the caller unchanged rather than being swallowed by
    // having been logged.
    const failure = new RunConfigurationError({
      showId,
      runId: null,
      category: "missingSceneCanvas",
      deviceId: "ddevice",
      sceneId: "scene_green",
      publishedGraphVersion: 2,
    });

    await expect(withRunErrorLog(() => Promise.reject(failure))).rejects.toBe(failure);

    const logged = await listRunErrors(showId);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      showId,
      runId: null,
      category: "missingSceneCanvas",
      deviceId: "ddevice",
      sceneId: "scene_green",
      publishedGraphVersion: 2,
    });
  });

  it("leaves an unrelated failure entirely alone", async () => {
    await createShow();
    const unrelated = new Error("Postgres went away.");

    await expect(withRunErrorLog(() => Promise.reject(unrelated))).rejects.toBe(unrelated);

    expect(await listRunErrors(showId)).toEqual([]);
  });
});
