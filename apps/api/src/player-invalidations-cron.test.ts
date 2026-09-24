import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import type { RealtimeChannel, RealtimeMessage, RealtimeProvider } from "@mechane/realtime";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "./db/client";
import { devices, playerInvalidationOutbox } from "./db/schema";
import { enqueuePlayerInvalidations } from "./db/player-invalidation-outbox";
import { seedShow } from "./db/seeds/shows/navigation-proof/navigation-proof";
import { setupPostgresTest } from "./db/test-helpers";
import { handlePlayerInvalidationCronRoute } from "./player-invalidations-cron";

const { showId, createShow: createUserAndShow } = setupPostgresTest("cron-test");

async function createShow(): Promise<void> {
  await createUserAndShow("Cron Test");
  await seedShow.seed(showId);
  await db.delete(playerInvalidationOutbox).where(eq(playerInvalidationOutbox.showId, showId));
}

function providerFor(
  publish: (channel: string, type: string, payload: unknown) => Promise<void>,
): RealtimeProvider {
  return {
    channel(name: string): RealtimeChannel {
      return {
        publish: async (type, payload) => {
          await publish(name, type, payload);
          const message: RealtimeMessage<typeof payload> = {
            id: randomUUID(),
            sequence: 1,
            type,
            payload,
            publishedAt: new Date().toISOString(),
          };
          return message;
        },
        subscribe: () => ({ close: () => undefined }),
      };
    },
  };
}

async function outboxRows() {
  return db
    .select()
    .from(playerInvalidationOutbox)
    .where(eq(playerInvalidationOutbox.showId, showId))
    .orderBy(asc(playerInvalidationOutbox.createdAt), asc(playerInvalidationOutbox.id));
}

async function requestCron(
  provider: RealtimeProvider,
  options: Parameters<typeof handlePlayerInvalidationCronRoute>[2] = {},
  authorization?: string,
): Promise<{ status: number; body: unknown }> {
  const server = createServer((req, res) => {
    void handlePlayerInvalidationCronRoute(req, res, { ...options, provider });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cron test server did not start.");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cron/player-invalidations`, {
      headers: authorization ? { Authorization: authorization } : undefined,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

beforeEach(async () => {
  await db.delete(playerInvalidationOutbox).where(eq(playerInvalidationOutbox.showId, showId));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.sequential("player invalidation cron route", () => {
  it("rejects missing and incorrect credentials without draining", async () => {
    await createShow();
    await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId));
    const provider = providerFor(async () => {
      throw new Error("The provider must not be called.");
    });
    vi.stubEnv("CRON_SECRET", "cron-test-secret");

    await expect(requestCron(provider)).resolves.toMatchObject({ status: 401 });
    await expect(requestCron(provider, {}, "Bearer wrong-secret")).resolves.toMatchObject({
      status: 401,
    });
    vi.unstubAllEnvs();
    await expect(requestCron(provider, {}, "Bearer cron-test-secret")).resolves.toMatchObject({
      status: 401,
    });

    expect((await outboxRows()).every((row) => row.status === "pending")).toBe(true);
  });

  it("drains and acknowledges a pending row with the Vercel bearer token", async () => {
    await createShow();
    const deviceRows = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.showId, showId))
      .limit(1);
    const device = deviceRows[0];
    if (!device) throw new Error("Seed did not create a Device.");
    await db.transaction((tx) => enqueuePlayerInvalidations(tx, showId, [device.id]));
    const messages: Array<{ channel: string; type: string; payload: unknown }> = [];
    const provider = providerFor(async (channel, type, payload) => {
      messages.push({ channel, type, payload });
    });
    vi.stubEnv("CRON_SECRET", "cron-test-secret");

    const response = await requestCron(provider, {}, "Bearer cron-test-secret");

    expect(response).toMatchObject({
      status: 200,
      body: { claimed: 1, delivered: 1, failed: 0, budgetExceeded: false },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "player.updated",
      payload: { stateSequence: expect.any(Number) },
    });
    expect((await outboxRows())[0]).toMatchObject({ status: "delivered" });
  });

  it("stops after the time budget while rows remain pending", async () => {
    await createShow();
    const deviceRows = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.showId, showId));
    if (deviceRows.length < 2) throw new Error("Seed did not create two Devices.");
    await db.transaction((tx) =>
      enqueuePlayerInvalidations(
        tx,
        showId,
        deviceRows.map((device) => device.id),
      ),
    );
    let currentTime = 0;
    const provider = providerFor(async () => {
      currentTime += 10;
    });
    vi.stubEnv("CRON_SECRET", "cron-test-secret");

    const response = await requestCron(
      provider,
      { batchSize: 1, budgetMs: 5, now: () => currentTime },
      "Bearer cron-test-secret",
    );

    expect(response).toMatchObject({
      status: 200,
      body: { claimed: 1, delivered: 1, failed: 0, budgetExceeded: true },
    });
    expect((await outboxRows()).filter((row) => row.status === "pending")).toHaveLength(1);
  });
});
